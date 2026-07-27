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
        Is message ko classify karo in teen categories mein se ek mein:
        "Spam", "Important", ya "General".
        Sirf ek word return karo, kuch aur mat likhna.
        """
        response = client.models.generate_content(
            model="gemini-2.5-flash",
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
        return "Koi messages nahi hain summary ke liye."
    
    try:
        prompt = f"""
        Neeche ek chat conversation di gayi hai.
        Is chat ka 3-4 line ka brief summary generate karo.
        
        Chat:
        {messages_text}
        """
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
        )
        return response.text.strip()
    except Exception as e:
        print("Gemini API error in summary:", e)
        return "Summary generate nahi ho payi."
