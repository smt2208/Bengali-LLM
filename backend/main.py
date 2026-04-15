"""main.py
----------
Bengali LLM Backend — FastAPI application.

Endpoints
---------
  POST  /api/chat                   — send a question, get a response
  GET   /api/history/{thread_id}    — full conversation for a thread
  DELETE /api/history/{thread_id}   — clear / reset a conversation
  POST  /api/config/endpoint        — hot-swap the Colab ngrok URL
  GET   /api/health                 — liveness check

Conversation Identity
---------------------
Each browser tab / user session should use a unique thread_id (UUID).
The frontend creates one on first visit (stored in sessionStorage or
localStorage) and sends it with every request.  The SQLite checkpointer
uses thread_id as the partition key — all messages for that thread are
isolated from other threads.
"""

from __future__ import annotations

import logging
import os
import uuid
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from langchain_core.messages import AIMessage, HumanMessage
from pydantic import BaseModel, Field

from config.settings import settings
from graph.flow import create_graph_with_checkpointer

# ── Logging ──────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("bengali_llm")


# ── Application lifespan (startup / shutdown) ─────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ─────────────────────────────────────────────
    logger.info("Starting Bengali LLM backend...")
    graph, db_conn = await create_graph_with_checkpointer(settings.sqlite_db_path)
    app.state.graph = graph
    app.state.db_conn = db_conn
    logger.info("Backend ready.  Colab endpoint: %s", settings.colab_endpoint)
    yield

    # ── Shutdown ─────────────────────────────────────────────
    logger.info("Shutting down — closing SQLite connection.")
    await db_conn.close()


# ── FastAPI app ───────────────────────────────────────────────
app = FastAPI(
    title="Bengali LLM Backend",
    description="LangGraph orchestration layer between the chat frontend and Colab inference.",
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS ─────────────────────────────────────────────────────
# When allowed_origins is ['*'], allow_credentials must be False
# (Starlette enforces this — cookies/auth not needed for this API)
_credentials = "*" not in settings.allowed_origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ════════════════════════════════════════════════════════════
#  Request / Response schemas
# ════════════════════════════════════════════════════════════

class ChatRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=4096, description="User's message")
    thread_id: Optional[str] = Field(
        default=None,
        description="Conversation ID.  If omitted a new UUID is generated.",
    )


class ChatResponse(BaseModel):
    response: str
    thread_id: str


class HistoryMessage(BaseModel):
    role: str           # "user" | "assistant"
    content: str


class HistoryResponse(BaseModel):
    thread_id: str
    messages: list[HistoryMessage]


class EndpointUpdate(BaseModel):
    endpoint: str = Field(..., description="New Colab ngrok HTTPS URL")


class HealthResponse(BaseModel):
    status: str
    colab_endpoint: str
    sqlite_db: str


# ════════════════════════════════════════════════════════════
#  Endpoints
# ════════════════════════════════════════════════════════════

@app.get("/api/health", response_model=HealthResponse, tags=["System"])
async def health_check():
    """Liveness probe — also shows current Colab endpoint and DB path."""
    return HealthResponse(
        status="ok",
        colab_endpoint=settings.colab_endpoint,
        sqlite_db=settings.sqlite_db_path,
    )


@app.post("/api/chat", response_model=ChatResponse, tags=["Chat"])
async def chat(request: Request, body: ChatRequest):
    """
    Main chat endpoint.

    1. Assign / reuse thread_id
    2. Run LangGraph graph (restores history from SQLite, calls Colab, saves new messages)
    3. Return model response + thread_id
    """
    graph = request.app.state.graph

    # Generate a new thread_id if not provided
    thread_id: str = body.thread_id or str(uuid.uuid4())

    # LangGraph config — the checkpointer uses thread_id as the partition key
    config = {"configurable": {"thread_id": thread_id}}

    try:
        result = await graph.ainvoke(
            {"question": body.question},
            config=config,
        )
    except Exception as e:
        logger.exception("Graph invocation failed for thread=%s: %s", thread_id, e)
        raise HTTPException(status_code=500, detail="Internal orchestration error.")

    response_text: str = result.get("response", "")

    if not response_text:
        raise HTTPException(status_code=502, detail="Empty response from model.")

    return ChatResponse(response=response_text, thread_id=thread_id)


@app.get("/api/history/{thread_id}", response_model=HistoryResponse, tags=["Chat"])
async def get_history(thread_id: str, request: Request):
    """
    Return the full conversation history for a thread from the SQLite checkpoint.
    """
    graph = request.app.state.graph
    config = {"configurable": {"thread_id": thread_id}}

    try:
        state_snapshot = await graph.aget_state(config)
    except Exception as e:
        logger.exception("get_state failed for thread=%s: %s", thread_id, e)
        raise HTTPException(status_code=500, detail="Could not retrieve history.")

    raw_messages = (state_snapshot.values or {}).get("messages", [])
    messages: list[HistoryMessage] = []

    for msg in raw_messages:
        if isinstance(msg, HumanMessage):
            messages.append(HistoryMessage(role="user", content=msg.content))
        elif isinstance(msg, AIMessage):
            messages.append(HistoryMessage(role="assistant", content=msg.content))

    return HistoryResponse(thread_id=thread_id, messages=messages)


@app.delete("/api/history/{thread_id}", tags=["Chat"])
async def clear_history(thread_id: str, request: Request):
    """
    Wipe all checkpointed state for a thread (effectively resets the conversation).
    LangGraph does not expose a direct delete — we overwrite with empty messages.
    """
    graph = request.app.state.graph
    config = {"configurable": {"thread_id": thread_id}}

    try:
        # Update state to empty messages list
        await graph.aupdate_state(config, {"messages": []})
    except Exception as e:
        logger.exception("clear_history failed for thread=%s: %s", thread_id, e)
        raise HTTPException(status_code=500, detail="Could not clear history.")

    return {"status": "cleared", "thread_id": thread_id}


@app.post("/api/config/endpoint", tags=["System"])
async def update_colab_endpoint(body: EndpointUpdate):
    """
    Hot-swap the Colab ngrok URL without restarting the server.
    Useful when you restart Colab and get a new ngrok URL.
    """
    if not body.endpoint.startswith("https://"):
        raise HTTPException(
            status_code=422,
            detail="endpoint must be an HTTPS URL (ngrok provides HTTPS by default).",
        )
    settings.colab_endpoint = body.endpoint
    logger.info("Colab endpoint updated to: %s", body.endpoint)
    return {"status": "updated", "colab_endpoint": body.endpoint}


# ── Dev entrypoint ────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=True,        # disable in production
        log_level="info",
    )
