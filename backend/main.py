import os
from dotenv import load_dotenv
load_dotenv()
import requests
import re
import json
import uuid
from typing import List, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from routers import router as api_router

app = FastAPI(title="Voice Command Shopping Assistant API")

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000", 
        "http://127.0.0.1:3000", 
        "https://voice-command-shopping-assistant-sepia.vercel.app"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")

class VoiceCommandRequest(BaseModel):
    text: str
    language: str = "en"
    current_items: List[dict] = []
    available_lists: List[str] = []

class AudioCommandRequest(BaseModel):
    audio_base64: str
    mime_type: str = "audio/webm"
    language: str = "en"
    current_items: List[dict] = []
    available_lists: List[str] = []

class IntentResponse(BaseModel):
    action: str
    target_list_name: Optional[str] = None
    new_list_name: Optional[str] = None
    items: List[dict]
    original_text: str
    follow_up_question: Optional[str] = None

class SuggestionRequest(BaseModel):
    current_items: List[dict]
    list_name: Optional[str] = None

class SuggestionResponse(BaseModel):
    suggestions: List[str]
    reason: str

def mock_nlp_parser(text: str, current_items: List[dict] = []) -> IntentResponse:
    text_lower = text.lower()
    
    number_words = {
        "one": "1", "two": "2", "three": "3", "four": "4", "five": "5",
        "six": "6", "seven": "7", "eight": "8", "nine": "9", "ten": "10",
        "a": "1", "an": "1", "some": "1",
        "half dozen": "6", "dozen": "12", "couple": "2"
    }
    
    category_map = {
        "milk": "Dairy", "cheese": "Dairy", "butter": "Dairy", "yogurt": "Dairy",
        "apple": "Produce", "apples": "Produce", "banana": "Produce", "bananas": "Produce", "potato": "Produce", "potatoes": "Produce", "carrot": "Produce", "carrots": "Produce",
        "bread": "Bakery", "cake": "Bakery", "pie": "Bakery", "bagel": "Bakery",
        "meat": "Meat", "chicken": "Meat", "beef": "Meat", "pork": "Meat", "fish": "Meat",
        "chips": "Snacks", "candy": "Snacks", "chocolate": "Snacks", "cookie": "Snacks", "cookies": "Snacks",
        "pen": "General", "pens": "General", "book": "General", "books": "General", "pencil": "General"
    }
    
    def guess_category(name: str):
        for key in category_map:
            if key in name.lower():
                return category_map[key]
        return "Groceries"
    
    # Matches: "4", "4 kg", "4kg", "4 liters", "4.5 lbs", "two"
    quantity_pattern = r'((?:\d+(?:\.\d+)?|\b(?:one|two|three|four|five|six|seven|eight|nine|ten|a|an|some)\b)(?:\s*(?:kg|g|lbs|lb|oz|liters|liter|l|ml|gallons|gallon|gal|cups|cup|packs|pack|boxes|box))?)'

    def split_quantity_name(value: str):
        value = re.sub(r'\s+', ' ', value).strip(" .")
        
        # Look for quantity at the start: "4 kg potatoes"
        match_start = re.match(rf'^{quantity_pattern}\s+(?:of\s+)?(.+)$', value)
        if match_start:
            return match_start.group(2).strip(), match_start.group(1).strip()
            
        # Look for "with quantity X"
        match_with = re.search(rf'^(.+?)\s+with\s+quantity\s+{quantity_pattern}$', value)
        if match_with:
            return match_with.group(1).strip(), match_with.group(2).strip()

        # Look for quantity at the end: "potatoes 4 kg"
        match_end = re.search(rf'^(.+?)\s+{quantity_pattern}$', value)
        if match_end:
            return match_end.group(1).strip(), match_end.group(2).strip()
            
        return value, "1"

    # Extract target list name if specified
    target_list_name = None
    new_list_name = None
    list_match = re.search(r'\b(?:to|in|from|on|delete|remove|drop)\s+(?:the\s+)?(?:list|cart)\s+(.+?)(?:\s+please|\s+now|$)', text_lower)
    if not list_match:
        list_match = re.search(r'\b(?:to|in|from|on|delete|remove|drop)\s+(?:the\s+)?(.+?)\s+(?:list|cart)\b', text_lower)
    if not list_match:
        list_match = re.search(r'\b(?:create(?:\s+a)?)\s+(?:list|cart)\s+(?:called\s+|named\s+)?(.+?)\b', text_lower)
    if not list_match:
        list_match = re.search(r'\b(?:create(?:\s+a)?)\s+(.+?)\s+(?:list|cart)\b', text_lower)
    if list_match:
        target_list_name = list_match.group(1).strip().title()

    rename_match = re.search(r'\brename\s+(?:the\s+)?(.+?)\s+(?:list|cart)?\s*(?:to|as|into)\s+(?:the\s+)?(.+?)(?:\s+(?:list|cart))?\b', text_lower)
    if rename_match:
        target_list_name = rename_match.group(1).strip().title()
        new_list_name = rename_match.group(2).strip().title()

    action = "add"
    if re.search(r'\b(remove|delete|clear|drop)\b', text_lower):
        if re.search(r'\b(?:delete|remove|drop)\s+(?:the\s+)?(.+?)\s+(?:list|cart)\b', text_lower):
            action = "delete_list"
        else:
            action = "remove"
    elif rename_match:
        action = "rename_list"
    elif re.search(r'\b(update|change|set|make)\b', text_lower):
        action = "update"
    elif re.search(r'\b(find|search|show)\b', text_lower):
        action = "search"
    elif re.search(r'\b(create)\b', text_lower):
        action = "create_list"

    items = []
    # Split by "and" or commas
    parts = re.split(r'\band\b|,', text_lower)
    for part in parts:
        part = re.sub(r'\b(add|remove|delete|buy|need|please|get|put|to|my|the|list|cart|from|in|search|find|show|create|update|change|set|make)\b', '', part)
        part = re.sub(r'\s+', ' ', part).strip()
        if not part: continue
        
        name, quantity = split_quantity_name(part)
        
        # Clean up name
        name = name.title().strip(" .")
        if not name: continue
        if name.lower() in [target_list_name.lower() if target_list_name else ""]: continue
        
        items.append({
            "id": str(uuid.uuid4()),
            "name": name,
            "quantity": quantity,
            "category": guess_category(name),
            "price": 0.0
        })
        
    if not items and action != "create_list":
        items.append({
            "id": str(uuid.uuid4()),
            "name": "Unknown Item",
            "quantity": "1",
            "category": "General",
            "price": 0.0
        })
        
    return IntentResponse(action=action, target_list_name=target_list_name, new_list_name=new_list_name, items=items, original_text=text)

