import requests
import os
from dotenv import load_dotenv

load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

url = f"https://generativelanguage.googleapis.com/v1beta/models?key={GEMINI_API_KEY}"
resp = requests.get(url)
models = resp.json()
print("Available Models:")
for m in models.get("models", []):
    print(m.get("name"))
