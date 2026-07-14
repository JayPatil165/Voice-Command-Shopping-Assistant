import json
import os
import re
import uuid
from typing import List, Optional

import requests
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from routers import router as api_router

load_dotenv()

app = FastAPI(title="Voice Command Shopping Assistant API")

app.include_router(api_router)

def env_list(name: str, fallback: List[str]) -> List[str]:
    raw_value = os.environ.get(name)
    if not raw_value:
        return fallback
    return [value.strip() for value in raw_value.split(",") if value.strip()]


app.add_middleware(
    CORSMiddleware,
    allow_origins=env_list("FRONTEND_ORIGINS", [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://voice-command-shopping-assistant-sepia.vercel.app",
    ]),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.1-flash-lite")


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


NUMBER_WORDS = {
    "one": "1",
    "two": "2",
    "three": "3",
    "four": "4",
    "five": "5",
    "six": "6",
    "seven": "7",
    "eight": "8",
    "nine": "9",
    "ten": "10",
    "a": "1",
    "an": "1",
    "some": "1",
    "couple": "2",
    "dozen": "12",
}

SUGGESTION_CATALOG = {
    "stationery": ["Notebooks", "Pens", "Pencils", "Erasers", "Highlighters", "Stapler", "Sticky Notes", "Ruler"],
    "school": ["Notebooks", "Pens", "Pencils", "Erasers", "Highlighters", "Lunch Box", "Water Bottle", "Backpack"],
    "hardware": ["Hammer", "Nails", "Screwdriver", "Measuring Tape", "Duct Tape", "Screws", "Wrench", "Sandpaper"],
    "party": ["Paper Plates", "Disposable Cups", "Napkins", "Balloons", "Ice", "Soda", "Chips", "Cake Candles"],
    "groceries": ["Eggs", "Bread", "Rice", "Tomatoes", "Onions", "Cooking Oil", "Butter", "Yogurt"],
    "produce": ["Bananas", "Apples", "Tomatoes", "Carrots", "Lettuce", "Potatoes", "Onions"],
    "household": ["Dish Soap", "Laundry Detergent", "Trash Bags", "Paper Towels", "Toilet Paper", "Sponges"],
    "personal care": ["Toothpaste", "Shampoo", "Soap", "Deodorant", "Lotion", "Cotton Swabs"],
    "travel": ["Sunscreen", "Toothbrush", "Travel Adapter", "Snacks", "Water Bottle", "Hand Sanitizer"],
    "general": ["Batteries", "Tape", "Light Bulbs", "Trash Bags", "Hand Soap", "Paper Towels"],
}


def normalize_name(value: str) -> str:
    value = re.sub(r"[^a-z0-9\s]", " ", str(value).lower())
    value = re.sub(r"\s+", " ", value).strip()
    words = [word[:-1] if len(word) > 3 and word.endswith("s") else word for word in value.split()]
    return " ".join(words)


def title_item(value: str) -> str:
    small_words = {"of", "and", "for", "the"}
    words = re.sub(r"\s+", " ", str(value)).strip(" .").split()
    return " ".join(word if word.lower() in small_words else word.capitalize() for word in words)


def clean_list_name(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    value = re.sub(r"^(?:for|called|named|the)\s+", "", str(value).strip(), flags=re.IGNORECASE)
    value = re.sub(r"\s+(?:please|now)$", "", value, flags=re.IGNORECASE)
    value = re.sub(r"\s+", " ", value).strip(" .")
    return value.title() if value else None


def category_for_item(name: str, list_name: Optional[str] = None) -> str:
    text = f"{name} {list_name or ''}".lower()
    category_map = {
        "Dairy": ["milk", "cheese", "butter", "yogurt", "cream"],
        "Produce": ["apple", "banana", "potato", "tomato", "onion", "carrot", "lettuce", "fruit", "vegetable"],
        "Bakery": ["bread", "bagel", "cake", "bun", "muffin"],
        "Meat": ["meat", "chicken", "beef", "pork", "fish", "salmon"],
        "Snacks": ["chips", "candy", "chocolate", "cookie", "popcorn", "soda"],
        "Stationery": ["pen", "pencil", "notebook", "paper", "eraser", "marker", "stapler", "school"],
        "Hardware": ["hammer", "nail", "screw", "tape", "drill", "wrench", "hardware"],
        "Household": ["soap", "detergent", "cleaner", "towel", "tissue", "trash"],
        "Personal Care": ["shampoo", "toothpaste", "deodorant", "lotion"],
        "Party": ["party", "balloon", "cup", "plate", "napkin", "snack"],
    }
    for category, keywords in category_map.items():
        if any(keyword in text for keyword in keywords):
            return category
    return "Groceries"


def existing_item_names(current_items: List[dict]) -> set[str]:
    return {normalize_name(item.get("name", "")) for item in current_items if item.get("name")}


def infer_suggestion_seed(list_name: Optional[str], current_items: List[dict]) -> str:
    text = f"{list_name or ''} {' '.join(str(item.get('category', '')) for item in current_items)} {' '.join(str(item.get('name', '')) for item in current_items)}"
    normalized = normalize_name(text)
    for seed in SUGGESTION_CATALOG:
        if seed in normalized:
            return seed
    return "general"


def local_suggestions(current_items: List[dict], list_name: Optional[str], limit: int = 3) -> List[str]:
    present = existing_item_names(current_items)
    seed = infer_suggestion_seed(list_name, current_items)
    suggestions = []
    seen = set()
    for candidate in SUGGESTION_CATALOG.get(seed, SUGGESTION_CATALOG["general"]) + SUGGESTION_CATALOG["general"]:
        key = normalize_name(candidate)
        if key and key not in present and key not in seen:
            suggestions.append(candidate)
            seen.add(key)
        if len(suggestions) == limit:
            break
    return suggestions


def sanitize_suggestions(values: List[str], current_items: List[dict], list_name: Optional[str]) -> List[str]:
    present = existing_item_names(current_items)
    suggestions = []
    seen = set()
    for value in values:
        name = title_item(value)
        key = normalize_name(name)
        if key and key not in present and key not in seen:
            suggestions.append(name)
            seen.add(key)
        if len(suggestions) == 3:
            return suggestions
    for value in local_suggestions(current_items, list_name, limit=6):
        key = normalize_name(value)
        if key and key not in present and key not in seen:
            suggestions.append(value)
            seen.add(key)
        if len(suggestions) == 3:
            break
    return suggestions


def redact_api_key(value: Exception) -> str:
    return re.sub(r"key=[^&\s]+", "key=[redacted]", str(value))


def gemini_generate_content(prompt: str) -> dict:
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY is not configured.")

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
    headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY,
    }
    payload = {"contents": [{"parts": [{"text": prompt}]}]}
    response = requests.post(url, json=payload, headers=headers, timeout=15)
    response.raise_for_status()
    return response.json()


def split_quantity_name(value: str):
    value = re.sub(r"\s+", " ", value).strip(" .")
    number_words = "|".join(NUMBER_WORDS.keys())
    quantity_pattern = rf"((?:\d+(?:\.\d+)?|\b(?:{number_words})\b)(?:\s*(?:kg|g|lbs|lb|oz|liters|liter|l|ml|gallons|gallon|gal|cups|cup|packs|pack|boxes|box|bags|bag|bottles|bottle|cartons|carton))?)"

    match_start = re.match(rf"^{quantity_pattern}\s+(?:of\s+)?(.+)$", value)
    if match_start:
        return match_start.group(2).strip(), normalize_quantity(match_start.group(1))

    match_with = re.search(rf"^(.+?)\s+with\s+quantity\s+{quantity_pattern}$", value)
    if match_with:
        return match_with.group(1).strip(), normalize_quantity(match_with.group(2))

    match_end = re.search(rf"^(.+?)\s+{quantity_pattern}$", value)
    if match_end:
        return match_end.group(1).strip(), normalize_quantity(match_end.group(2))

    return value, "1"


def normalize_quantity(value: str) -> str:
    value = re.sub(r"\s+", " ", str(value).strip())
    parts = value.split(" ", 1)
    first = NUMBER_WORDS.get(parts[0].lower(), parts[0])
    return " ".join([first] + parts[1:])


def detect_target_list(text: str, available_lists: List[str]) -> Optional[str]:
    normalized_text = normalize_name(text)
    for list_name in available_lists:
        if normalize_name(list_name) and normalize_name(list_name) in normalized_text:
            return list_name

    patterns = [
        r"\b(?:to|in|from|on)\s+(?:the\s+)?(?:list|cart)\s+(.+?)(?:\s+please|\s+now|$)",
        r"\b(?:to|in|from|on)\s+(?:the\s+)?(.+?)\s+(?:list|cart)\b",
        r"\b(?:create|creaet|make)(?:\s+a)?\s+(?:list|cart)\s+(?:for\s+|called\s+|named\s+)?(.+?)(?:\s+and|\s+with|$)",
        r"\b(?:create|creaet|make)(?:\s+a)?\s+(.+?)\s+(?:list|cart)\b",
        r"\b(?:for)\s+(.+?)(?:\s+and|\s+with|$)",
    ]
    for pattern in patterns:
        match = re.search(pattern, text.lower())
        if match:
            return clean_list_name(match.group(1))
    return None


def mock_nlp_parser(text: str, current_items: List[dict] = [], available_lists: List[str] = []) -> IntentResponse:
    text_lower = text.lower()
    target_list_name = detect_target_list(text, available_lists)
    new_list_name = None

    rename_match = re.search(r"\brename\s+(?:the\s+)?(.+?)\s+(?:list|cart)?\s*(?:to|as|into)\s+(?:the\s+)?(.+?)(?:\s+(?:list|cart))?$", text_lower)
    if rename_match:
        target_list_name = clean_list_name(rename_match.group(1))
        new_list_name = clean_list_name(rename_match.group(2))

    action = "add"
    if rename_match:
        action = "rename_list"
    elif re.search(r"\b(delete|remove|drop)\s+(?:the\s+)?(?:list|cart)\b", text_lower) or re.search(r"\b(?:delete|remove|drop)\s+(?:the\s+)?(.+?)\s+(?:list|cart)\b", text_lower):
        action = "delete_list"
    elif re.search(r"\b(remove|delete|drop|clear)\b", text_lower):
        action = "remove"
    elif re.search(r"\b(find|search|show)\b", text_lower):
        action = "search"
    elif re.search(r"\b(add|buy|need|get|put|create|creaet)\b", text_lower):
        action = "add"
    elif re.search(r"\b(update|change|set|make)\b", text_lower):
        action = "update"
    elif re.search(r"\b(create|creaet|make)\b", text_lower):
        action = "create_list"

    correction_matches = re.findall(
        r"\b(?:no|nope|wait|actually|instead|make it|change it to)\s+(\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten)\b",
        text_lower,
    )

    cleaned_text = text_lower
    cleaned_text = re.sub(
        r"\b(?:create|creaet|make)(?:\s+a)?\s+(?:list|cart)\s+(?:for\s+|called\s+|named\s+)?[^,.]+?(?=\s+and|\s+with|,|\.|$)",
        " ",
        cleaned_text,
    )
    cleaned_text = re.sub(r"\b(?:oh\s+)?(?:no|nope|wait|actually|instead|make it|change it to)\s+\d+(?:\.\d+)?\b", " ", cleaned_text)
    if target_list_name:
        cleaned_text = re.sub(re.escape(target_list_name.lower()), "", cleaned_text)
    cleaned_text = re.sub(r"\b(previous context|user answer)\b:?", " ", cleaned_text)
    cleaned_text = re.sub(r'"[^"]*"', " ", cleaned_text)
    parts = re.split(r"\band\b|,|\.", cleaned_text)

    items = []
    stop_words = r"\b(add|remove|delete|buy|need|please|get|put|to|my|the|list|cart|from|in|on|search|find|show|create|creaet|update|change|set|make|called|named|for|with|of|it|them|a|an)\b"
    for part in parts:
        part = re.sub(stop_words, " ", part)
        part = re.sub(r"\b(no|nope|wait|actually|instead|oh)\b", " ", part)
        part = re.sub(r"\s+", " ", part).strip()
        if not part:
            continue
        if re.fullmatch(r"\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten", part):
            if items:
                items[-1]["quantity"] = normalize_quantity(part)
            continue

        name, quantity = split_quantity_name(part)
        if correction_matches:
            quantity = normalize_quantity(correction_matches[-1])
        name = title_item(name)
        if not name or name.lower() == (target_list_name or "").lower() or normalize_name(name).isdigit():
            continue

        items.append({
            "id": str(uuid.uuid4()),
            "name": name,
            "quantity": quantity,
            "category": category_for_item(name, target_list_name),
            "price": 0.0,
        })

    if action == "create_list":
        items = []
    if not items and action not in {"create_list", "delete_list", "rename_list"}:
        return IntentResponse(
            action=action,
            target_list_name=target_list_name,
            new_list_name=new_list_name,
            items=[],
            original_text=text,
            follow_up_question="I understood the action, but not the item. What item should I use?",
        )

    return IntentResponse(
        action=action,
        target_list_name=target_list_name,
        new_list_name=new_list_name,
        items=items,
        original_text=text,
    )


def extract_json(text: str) -> dict:
    content = re.sub(r"```json\n?", "", text)
    content = re.sub(r"```\n?", "", content).strip()
    if not content.startswith("{"):
        match = re.search(r"\{.*\}", content, flags=re.DOTALL)
        if match:
            content = match.group(0)
    return json.loads(content)


def sanitize_intent(parsed: dict, original_text: str, current_items: List[dict], available_lists: List[str]) -> IntentResponse:
    action = str(parsed.get("action", "add")).strip().lower()
    if action not in {"add", "remove", "update", "search", "suggest", "create_list", "delete_list", "rename_list"}:
        action = "add"

    target_list_name = clean_list_name(parsed.get("target_list_name"))
    new_list_name = clean_list_name(parsed.get("new_list_name"))
    if target_list_name:
        for list_name in available_lists:
            if normalize_name(list_name) == normalize_name(target_list_name):
                target_list_name = list_name
                break

    items = []
    for item in parsed.get("items", []) or []:
        name = title_item(str(item.get("name", "")).strip())
        if not name or normalize_name(name) in {"unknown item", "item"}:
            continue
        items.append({
            "id": str(uuid.uuid4()),
            "name": name,
            "quantity": str(item.get("quantity") or "1").strip(),
            "category": str(item.get("category") or category_for_item(name, target_list_name)).strip(),
            "price": float(item.get("price", 0.0) or 0.0),
        })

    follow_up_question = parsed.get("follow_up_question")
    return IntentResponse(
        action=action,
        target_list_name=target_list_name,
        new_list_name=new_list_name,
        items=items,
        original_text=original_text,
        follow_up_question=str(follow_up_question) if follow_up_question else None,
    )


@app.post("/api/parse-intent", response_model=IntentResponse)
def parse_voice_command(request: VoiceCommandRequest):
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Command text is required.")

    try:
        if not GEMINI_API_KEY:
            return mock_nlp_parser(request.text, request.current_items, request.available_lists)

        current_items_context = json.dumps([
            {"name": item.get("name"), "quantity": item.get("quantity"), "category": item.get("category")}
            for item in request.current_items
        ], ensure_ascii=False)

        prompt = f"""You are an advanced NLP reasoning engine for a Shopping List App.
Understand messy, conversational speech, typos, self-corrections, slang, implied context, and browser speech recognition mistakes.

AVAILABLE LISTS IN DATABASE: {', '.join(request.available_lists) if request.available_lists else 'None'}
CURRENT ITEMS IN ACTIVE LIST: {current_items_context}

Return ONLY valid JSON matching this schema:
{{
  "reasoning": "brief explanation of the intent",
  "action": "add"|"remove"|"update"|"search"|"suggest"|"create_list"|"delete_list"|"rename_list",
  "target_list_name": "string or null",
  "new_list_name": "string or null",
  "items": [{{"name": "string", "quantity": "string", "category": "string"}}],
  "follow_up_question": "string or null"
}}

Rules:
1. Resolve self-corrections. "add 14 no wait 15 apples" means 15 apples.
2. Strip filler words from list names. "create a list for school" means target_list_name "school".
3. If a command creates a list and adds items, use action "add"; the app will create the list.
4. Match target_list_name to AVAILABLE LISTS when the wording is close.
5. For remove/update/search, match against CURRENT ITEMS and return the intended item names.
6. If an item quantity is ambiguous enough to block action, return follow_up_question and no items.
7. Do not invent items that were not requested for parse-intent.

Examples:
Input: "i dont like the list Groceries delte it"
Output: {{"reasoning": "Delete the Groceries list.", "action": "delete_list", "target_list_name": "Groceries", "new_list_name": null, "items": [], "follow_up_question": null}}

Input: "create a list for school and add in notebooks. Add in 5 of them"
Output: {{"reasoning": "Create/use school and add 5 notebooks.", "action": "add", "target_list_name": "school", "new_list_name": null, "items": [{{"name": "notebooks", "quantity": "5", "category": "Stationery"}}], "follow_up_question": null}}

Input: "creaet a list for party and add 14 bags of chips, oh wait make it 15"
Output: {{"reasoning": "Create/use party and add 15 bags of chips.", "action": "add", "target_list_name": "party", "new_list_name": null, "items": [{{"name": "bags of chips", "quantity": "15", "category": "Snacks"}}], "follow_up_question": null}}

User Command: {request.text!r}"""

        data = gemini_generate_content(prompt)
        content = data["candidates"][0]["content"]["parts"][0]["text"]
        parsed = extract_json(content)
        return sanitize_intent(parsed, request.text, request.current_items, request.available_lists)
    except Exception as e:
        print(f"Gemini intent parser failed, using local parser. Error: {redact_api_key(e)}")
        return mock_nlp_parser(request.text, request.current_items, request.available_lists)


@app.post("/api/parse-audio", response_model=IntentResponse)
def parse_raw_audio(request: AudioCommandRequest):
    raise HTTPException(status_code=503, detail="Audio transcription requires GEMINI_API_KEY. Use browser speech recognition or text input.")


@app.post("/api/suggestions", response_model=SuggestionResponse)
def get_suggestions(request: SuggestionRequest):
    if not GEMINI_API_KEY:
        seed = infer_suggestion_seed(request.list_name, request.current_items)
        return SuggestionResponse(
            suggestions=local_suggestions(request.current_items, request.list_name),
            reason=f"Suggestions based on your {seed} list and current items.",
        )

    try:
        current_details = json.dumps([
            {"name": item.get("name"), "quantity": item.get("quantity"), "category": item.get("category")}
            for item in request.current_items
        ], ensure_ascii=False)

        prompt = f"""List Name: {request.list_name or 'General'}
Current Items: {current_details if request.current_items else 'None'}

You are an expert AI shopping assistant. Provide exactly 3 practical item suggestions based on the list name and current item/category context.

Rules:
1. Never suggest an item already present in Current Items, including plural/singular variants.
2. Stay strictly within the theme/context of the List Name. For example, 'badminton' should get sports items (shuttlecocks, grips), 'stationery' should get office supplies, etc. Do NOT default to groceries or household items unless the list is explicitly for that.
3. Return item names only, no quantities and no categories in the suggestions array.

Return ONLY valid JSON:
{{
  "suggestions": ["item1", "item2", "item3"],
  "reason": "brief reason"
}}"""

        result = gemini_generate_content(prompt)
        content = result["candidates"][0]["content"]["parts"][0]["text"]
        parsed = extract_json(content)
        suggestions = sanitize_suggestions(parsed.get("suggestions", []), request.current_items, request.list_name)

        return SuggestionResponse(
            suggestions=suggestions,
            reason=parsed.get("reason", "Smart suggestions based on your list and current items."),
        )
    except Exception as e:
        print(f"Gemini suggestions failed: {redact_api_key(e)}")
        seed = infer_suggestion_seed(request.list_name, request.current_items)
        return SuggestionResponse(
            suggestions=local_suggestions(request.current_items, request.list_name),
            reason=f"Local suggestions based on your {seed} list while AI suggestions are unavailable.",
        )
