"""
config.py — single source of truth for all environment-driven settings.

python-dotenv loads .env automatically when this module is imported.
Every other module reads from this file instead of calling os.getenv()
directly, so the .env parsing happens exactly once.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

# Load .env from taskflow/ root — one directory above backend/.
# override=True ensures the .env file always takes precedence over any
# stale values that may be set in the shell environment.
load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env", override=True)

# ── Database ──────────────────────────────────────────────────────────────
DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./app.db")

# ── App behaviour ─────────────────────────────────────────────────────────
APP_ENV: str = os.getenv("APP_ENV", "development")
SQL_ECHO: bool = APP_ENV == "development"

# ── CORS ──────────────────────────────────────────────────────────────────
# The .env value is a comma-separated string; split it into a list here.
_raw_origins: str = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:5500,http://127.0.0.1:5500",
)
ALLOWED_ORIGINS: list[str] = [o.strip() for o in _raw_origins.split(",") if o.strip()]
