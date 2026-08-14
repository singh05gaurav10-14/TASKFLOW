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
        "due_date_hint":  str | None   # raw phrase, lower-case, stored as-is
    }

Algorithm (follows spec exactly):

  a. Build lower_desc = description.lower() for keyword matching only;
     keep the original-cased description untouched for the title step (d).

  b. Priority — substring check on lower_desc, group (i) before group (ii):
       (i)  contains "urgent" or "asap"              → "high"
       (ii) contains "whenever" or "low priority"    → "low"
       (iii) neither matched                          → "medium"
     Group (i) wins if both groups are present.

  c. Due-date hint — first matching phrase wins (checked in spec order):
       "today", "tomorrow", "next week",
       "this weekend",
       "next monday" … "next sunday"  (Mon→Sun order, whole two-word span),
       "monday" … "sunday"            (Mon→Sun, bare names, only if no
                                       "next <day>" matched above).
     Stored as the exact lower-case matched phrase, or null if nothing matches.

  d. Title — start from original-cased description.
     Strip every occurrence of EVERY group-(i) and group-(ii) keyword found
     anywhere in lower_desc (not just the one that decided priority), PLUS
     every occurrence of the matched date phrase from step (c).
     Stripping uses whole-word / whole-phrase boundaries so that "urgent"
     is stripped from "fix urgent now" but "urgently" is stripped completely
     as its own keyword, not as "urgent" + leftover "ly".
     Collapse runs of spaces, .strip(), and fall back to "Untitled task" if
     the result is empty or whitespace-only.
"""

import re

# ---------------------------------------------------------------------------
# Priority keyword tables
# ---------------------------------------------------------------------------

# Group (i) — HIGH
# Detection uses plain substring match (spec: "contains 'urgent' or 'asap'")
# so "urgently" also triggers high.  Stripping uses the longest-first list
# so "urgently" is stripped as a whole word before the shorter "urgent" rule
# runs, preventing any "ly" residue in the title.
_HIGH_KEYWORDS_DETECT = ["urgent", "asap"]          # for substring detection
_HIGH_KEYWORDS_STRIP  = ["urgently", "urgent", "asap"]  # longest first for stripping

# Group (ii) — LOW
_LOW_KEYWORDS = ["whenever", "low priority"]

# ---------------------------------------------------------------------------
# Date-phrase table  (checked in this exact order — first match wins)
# ---------------------------------------------------------------------------

_NEXT_DAY_PHRASES = [
    "next monday", "next tuesday", "next wednesday", "next thursday",
    "next friday", "next saturday", "next sunday",
]

_BARE_DAY_NAMES = [
    "monday", "tuesday", "wednesday", "thursday",
    "friday", "saturday", "sunday",
]

_DATE_PHRASES_IN_ORDER = (
    ["today", "tomorrow", "next week", "this weekend"]
    + _NEXT_DAY_PHRASES
    + _BARE_DAY_NAMES
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _strip_pattern(phrase: str) -> re.Pattern:
    """
    Regex that matches *phrase* as a whole word / whole phrase so that
    stripping "urgent" does not eat part of "urgently", and stripping
    "next friday" consumes the full two-word span.

    (?<!\w) / (?!\w) are zero-width assertions that ensure the phrase is
    not surrounded by word characters on either side.
    """
    return re.compile(
        r"(?<!\w)" + re.escape(phrase) + r"(?!\w)",
        re.IGNORECASE,
    )


# Pre-compile all strip patterns (called on every parse() invocation).
_HIGH_STRIP_PATTERNS = [(_strip_pattern(kw), kw) for kw in _HIGH_KEYWORDS_STRIP]
_LOW_STRIP_PATTERNS  = [(_strip_pattern(kw), kw) for kw in _LOW_KEYWORDS]
_DATE_STRIP_PATTERNS = {p: _strip_pattern(p) for p in _DATE_PHRASES_IN_ORDER}


def parse(description: str) -> dict:
    """
    Parse *description* and return::

        {
            "title":         str,         # cleaned title, never empty
            "priority":      str,         # "low" | "medium" | "high"
            "due_date_hint": str | None,  # raw matched phrase or None
        }
    """

    # ── a. Lower-cased working copy ────────────────────────────────────────
    lower_desc = description.lower()

    # ── b. Priority — plain substring detection (spec: "contains …") ──────
    has_high = any(kw in lower_desc for kw in _HIGH_KEYWORDS_DETECT)
    has_low  = any(kw in lower_desc for kw in _LOW_KEYWORDS)

    if has_high:
        priority = "high"
    elif has_low:
        priority = "low"
    else:
        priority = "medium"

    # ── c. Due-date hint — first whole-phrase match wins ───────────────────
    due_date_hint: str | None = None
    for phrase in _DATE_PHRASES_IN_ORDER:
        # Use whole-phrase match so "next friday" is not split into
        # "next" + bare "friday", and "this weekend" is matched as one span.
        if _DATE_STRIP_PATTERNS[phrase].search(lower_desc):
            due_date_hint = phrase   # exact lower-case phrase
            break

    # ── d. Title — strip keywords then clean up whitespace ─────────────────
    title = description

    # Strip ALL group-(i) keywords found anywhere (whole-word, longest first)
    for pattern, kw in _HIGH_STRIP_PATTERNS:
        if kw in lower_desc:                 # quick pre-check before regex
            title = pattern.sub("", title)

    # Strip ALL group-(ii) keywords found anywhere (whole-phrase)
    for pattern, kw in _LOW_STRIP_PATTERNS:
        if kw in lower_desc:
            title = pattern.sub("", title)

    # Strip every occurrence of the matched date phrase
    if due_date_hint is not None:
        title = _DATE_STRIP_PATTERNS[due_date_hint].sub("", title)

    # Collapse multiple spaces left by removals, then strip ends
    title = re.sub(r" {2,}", " ", title).strip()
    if not title:
        title = "Untitled task"

    return {
        "title":         title,
        "priority":      priority,
        "due_date_hint": due_date_hint,
    }


# ---------------------------------------------------------------------------
# Role-based prompt construction
# ---------------------------------------------------------------------------

SYSTEM_MESSAGE = (
    "You are a task-extraction assistant. "
    "Given a free-text task description, extract exactly three fields and "
    "respond with a JSON object containing only these keys:\n"
    '  "title"         : the task description with priority/date keywords removed, '
    'trimmed; use "Untitled task" if nothing remains.\n'
    '  "priority"      : one of "low", "medium", or "high". '
    'Use "high" if the text contains "urgent" or "asap" (including "urgently"); '
    '"low" if it contains "whenever" or "low priority"; '
    'otherwise "medium".\n'
    '  "due_date_hint" : the first date phrase found in the text — one of '
    '"today", "tomorrow", "next week", "this weekend", '
    '"next monday" … "next sunday", "monday" … "sunday" — '
    'lower-case, or null if none is present.\n'
    "Return only the JSON object — no prose, no markdown fences."
)


def build_messages(description: str) -> list[dict]:
    """
    Build the role-based message list used by the endpoint
    (identical structure whether mock or real LLM answers).

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
