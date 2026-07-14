import requests
import os
from dotenv import load_dotenv
import json

load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key={GEMINI_API_KEY}"
prompt = "List Name: Groceries\nCurrent Items: Apples\nGive me 3 suggestions excluding current items."

payload = {"contents": [{"parts": [{"text": prompt}]}]}
resp = requests.post(url, json=payload, headers={"Content-Type": "application/json"})
print("Status:", resp.status_code)
if resp.status_code == 200:
    print(json.dumps(resp.json(), indent=2))
else:
    print(resp.text)
