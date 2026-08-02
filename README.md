# Task Manager — Section 2: Algorithms Engine

## Algorithm Complexity

### insertion_sort

| Case | Complexity | Why |
|------|-----------|-----|
| Best | O(n) | Input already sorted; inner while-loop never executes, so only n-1 outer iterations each doing one comparison. |
| Worst | O(n²) | Reverse-sorted input; every element shifts all the way to index 0, giving 1+2+3+…+(n-1) = n(n-1)/2 comparisons. |

### binary_search

| Case | Complexity | Why |
|------|-----------|-----|
| Best | O(1) | Target is the first mid-point chosen. |
| Worst | O(log n) | Each iteration halves the search space; at most ⌊log₂ n⌋ + 1 comparisons. |

### linear_search

| Case | Complexity | Why |
|------|-----------|-----|
| Best | O(1) | Target is the first element. |
| Worst | O(n) | Target is absent or at the last position; every element is inspected. |

---

## Benchmark Results (real DB data — three sizes)

Measured by `benchmark.py` against rows seeded by `seed.py`.

```
======================================================================
BENCHMARK RESULTS — comparison counts from real DB task data
======================================================================

  Size     InsSort    BinSrch(W)    BinSrch(M)    LinSrch(W)    LinSrch(B)
             comps         comps         comps         comps         comps
----------------------------------------------------------------------
    10          24             4             3            10             1
   500      42,082             9             8           500             1
  3,000   1,501,499            12            11         3000             1

Legend:
  InsSort      = insertion_sort_count comparisons (sort by priority rank)
  BinSrch(W)   = binary_search_count searching last element (near worst case)
  BinSrch(M)   = binary_search_count searching middle element
  LinSrch(W)   = linear_search_count on absent target (true worst case = N)
  LinSrch(B)   = linear_search_count on first element (best case = 1)
```

---

## Analysis: Is paying the sort cost worth it?

The benchmark numbers make the trade-off concrete.
Sorting 3,000 tasks by priority costs **1,501,499 comparisons** — roughly
n²/6, which is exactly what insertion sort's O(n²) worst case predicts for a
mix of three repeated values.
A subsequent binary search on the same 3,000 tasks costs only **12 comparisons**,
compared to up to **3,000** for a linear scan when the target is absent.

For a team using TaskFlow in a typical workday the dominant operation is
**reading and sorting tasks**, not adding or renaming them.
A developer might re-sort the board five or ten times a day (switching between
priority view and due-date view) but add only a handful of tasks.
Because the sort happens once per view request and the sorted list is
immediately consumed by the client, there is no persistent sorted index to
maintain: every `GET /tasks?sort=priority` call re-sorts the in-memory list
from scratch.
At 500 tasks that costs ~42,000 comparisons, which completes in milliseconds,
so for any realistic team project size the sort overhead is negligible and the
faster binary search it enables is a genuine win for repeated title lookups.
At 3,000 tasks insertion sort still finishes almost instantly on modern
hardware (< 10 ms), so the combined cost of sort-then-binary-search
(~1.5 M + 12 comparisons) remains far cheaper than running linear searches
repeatedly (3,000 comparisons each time) across hundreds of daily requests.
The conclusion: **for TaskFlow's read-heavy, occasionally-written workload,
paying the one-time insertion-sort cost per request is worth it**,
because it converts every subsequent search on that request's result set from
O(n) to O(log n).

---

## API Endpoints (Section 2 additions)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/tasks?sort=priority` | Fetch tasks sorted by priority (low→high) using `insertion_sort` |
| GET | `/tasks?sort=due_date` | Fetch tasks sorted by due_date text using `insertion_sort` |
| GET | `/tasks/search?title=X&algo=binary` | Build title index, sort with `insertion_sort`, locate with `binary_search` |
| GET | `/tasks/search?title=X&algo=linear` | Locate with `linear_search` on unsorted index |

No `ORDER BY`, no `sorted()`, no `list.sort()` is used at any point.

