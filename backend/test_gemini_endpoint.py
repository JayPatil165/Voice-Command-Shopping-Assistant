import requests
import os
from dotenv import load_dotenv

load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GEMINI_API_KEY}"
payload = {"contents": [{"parts": [{"text": "Hello, how are you?"}]}]}
resp = requests.post(url, json=payload, headers={"Content-Type": "application/json"})
print("gemini-1.5-flash status:", resp.status_code)
if resp.status_code != 200:
    print(resp.text)

url2 = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key={GEMINI_API_KEY}"
resp2 = requests.post(url2, json=payload, headers={"Content-Type": "application/json"})
print("gemini-1.5-pro status:", resp2.status_code)
if resp2.status_code != 200:
    print(resp2.text)
