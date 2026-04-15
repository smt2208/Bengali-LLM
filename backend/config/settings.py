"""
config/settings.py
------------------
Centralised pydantic-settings config.  All values can be overridden
by a .env file or real environment variables.
"""

from __future__ import annotations

from typing import List
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── Server ──────────────────────────────────────────────
    host: str = "0.0.0.0"
    port: int = 8000

    # ── Colab / ngrok ────────────────────────────────────────
    colab_endpoint: str = "https://your-static-ngrok-url.ngrok-free.app/generate"

    # ── SQLite ───────────────────────────────────────────────
    sqlite_db_path: str = "./db/conversations.db"

    # ── CORS ─────────────────────────────────────────────────
    allowed_origins: List[str] = [
        "http://localhost:3457",
        "http://127.0.0.1:3457",
        "http://localhost:5500",
        "http://127.0.0.1:5500",
    ]

    # ── Request behaviour ────────────────────────────────────
    request_timeout: float = 90.0       # seconds — Colab inference can be slow
    max_history_pairs: int = 5          # user/assistant pairs sent as context


    @field_validator("allowed_origins", mode="before")
    @classmethod
    def _split_origins(cls, v):
        """Accept either a list or a comma-separated string from .env."""
        if isinstance(v, str):
            return [o.strip() for o in v.split(",") if o.strip()]
        return v


# Singleton — import this everywhere
settings = Settings()