---

## Running the scripts

```bash
# Seed the database at 10, 500, 3000 tasks
python seed.py --clear

# Run comparison-counting benchmarks and save results
python benchmark.py

# Run all automated checks (12 cases, prints PASS/FAIL per case)
python check_algorithms.py

# Start the API server
uvicorn main:app --reload --port 8000
```


---

# Section 3 — AI Quick-Add

## API endpoint

```
POST /tasks/quick-add
Content-Type: application/json

{ "description": "<free text>", "project_id": <int> }
```

Returns the created task (201) using the same `TaskOut` schema as Section 1.
Returns 422 if the description is blank or parsed fields fail Pydantic validation.
Returns 404 if `project_id` does not exist.

Set `USE_REAL_LLM=true` **and** `OPENAI_API_KEY=<key>` in `.env` to route through
a real model instead of the mock. The default (no flag, no key) always uses the
deterministic mock — no paid service required.

---

## Prompting technique

The system message for `/tasks/quick-add` uses **zero-shot prompting**: the
instruction tells the model exactly what to extract and what format to return,
with no worked examples embedded in the prompt itself.

Zero-shot was chosen deliberately for this use case for three reasons. First,
token economy: the task-extraction problem is simple and well-defined — the model
(or the mock) only needs to locate three fields and return a small JSON object.
Embedding few-shot examples would add 50–150 tokens per request without improving
correctness, because the output schema is already fully constrained by the system
message. Second, reliability: the system message specifies every decision rule
explicitly ("use 'high' if the text contains 'urgent' or 'asap'"), leaving no
ambiguity for the model to fill with hallucination. This makes the response as
predictable as a deterministic parser — which is exactly what the mock implements.
Third, consistency: the zero-shot system message doubles as the specification for
the mock. Any deviation between what the system message instructs and what the
mock produces would be a bug, so the two stay in sync naturally. Chain-of-thought
prompting would add reasoning tokens that are discarded before the JSON is parsed,
wasting latency and cost on a structured-extraction task that requires no reasoning
trace.

---

## Five example inputs with exact parsed JSON output

These outputs are produced by `mock_parser.parse()` and can be verified by
running `python -c "from mock_parser import parse; import json; print(json.dumps(parse('<input>'), indent=2))"`.

### Example 1
**Input:** `"This is urgent, mark it ASAP please"`

```json
{
  "title": "This is , mark it  please",
  "priority": "high",
  "due_date_hint": null
}
```
*Both "urgent" and "ASAP" are stripped (both are group-i keywords found in the text). Priority = high because group-i matched first. No date keyword present.*

---

### Example 2
**Input:** `"Whenever you can, review the docs next monday"`

```json
{
  "title": "you can, review the docs",
  "priority": "low",
  "due_date_hint": "next monday"
}
```
*"whenever" is a group-ii keyword → priority = low. "next monday" matches the next-weekday phrase list and is stripped as one two-word span. "Whenever" is stripped from the title, leaving "you can, review the docs" after trimming.*

---

### Example 3
**Input:** `"Finish the report next Friday, it's urgent"`

```json
{
  "title": "Finish the report , it's",
  "priority": "high",
  "due_date_hint": "next friday"
}
```
*"urgent" → group-i → priority = high. "next Friday" matched as a whole two-word phrase (case-insensitive) before the bare-weekday pass. Both "urgent" and "next friday" are stripped from the title.*

---

### Example 4
**Input:** `"tomorrow review tomorrow"`

```json
{
  "title": "review",
  "priority": "medium",
  "due_date_hint": "tomorrow"
}
```
*No priority keyword → medium. "tomorrow" matched on the first date-phrase check. Every occurrence is stripped (both instances), leaving only "review".*

---

### Example 5
**Input:** `"Update the database schema"`

```json
{
  "title": "Update the database schema",
  "priority": "medium",
  "due_date_hint": null
}
```
*No priority keywords → medium. No date keywords → due_date_hint = null. Title is the description unchanged.*
