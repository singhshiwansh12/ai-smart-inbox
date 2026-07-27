from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from database import engine, get_db, Base, SessionLocal
import models
import schemas
from auth import hash_password, verify_password, create_access_token, get_current_user
from ai_service import ask_gemini_ai, generate_chat_summary
from connection_manager import manager

# Global cache to store conversation summaries
SUMMARY_CACHE = {}

Base.metadata.create_all(bind=engine)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/signup", response_model=schemas.TokenResponse)
def signup(user_data: schemas.UserSignup, db: Session = Depends(get_db)):
    existing_user = db.query(models.User).filter(models.User.username == user_data.username).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already taken")

    new_user = models.User(
        username=user_data.username,
        password_hash=hash_password(user_data.password),
    )
    db.add(new_user)
    from sqlalchemy.exc import IntegrityError
    try:
        db.commit()
        db.refresh(new_user)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Username already taken")

    token = create_access_token({"user_id": new_user.id})
    return {"access_token": token, "user": new_user}

@app.post("/login", response_model=schemas.TokenResponse)
def login(user_data: schemas.UserLogin, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == user_data.username).first()
    if not user or not verify_password(user_data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    token = create_access_token({"user_id": user.id})
    return {"access_token": token, "user": user}

@app.get("/users", response_model=list[schemas.UserOut])
def get_all_users(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    users = db.query(models.User).filter(models.User.id != current_user.id).all()
    # Attach online status
    for u in users:
        u.is_online = manager.is_online(u.id)
    return users

@app.get("/online-users", response_model=list[int])
def get_online_users():
    return manager.get_online_users()

def get_or_create_conversation(db: Session, user1_id: int, user2_id: int):
    a, b = sorted([user1_id, user2_id])

    convo = db.query(models.Conversation).filter(
        models.Conversation.user1_id == a,
        models.Conversation.user2_id == b,
    ).first()

    if not convo:
        convo = models.Conversation(user1_id=a, user2_id=b)
        db.add(convo)
        db.commit()
        db.refresh(convo)

    return convo

@app.get("/conversation/{other_user_id}")
def get_conversation(
    other_user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    convo = get_or_create_conversation(db, current_user.id, other_user_id)

    messages = db.query(models.Message).filter(
        models.Message.conversation_id == convo.id
    ).order_by(models.Message.created_at).all()

    return {
        "conversation_id": convo.id,
        "messages": [schemas.MessageOut.model_validate(m) for m in messages],
    }

@app.get("/conversation/{other_user_id}/search")
def search_conversation(
    other_user_id: int,
    q: str = Query(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    convo = get_or_create_conversation(db, current_user.id, other_user_id)
    
    # Simple ILIKE search for keywords
    messages = db.query(models.Message).filter(
        models.Message.conversation_id == convo.id,
        models.Message.text.ilike(f"%{q}%")
    ).order_by(models.Message.created_at).all()

    return [schemas.MessageOut.model_validate(m) for m in messages]

@app.get("/conversation/{other_user_id}/summary", response_model=schemas.SummaryResponse)
def get_conversation_summary(
    other_user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    convo = get_or_create_conversation(db, current_user.id, other_user_id)

    messages = db.query(models.Message).filter(
        models.Message.conversation_id == convo.id
    ).order_by(models.Message.created_at).all()
    
    msg_count = len(messages)
    if convo.id in SUMMARY_CACHE and SUMMARY_CACHE[convo.id]["count"] == msg_count:
        return {"summary": SUMMARY_CACHE[convo.id]["summary"]}

    # Format messages for AI
    chat_text = ""
    for m in messages:
        sender_name = "Me" if m.sender_id == current_user.id else "Other"
        chat_text += f"{sender_name}: {m.text}\n"
        
    summary = generate_chat_summary(chat_text)
    SUMMARY_CACHE[convo.id] = {"count": msg_count, "summary": summary}
    return {"summary": summary}


@app.websocket("/ws/chat/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: int):
    await manager.connect(user_id, websocket)
    print(f"🟢 User {user_id} online")

    try:
        while True:
            incoming_data = await websocket.receive_json()
            msg_type = incoming_data.get("type", "chat")
            receiver_id = incoming_data.get("receiver_id")
            
            if msg_type == "typing":
                # Forward typing status
                await manager.send_to_user(receiver_id, {
                    "type": "typing",
                    "sender_id": user_id
                })
                continue
                
            text = incoming_data.get("text")

            db = SessionLocal()
            try:
                convo = get_or_create_conversation(db, user_id, receiver_id)

                new_message = models.Message(
                    conversation_id=convo.id,
                    sender_id=user_id,
                    text=text,
                    ai_category="Analyzing...",
                )
                db.add(new_message)
                db.commit()
                db.refresh(new_message)

                payload = {
                    "type": "chat",
                    "id": new_message.id,
                    "conversation_id": convo.id,
                    "sender_id": user_id,
                    "text": text,
                    "ai_category": "Analyzing...",
                }

                await manager.send_to_user(user_id, payload)
                await manager.send_to_user(receiver_id, payload)

                # API Optimization: Skip AI categorization for very short messages
                if len(text.strip()) < 15:
                    ai_tag = "General"
                else:
                    ai_tag = ask_gemini_ai(text)
                
                new_message.ai_category = ai_tag
                db.commit()

                payload["ai_category"] = ai_tag
                await manager.send_to_user(user_id, payload)
                await manager.send_to_user(receiver_id, payload)

            finally:
                db.close()

    except WebSocketDisconnect:
        await manager.disconnect(user_id)
        print(f"🔴 User {user_id} offline")
