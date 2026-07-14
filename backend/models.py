from pydantic import BaseModel, Field
from typing import List, Optional

class ShoppingItem(BaseModel):
    id: str
    name: str
    quantity: str
    category: str
    price: Optional[float] = None

class VoiceCommandRequest(BaseModel):
    text: str
    language: str = "en"
    current_items: List[ShoppingItem] = Field(default_factory=list)

class AudioCommandRequest(BaseModel):
    audio_base64: str
    mime_type: str = "audio/webm"

class IntentResponse(BaseModel):
    action: str  # "add", "remove", "update", "search", "suggest"
    items: List[ShoppingItem]
    original_text: str

class SuggestionRequest(BaseModel):
    current_items: List[ShoppingItem]

class SuggestionResponse(BaseModel):
    suggestions: List[ShoppingItem]
    reason: str  # e.g., "Seasonal", "Complementary to bread"
