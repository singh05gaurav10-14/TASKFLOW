"""
mock_parser.py
--------------
Deterministic rule-based mock parser that simulates what an LLM would return
for a task quick-add description.

The algorithm is specified precisely so that any two correct implementations
produce identical output for any given input string.

Returns a dict with three keys:
    {
        "title":          str,   # never empty; falls back to "Untitled task"
        "priority":       str,   # exactly one of "low" | "medium" | "high"
        "due_date_hint":  str | None
    }
"""

import re

# ---------------------------------------------------------------------------
# Keyword tables (order matters for priority; iteration order == match order)
# ---------------------------------------------------------------------------

# Group (i) — HIGH priority keywords
_HIGH_KEYWORDS = ["urgent", "asap"]

# Group (ii) — LOW priority keywords
_LOW_KEYWORDS = ["whenever", "low priority"]

# Date phrases checked in order (two-word "next <day>" phrases first so they
# consume the whole span before the bare-weekday pass)
_NEXT_DAY_PHRASES = [
    "next monday",
    "next tuesday",
    "next wednesday",
    "next thursday",
    "next friday",
    "next saturday",
    "next sunday",
]

_BARE_DAY_NAMES = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
]

# All date keywords in the order the spec requires them checked:
#   1. "today"
#   2. "tomorrow"
#   3. "next week"
#   4. next-<weekday> phrases (Mon → Sun)
#   5. bare day names (Mon → Sun)
_DATE_PHRASES_IN_ORDER = (
    ["today", "tomorrow", "next week"]
    + _NEXT_DAY_PHRASES
    + _BARE_DAY_NAMES
)


def _remove_all_occurrences(text: str, phrase: str) -> str:
    """
    Remove every case-insensitive occurrence of *phrase* from *text*,
    matching it as a literal string (not a regex), then return the result.

    We use re.sub with re.IGNORECASE so that spans like "ASAP", "Asap", and
    "asap" all get stripped from the original-cased title string.
    """
    return re.sub(re.escape(phrase), "", text, flags=re.IGNORECASE)


def parse(description: str) -> dict:
    """
    Apply the deterministic mock-parser algorithm to *description* and return
    a dict with title, priority, and due_date_hint.

    Algorithm (follows spec exactly):

    a. Build lower_desc = description.lower() for keyword matching.
       Keep *description* untouched for the title step.

    b. Priority — check lower_desc for group (i) / (ii) in order; first match wins.

    c. Due-date hint — check lower_desc for date phrases in the required order;
       first match wins.

    d. Title — strip from original-cased *description* every occurrence of
       every group (i)/(ii) keyword found anywhere in lower_desc, PLUS every
       occurrence of the matched date phrase (if any). .strip() the result.
       If empty/whitespace-only → "Untitled task".
    """

    # ── a. Lower-cased working copy ────────────────────────────────────────
    lower_desc = description.lower()

    # ── b. Priority ────────────────────────────────────────────────────────
    has_high = any(kw in lower_desc for kw in _HIGH_KEYWORDS)
    has_low  = any(kw in lower_desc for kw in _LOW_KEYWORDS)

    if has_high:
        priority = "high"
    elif has_low:
        priority = "low"
    else:
        priority = "medium"

    # ── c. Due-date hint ───────────────────────────────────────────────────
    due_date_hint = None
    for phrase in _DATE_PHRASES_IN_ORDER:
        if phrase in lower_desc:
            due_date_hint = phrase   # store as lower-case matched text
            break

    # ── d. Title ───────────────────────────────────────────────────────────
    # Start from the original-cased description.
    title = description

    # Strip every occurrence of every group (i) keyword found anywhere
    for kw in _HIGH_KEYWORDS:
        if kw in lower_desc:
            title = _remove_all_occurrences(title, kw)

    # Strip every occurrence of every group (ii) keyword found anywhere
    for kw in _LOW_KEYWORDS:
        if kw in lower_desc:
            title = _remove_all_occurrences(title, kw)

    # Strip every occurrence of the matched date phrase (if any)
    if due_date_hint is not None:
        title = _remove_all_occurrences(title, due_date_hint)

    title = title.strip()
    if not title:
        title = "Untitled task"

    return {
        "title":         title,
        "priority":      priority,
        "due_date_hint": due_date_hint,
    }


# ---------------------------------------------------------------------------
# Role-based prompt construction (mirrors what a real LLM call would use)
# ---------------------------------------------------------------------------

SYSTEM_MESSAGE = (
    "You are a task-extraction assistant. "
    "Given a free-text task description, extract exactly three fields and "
    "respond with a JSON object containing only these keys:\n"
    '  "title"         : the task description with priority/date keywords removed, '
    "trimmed; use \"Untitled task\" if nothing remains.\n"
    '  "priority"      : one of "low", "medium", or "high". '
    'Use "high" if the text contains "urgent" or "asap"; '
    '"low" if it contains "whenever" or "low priority"; '
    'otherwise "medium".\n'
    '  "due_date_hint" : the first date phrase found in the text '
    '("today", "tomorrow", "next week", "next monday" … "next sunday", '
    '"monday" … "sunday"), lower-case, or null if none is present.\n'
    "Return only the JSON object — no prose, no markdown fences."
)


def build_messages(description: str) -> list[dict]:
    """
    Build the role-based message list used for an LLM call (or logged
    alongside the mock result so the code path looks the same either way).

    Returns:
        [
            {"role": "system", "content": SYSTEM_MESSAGE},
            {"role": "user",   "content": description},
        ]
    """
    return [
        {"role": "system", "content": SYSTEM_MESSAGE},
        {"role": "user",   "content": description},
    ]
