"""graph/flow.py
----------------
Builds the compiled LangGraph + SQLite checkpointer.

Graph topology
--------------
    START → call_colab → END

Simple linear graph: one node does all the work.
The magic is the SQLite checkpointer — it snapshots state (including
the conversation messages list) after every invocation, keyed by
thread_id.  Subsequent calls with the same thread_id automatically
restore the full conversation history before running the node.
"""

from __future__ import annotations

import logging
import os

import aiosqlite
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from langgraph.graph import END, START, StateGraph

from graph.nodes import call_colab_node
from graph.state import ChatState

logger = logging.getLogger(__name__)


def _build_graph(checkpointer: AsyncSqliteSaver):
    """Construct and compile the LangGraph."""
    builder = StateGraph(ChatState)

    # ── Nodes ───────────────────────────────────────────────
    builder.add_node("call_colab", call_colab_node)

    # ── Edges ────────────────────────────────────────────────
    builder.add_edge(START, "call_colab")
    builder.add_edge("call_colab", END)

    return builder.compile(checkpointer=checkpointer)


async def create_graph_with_checkpointer(db_path: str):
    """
    Open a persistent aiosqlite connection, initialise the SQLite
    checkpointer (creates tables if needed), compile the graph.

    Returns (graph, db_connection) — caller is responsible for
    closing db_connection on shutdown.
    """
    os.makedirs(os.path.dirname(db_path) or ".", exist_ok=True)

    conn = await aiosqlite.connect(db_path)
    checkpointer = AsyncSqliteSaver(conn)
    await checkpointer.setup()          # idempotent: creates checkpoint tables

    graph = _build_graph(checkpointer)
    logger.info("LangGraph compiled. SQLite checkpoint at: %s", db_path)
    return graph, conn
