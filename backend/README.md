# Bengali LLM Backend — Quick Start

## Architecture

```
Browser (chat.js)
      │  POST /api/chat  { question, thread_id }
      ▼
FastAPI  (main.py — LangGraph orchestration)
      │  async ainvoke graph
      ▼
LangGraph node  (graph/nodes.py)
      │  POST { question, conversation_history }
      ▼
Colab FastAPI + ngrok  (fine-tuned Qwen 2.5-3B)
      │  { response: "..." }
      ▲
SQLite checkpoint  (db/conversations.db)
  stores all messages per thread_id
```

---

## Setup

### 1. Install dependencies
```bash
cd backend
python -m venv venv
# Windows
venv\Scripts\activate
# Mac / Linux
source venv/bin/activate

pip install -r requirements.txt
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env and set your ngrok URL:
#   COLAB_ENDPOINT=https://your-static.ngrok-free.app/generate
```

### 3. Run
```bash
python main.py
# or
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 4. Colab side
- Upload `colab_inference_server.ipynb` (from the root folder) to Google Colab
- Set `ADAPTER_PATH` in Cell 3 to your LoRA adapter on Google Drive
- Set `NGROK_AUTH_TOKEN` and `NGROK_STATIC_DOMAIN` in Cell 7 from your ngrok dashboard
- Run all cells in order
- Copy the printed `/generate` URL into this project's `.env`

---

## API Reference

| Method | Path | Body | Description |
|--------|------|------|-------------|
| POST | `/api/chat` | `{ question, thread_id? }` | Send a question, get a response |
| GET | `/api/history/{thread_id}` | — | Full conversation history |
| DELETE | `/api/history/{thread_id}` | — | Wipe conversation |
| POST | `/api/config/endpoint` | `{ endpoint }` | Hot-swap Colab URL |
| GET | `/api/health` | — | Liveness check |

Interactive docs: **http://localhost:8000/docs**

---

## Frontend ↔ Backend

The `chat.js` frontend defaults to `http://localhost:8000`.  
In the ⚙️ Settings panel, the **Backend URL** field lets you point to any deployed instance.

> **CORS**: If you deploy the backend (e.g. to Render / Railway), add its domain to
> `ALLOWED_ORIGINS` in `.env`.

---

## File Structure
```
backend/
├── main.py                    ← FastAPI app (entry point)
├── requirements.txt
├── .env.example
├── config/
│   └── settings.py            ← Pydantic settings (reads .env)
├── graph/
│   ├── state.py               ← LangGraph TypedDict state
│   ├── nodes.py               ← Colab caller node (retries, error handling)
│   └── flow.py                ← Graph factory + SQLite checkpointer setup
└── db/
    └── conversations.db       ← auto-created on first run
```