def extract_json(text: str) -> dict:
    content = re.sub(r'```json\n?', '', text)
    content = re.sub(r'```\n?', '', content).strip()
    if not content.startswith("{"):
        match = re.search(r'\{.*\}', content, flags=re.DOTALL)
        if match:
            content = match.group(0)
    return json.loads(content)

@app.post("/api/parse-intent", response_model=IntentResponse)
def parse_voice_command(request: VoiceCommandRequest):
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Command text is required.")

    try:
        if not GEMINI_API_KEY:
            return mock_nlp_parser(request.text, request.current_items)

        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GEMINI_API_KEY}"
        
        lists_context = f"Lists:{','.join(request.available_lists)}" if request.available_lists else ""
        prompt = f"""Extract shopping intent. {lists_context}
Return ONLY valid JSON:
{{
  "action": "add"|"remove"|"update"|"search"|"suggest"|"delete_list"|"rename_list",
  "target_list_name": "string(optional)",
  "new_list_name": "string(optional)",
  "items": [{{"name": "string", "quantity": "string", "category": "string"}}],
  "follow_up_question": "string(optional)"
}}
RULES:
1. Extract exact quantities. "4kg potatoes" -> name:"potatoes", quantity:"4kg".
2. If the user mentions a specific list (e.g., "create a list stationary", "add to my groceries list"), you MUST extract that name into `target_list_name` (e.g., "stationary", "groceries").
3. If the user wants to add items OR create a list, ALWAYS set action to "add". The app will automatically create the list if it doesn't exist.
4. If adding items that require units but omitted (e.g. "add 4 milk"), set 'follow_up_question' to clarify. Do NOT add the item if follow_up_question is set.
Cmd: '{request.text}'"""

        payload = {"contents": [{"parts": [{"text": prompt}]}]}
        resp = requests.post(url, json=payload, headers={"Content-Type": "application/json"}, timeout=15)
        resp.raise_for_status()
        
        data = resp.json()
        content = data['candidates'][0]['content']['parts'][0]['text']
        parsed = extract_json(content)
        
        items = parsed.get("items", [])
        for item in items:
            item["id"] = str(uuid.uuid4())
            item["name"] = str(item.get("name", "Unknown Item"))
            item["quantity"] = str(item.get("quantity", "1"))
            item["category"] = str(item.get("category", "General"))
            item["price"] = float(item.get("price", 0.0))
            
        return IntentResponse(
            action=parsed.get("action", "add"), 
            target_list_name=parsed.get("target_list_name"),
            items=items, 
            original_text=request.text
        )
    except Exception as e:
        print(f"Gemini API failed, using local parser. Error: {e}")
        return mock_nlp_parser(request.text, request.current_items)

@app.post("/api/parse-audio", response_model=IntentResponse)
def parse_raw_audio(request: AudioCommandRequest):
    raise HTTPException(status_code=503, detail="Audio transcription requires GEMINI_API_KEY. Use browser speech recognition or text input.")

@app.post("/api/suggestions", response_model=SuggestionResponse)
def get_suggestions(request: SuggestionRequest):
    if not GEMINI_API_KEY:
        return SuggestionResponse(suggestions=["Milk", "Bread", "Eggs"], reason="Fallback suggestions")

    try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GEMINI_API_KEY}"
        current_names = [i.get("name", "") for i in request.current_items]
        
        prompt = f"""List Name: '{request.list_name or "General"}'
Current Items: {', '.join(current_names) if current_names else 'None'}
Return exactly 3 smart suggestions (like product pairings, seasonal items, or common staples).
Return ONLY valid JSON:
{{
  "suggestions": ["item1", "item2", "item3"],
  "reason": "Brief reason"
}}"""
        response = requests.post(url, json={"contents": [{"parts": [{"text": prompt}]}]})
        response.raise_for_status()
        
        result = response.json()
        content = result['candidates'][0]['content']['parts'][0]['text']
        parsed = extract_json(content)
        
        return SuggestionResponse(
            suggestions=parsed.get("suggestions", []),
            reason=parsed.get("reason", "Smart AI suggestions based on your list.")
        )
    except Exception as e:
        print(f"Gemini suggestions failed: {e}")
        return SuggestionResponse(suggestions=["Milk", "Bread", "Apples"], reason="Fallback suggestions")
