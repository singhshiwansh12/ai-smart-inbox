"""
ai_service.py — Google Gemini AI Engine (IMPROVED)

Improvements:
1. keyword-based quick_classify pre-filter — obvious Spam/Important skip AI call entirely.
2. AI response validated against VALID_CATEGORIES (guards against Gemini typos/case issues).
3. generate_chat_summary kept intact with same error handling.
4. classify_message() is the new public entry point to use everywhere.
"""

from google import genai
import os
from dotenv import load_dotenv

load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")
if api_key:
    client = genai.Client(api_key=api_key)
else:
    client = None

VALID_CATEGORIES = {"Important", "General", "Spam"}

# Keywords for cheap local classification (no API call needed)
SPAM_KEYWORDS = {"lottery", "winner", "click here", "free money", "act now", "subscribe now", "congratulations", "prize"}
URGENT_KEYWORDS = {"urgent", "asap", "call me", "emergency", "immediately", "right now", "help me", "important"}
MIN_AI_LENGTH = 15


def quick_classify(text: str) -> str | None:
    """
    Fast local check. Returns category if confident, None if AI should decide.
    """
    stripped = text.strip()
    lowered = stripped.lower()

    if any(kw in lowered for kw in SPAM_KEYWORDS):
        return "Spam"

    if any(kw in lowered for kw in URGENT_KEYWORDS):
        return "Important"

    if len(stripped) < MIN_AI_LENGTH:
        return "General"

    return None  # Let AI decide


def ask_gemini_ai(text: str) -> str:
    """
    Calls Gemini to classify message. Always returns a valid category, never raises.
    """
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
            model="gemini-3.5-flash-lite",
            contents=prompt,
        )
        raw = (response.text or "").strip()

        # Guard: Gemini sometimes returns extra words or wrong case
        for valid in VALID_CATEGORIES:
            if valid.lower() in raw.lower():
                return valid

        return "General"
    except Exception as e:
        print("Gemini API error:", e)
        return "General"


def classify_message(text: str) -> str:
    """
    Public entry point. Uses cheap pre-filter first, AI only if ambiguous.
    Always call this instead of ask_gemini_ai directly.
    """
    return quick_classify(text) or ask_gemini_ai(text)


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
            model="gemini-3.5-flash-lite",
            contents=prompt,
        )
        return response.text.strip()
    except Exception as e:
        print("Gemini API error in summary:", e)
        return f"Could not generate summary. Error: {str(e)}"
