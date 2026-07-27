from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class UserSignup(BaseModel):
    username: str
    password: str

class UserLogin(BaseModel):
    username: str
    password: str

class UserOut(BaseModel):
    id: int
    username: str

    class Config:
        from_attributes = True

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut

class MessageOut(BaseModel):
    id: int
    sender_id: int
    text: str
    ai_category: str
    created_at: datetime

    class Config:
        from_attributes = True

class ConversationOut(BaseModel):
    id: int
    user1_id: int
    user2_id: int

    class Config:
        from_attributes = True

class SummaryResponse(BaseModel):
    summary: str
