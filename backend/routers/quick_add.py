"""
routers/quick_add.py
--------------------
POST /tasks/quick-add

Accepts a free-text description and a project_id, parses the description
into task fields via the mock parser (or an optional real LLM call when
USE_REAL_LLM=true), validates the result with Pydantic, then creates and
returns a real row in the tasks table.

The role-based prompt structure (system + user messages) is constructed even
when the mock parser is used, keeping the code path identical whether the
mock or a real model provides the answer.
"""

import logging
import os
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db
from mock_parser import build_messages, parse as mock_parse

logger = logging.getLogger("app")

router = APIRouter(prefix="/tasks", tags=["quick-add"])

USE_REAL_LLM: bool = os.getenv("USE_REAL_LLM", "false").strip().lower() == "true"


# ---------------------------------------------------------------------------
# Resolve a due_date_hint phrase → "YYYY-MM-DD" string (or None)
# ---------------------------------------------------------------------------

_WEEKDAY_MAP = {
    "monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3,
    "friday": 4, "saturday": 5, "sunday": 6,
}

def _resolve_due_date(hint: str | None) -> str | None:
    """
    Convert a natural-language date hint from the mock parser into a
    YYYY-MM-DD string relative to today.

    Supported phrases (matches _DATE_PHRASES_IN_ORDER in mock_parser.py):
      today, tomorrow, next week,
      next <weekday>, <weekday>
    Returns None if hint is None or unrecognised.
    """
    if not hint:
        return None

    today = date.today()
    h = hint.lower().strip()

    if h == "today":
        return today.isoformat()

    if h == "tomorrow":
        return (today + timedelta(days=1)).isoformat()

    if h == "next week":
        return (today + timedelta(weeks=1)).isoformat()

    # "next <weekday>"
    if h.startswith("next "):
        day_name = h[5:]  # strip "next "
        if day_name in _WEEKDAY_MAP:
            target_wd = _WEEKDAY_MAP[day_name]
            days_ahead = (target_wd - today.weekday() + 7) % 7
            if days_ahead == 0:
                days_ahead = 7   # "next friday" when today IS friday → 7 days
            return (today + timedelta(days=days_ahead)).isoformat()

    # bare "<weekday>" — nearest future occurrence
    if h in _WEEKDAY_MAP:
        target_wd = _WEEKDAY_MAP[h]
        days_ahead = (target_wd - today.weekday() + 7) % 7
        if days_ahead == 0:
            days_ahead = 7
        return (today + timedelta(days=days_ahead)).isoformat()

    # unrecognised — store the raw hint so nothing is lost
    return hint


# ---------------------------------------------------------------------------
# Request body schema
# ---------------------------------------------------------------------------

class QuickAddRequest(BaseModel):
    description: str = Field(..., min_length=1,
                             description="Free-text task description")
    project_id: int  = Field(..., description="ID of the project to attach the task to")

    @field_validator("description")
    @classmethod
    def description_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("description must not be blank or whitespace-only")
        return v


# ---------------------------------------------------------------------------
# Optional real LLM call (guarded behind USE_REAL_LLM flag)
# ---------------------------------------------------------------------------

def _call_real_llm(messages: list[dict]) -> dict:
    """
    Attempt a real LLM call using the OpenAI-compatible API.
    Only reached when USE_REAL_LLM=true AND the OPENAI_API_KEY env var is set.
    Falls back to mock if the call fails for any reason.
    """
    try:
        import json
        import openai  # type: ignore

        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY not set")

        client = openai.OpenAI(api_key=api_key)
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            temperature=0,
            max_tokens=120,
        )
        raw = response.choices[0].message.content.strip()
        parsed = json.loads(raw)

        # Normalise: ensure required keys exist, fill missing with mock defaults
        result = {
            "title":         str(parsed.get("title", "Untitled task")).strip() or "Untitled task",
            "priority":      parsed.get("priority", "medium"),
            "due_date_hint": parsed.get("due_date_hint"),
        }
        if result["priority"] not in ("low", "medium", "high"):
            result["priority"] = "medium"
        return result

    except Exception as exc:
        logger.warning("Real LLM call failed (%s); falling back to mock parser.", exc)
        return None   # caller will fall back to mock


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.post(
    "/quick-add",
    response_model=schemas.TaskOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a task from a free-text description",
    description=(
        "Parse a natural-language description into title / priority / due_date "
        "using a deterministic mock parser (or an optional real LLM call when "
        "USE_REAL_LLM=true), validate the result, then persist a new Task row."
    ),
)
def quick_add_task(
    payload: QuickAddRequest,
    db: Session = Depends(get_db),
):
    """
    1. Build role-based prompt messages (system + user).
    2. Parse the description → {title, priority, due_date_hint}.
    3. Validate the parsed fields with Pydantic (TaskCreate) before any DB write.
    4. Persist and return the created task (201).
    """

    # ── 1. Build role-based prompt (used by mock and real LLM alike) ─────
    messages = build_messages(payload.description)
    logger.info(
        "quick-add: system=%s | user=%r",
        messages[0]["content"][:60] + "…",
        payload.description,
    )

    # ── 2. Parse ──────────────────────────────────────────────────────────
    parsed = None

    if USE_REAL_LLM:
        parsed = _call_real_llm(messages)
        if parsed is not None:
            logger.info("quick-add: used real LLM result: %s", parsed)

    if parsed is None:
        parsed = mock_parse(payload.description)
        logger.info("quick-add: used mock parser result: %s", parsed)

    # ── 3. Validate with Pydantic before touching the DB ─────────────────
    try:
        task_in = schemas.TaskCreate(
            title      = parsed["title"],
            priority   = parsed["priority"],
            due_date   = _resolve_due_date(parsed.get("due_date_hint")),
            status     = "todo",
            project_id = payload.project_id,
        )
    except Exception as exc:
        # Re-raise as 422 with Pydantic's validation detail
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

    # ── Verify the project exists ─────────────────────────────────────────
    project = db.query(models.Project).filter(
        models.Project.id == task_in.project_id
    ).first()
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project with id={task_in.project_id} not found.",
        )

    # ── 4. Persist ────────────────────────────────────────────────────────
    task = models.Task(
        title      = task_in.title,
        description= payload.description,   # store original free text as description
        priority   = task_in.priority,
        status     = task_in.status,
        due_date   = task_in.due_date,
        project_id = task_in.project_id,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task
