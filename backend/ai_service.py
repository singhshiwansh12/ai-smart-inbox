from google import genai
import os
from dotenv import load_dotenv

load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")
if api_key:
    client = genai.Client(api_key=api_key)
else:
    client = None

def ask_gemini_ai(text: str) -> str:
    if not client:
        return "General"
    try:
        prompt = f"""
        Message: "{text}"
        Classify this message into one of these three categories:
        "Spam", "Important", or "General".
        Return only one word, do not write anything else.
        """
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=prompt,
        )
        tag = response.text.strip()
        if tag not in ["Spam", "Important", "General"]:
            tag = "General"
        return tag
    except Exception as e:
        print("Gemini API error:", e)
        return "General"

def generate_chat_summary(messages_text: str) -> str:
    if not client:
        return "Gemini API key not configured."
    if not messages_text.strip():
        return "No messages available for summary."
    
    try:
        prompt = f"""
        Below is a chat conversation.
        Generate a brief 3-4 line summary of this chat.
        
        Chat:
        {messages_text}
        """
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=prompt,
        )
        return response.text.strip()
    except Exception as e:
        print("Gemini API error in summary:", e)
        return "Could not generate summary."
