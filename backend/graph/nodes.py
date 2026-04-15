"""graph/nodes.py
-----------------
LangGraph node that calls the Colab FastAPI / ngrok endpoint.

Contract with the Colab side
-----------------------------
  REQUEST  (POST → COLAB_ENDPOINT):
    {
      "question": "<current user message>",
      "conversation_history": [
          {"role": "user",      "content": "..."},
          {"role": "assistant", "content": "..."},
          ...
      ]
    }

  RESPONSE (JSON from Colab):
    {
      "response": "<model answer>"
    }

Colab is responsible for:
  • prepending the system prompt
  • formatting the full chat template for fine-tuned Qwen 2.5-3B
  • running inference
  • returning only the assistant reply text

This node is responsible for:
  • building the conversation history payload from the LangGraph state
  • retrying on transient network errors
  • graceful error messages in Bengali on failure
  • appending HumanMessage + AIMessage to the state for checkpointing
"""

from __future__ import annotations

import logging
from typing import Any

import httpx
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)
from langchain_core.messages import HumanMessage, AIMessage

from config.settings import settings
from graph.state import ChatState

logger = logging.getLogger(__name__)


# ── Retry decorator (transient network / 5xx) ────────────────
_RETRYABLE = (httpx.NetworkError, httpx.TimeoutException, httpx.RemoteProtocolError)

@retry(
    retry=retry_if_exception_type(_RETRYABLE),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=8),
    reraise=True,
)
async def _post_to_colab(payload: dict[str, Any], endpoint: str) -> str:
    """POST to Colab endpoint; returns the response string."""
    async with httpx.AsyncClient(timeout=settings.request_timeout) as client:
        resp = await client.post(
            endpoint,
            json=payload,
            headers={
                "Content-Type": "application/json",
                "ngrok-skip-browser-warning": "true",   # skip ngrok warning page
            },
        )
        resp.raise_for_status()
        data = resp.json()

    # Accept both {"response": "..."} and {"answer": "..."} from Colab
    return data.get("response") or data.get("answer") or str(data)


# ── LangGraph node ────────────────────────────────────────────
async def call_colab_node(state: ChatState) -> dict:
    """
    Main LangGraph node.

    1. Reads conversation history from state["messages"] (checkpointed)
    2. Builds the payload for Colab (question + last N message pairs)
    3. Calls Colab via HTTPS; retries on transient failures
    4. Returns updated state — messages list gets the new pair appended
    """
    question: str = state["question"]

    # ── Build conversation history from checkpointed messages ──
    history: list[dict] = []
    for msg in state.get("messages", []):
        if isinstance(msg, HumanMessage):
            history.append({"role": "user", "content": msg.content})
        elif isinstance(msg, AIMessage):
            history.append({"role": "assistant", "content": msg.content})

    # Keep only the last N pairs (2 messages per pair)
    max_msgs = settings.max_history_pairs * 2
    history = history[-max_msgs:] if history else []

    payload = {
        "question": question,
        "conversation_history": history,
    }

    # ── Call Colab ────────────────────────────────────────────
    try:
        response_text = await _post_to_colab(payload, settings.colab_endpoint)
        logger.info("Colab OK | q=%s… | r=%s…", question[:40], response_text[:40])

    except httpx.TimeoutException:
        logger.warning("Colab endpoint timed out after %ss", settings.request_timeout)
        response_text = (
            "দুঃখিত, মডেলটি সাড়া দিতে সময় লাগছে। "
            "অনুগ্রহ করে একটু পরে আবার চেষ্টা করুন।"
        )

    except httpx.HTTPStatusError as e:
        logger.error("Colab HTTP %s: %s", e.response.status_code, e.response.text[:200])
        response_text = (
            "দুঃখিত, মডেলের সাথে সংযোগে সমস্যা হয়েছে। "
            f"(HTTP {e.response.status_code})"
        )

    except Exception as e:
        logger.exception("Unexpected error calling Colab: %s", e)
        response_text = "দুঃখিত, একটি অপ্রত্যাশিত ত্রুটি হয়েছে।"

    # ── Return state update ───────────────────────────────────
    # messages uses add_messages reducer → these are APPENDED, not replaced
    return {
        "messages": [
            HumanMessage(content=question),
            AIMessage(content=response_text),
        ],
        "response": response_text,
    }
