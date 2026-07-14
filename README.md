# 🛒 Voice Command Shopping Assistant

A highly intelligent, voice-first shopping assistant that uses advanced NLP (Natural Language Processing) to manage your shopping lists. Built with Next.js, FastAPI, and Google Gemini AI, it seamlessly transforms messy, conversational English into perfectly categorized, structured shopping lists.

🌟 **Live Demo**: [https://voice-command-shopping-assistant-sepia.vercel.app/](https://voice-command-shopping-assistant-sepia.vercel.app/)

## ✨ Features
- **Intelligent Voice NLP**: Powered by Google's Gemini 1.5 Flash AI. It understands complex, multi-step instructions, self-corrections, and implicit context (e.g., "Actually, make that 3 dozen eggs and put it in groceries").
- **Dynamic List Management**: Automatically creates lists on the fly if they don't exist and smartly routes items to the correct list based on your voice command.
- **Auto-Categorization**: Automatically categorizes items (Produce, Dairy, Meat, etc.) and tags them with visually distinct badges.
- **Smart Suggestions**: Uses AI to suggest items based on the context of your current list.
- **Modern, Playful UI**: A fully responsive, mobile-first design with vibrant colors, smooth micro-animations, skeleton loading states, and dark mode support.
- **JWT Authentication**: Secure user accounts with stateless token authentication.

## 🛠️ Tech Stack
- **Frontend**: Next.js 14, React 19, Tailwind CSS v4, Lucide React (Icons), Shadcn UI components.
- **Backend**: FastAPI (Python), SQLite (extensible to PostgreSQL via SQLAlchemy), JWT Authentication.
- **AI / NLP**: Google Gemini API (`gemini-1.5-flash`), `react-speech-recognition` for browser-based speech-to-text.

## 🎨 UX & Error Handling Approach
- **Graceful AI Fallback**: If the Google Gemini API is temporarily unavailable or rejects a connection, the backend safely falls back to a built-in Regex-based offline NLP parser, ensuring you can always add items.
- **Loading States**: The UI implements smooth Skeleton loaders while waiting for network responses, ensuring the app feels native and uninterrupted.
- **Clarification Prompts**: If the AI detects an ambiguous command (e.g., "Add 4 milk" without units), it will pause and prompt the user for clarification ("Did you mean 4 gallons or cartons?") before adding the item.
- **Toast Notifications**: Non-intrusive toast alerts via `sonner` for all CRUD operations and error alerts.

## 🚀 Setup & Local Development

### Prerequisites
- Node.js (v18+)
- Python 3.9+
- A Google Gemini API Key

### Backend Setup
1. Navigate to the `backend/` directory.
2. Create a virtual environment: `python -m venv venv`
3. Activate the environment: 
   - Windows: `venv\Scripts\activate`
   - Mac/Linux: `source venv/bin/activate`
4. Install requirements: `pip install -r requirements.txt`
5. Create a `.env` file in the `backend/` folder and add:
   ```
   GEMINI_API_KEY=your_google_api_key_here
   ```
6. Run the server: `uvicorn main:app --reload` (Runs on `http://localhost:8000`)

### Frontend Setup
1. Navigate to the `frontend/` directory.
2. Install dependencies: `npm install`
3. Create a `.env.local` file and add:
   ```
   NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
   ```
4. Start the development server: `npm run dev`

---
Developed by **Jay Ajitkumar Patil**
