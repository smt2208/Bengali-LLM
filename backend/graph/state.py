"""graph/state.py
-----------------
LangGraph state definition for the Bengali LLM chat flow.

The `messages` field uses the built-in `add_messages` reducer which
automatically APPENDS new messages rather than replacing the list —
this is what enables conversation memory via the SQLite checkpointer.
"""

from __future__ import annotations

from typing import Annotated
from typing_extensions import TypedDict

from langgraph.graph.message import add_messages
from langchain_core.messages import BaseMessage


class ChatState(TypedDict):
    # ── Persisted in SQLite checkpoint (per thread_id) ──────
    # add_messages reducer: each graph run appends, never replaces
    messages: Annotated[list[BaseMessage], add_messages]

    # ── Transient — only lives for one graph invocation ─────
    question: str          # current user question (raw)
    response: str          # model response for this turn
