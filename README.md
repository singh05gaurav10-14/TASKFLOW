# TaskFlow — Full-Stack Task Manager

A full-stack task-management application with a FastAPI/SQLAlchemy backend,
a vanilla-JS frontend, hand-rolled sorting/searching algorithms, and an
AI-powered quick-add feature.

---

## Table of Contents

1. [Project layout](#project-layout)
2. [Quick start (two-process run)](#quick-start-two-process-run)
3. [Environment variables](#environment-variables)
4. [Database schema](#database-schema)
5. [API reference](#api-reference)
6. [Architecture notes](#architecture-notes)
7. [Section 2 — Algorithms engine](#section-2--algorithms-engine)
8. [Section 3 — AI Quick-Add](#section-3--ai-quick-add)
9. [Acceptance criteria evidence](#acceptance-criteria-evidence)

---

## Project layout

```
taskflow/
├── backend/
│   ├── main.py              # FastAPI app, middleware, CORS, router mounts
│   ├── models.py            # SQLAlchemy ORM models (User, Project, Task)
│   ├── schemas.py           # Pydantic request/response schemas
│   ├── database.py          # Engine, SessionLocal, get_db() dependency
│   ├── config.py            # Reads .env via python-dotenv
│   ├── algorithms.py        # insertion_sort, binary_search, linear_search
│   ├── algorithms_count.py  # Comparison-counting variants for benchmarks
│   ├── mock_parser.py       # Deterministic AI parser for quick-add
│   ├── requirements.txt
│   └── routers/
│       ├── users.py         # POST/GET /users/, GET/DELETE /users/{id}
│       ├── projects.py      # Full CRUD /projects/
│       ├── tasks.py         # Full CRUD /tasks/ + search + sort
│       ├── stats.py         # GET /stats/projects/{id}
│       └── quick_add.py     # POST /tasks/quick-add
├── frontend/
│   ├── index.html           # Semantic HTML, three-panel layout
│   ├── styles.css           # Box model, sticky header, 3 @media breakpoints
│   └── app.js               # Vanilla JS — Fetch API, DOM rendering, localStorage
├── seed.py                  # Seed DB with N tasks for benchmarking
├── benchmark.py             # Measure comparison counts at 10/500/3000 rows
├── check_algorithms.py      # 12 automated pass/fail algorithm checks
├── .env.example             # Template — copy to .env before running
└── README.md
```

---

## Quick start (two-process run)

This is the **recommended** way to run the app locally.
Two terminal windows: one for the backend API, one for the static frontend.

### Prerequisites

- Python 3.11 or 3.12
- A static-file server for the frontend (VS Code **Live Server** extension is the
  easiest choice; any other static server on port 5500 works equally well)

### Step 1 — Clone and create a virtual environment

```bash
git clone <repo-url>
cd taskflow
python -m venv venv
```

Activate the virtual environment:

```bash
# Windows (PowerShell)
.\venv\Scripts\Activate.ps1

# Windows (cmd)
.\venv\Scripts\activate.bat

# macOS / Linux
source venv/bin/activate
```

### Step 2 — Install backend dependencies

```bash
pip install -r backend/requirements.txt
```

> **SQLite (default):** No extra steps. The database file `app.db` is created
> automatically in the `taskflow/` root on first run.
>
> **PostgreSQL (optional):** Uncomment `psycopg2-binary` in `requirements.txt`,
> install it, and set `DATABASE_URL` in your `.env` file.

### Step 3 — Create your `.env` file

```bash
cp .env.example .env
```

The default `.env.example` values work out of the box for SQLite + Live Server:

```
DATABASE_URL=sqlite:///./app.db
APP_ENV=development
ALLOWED_ORIGINS=http://localhost:5500,http://127.0.0.1:5500,null
```

Leave these values unchanged unless you are using a different port or database.

### Step 4 — Start the backend

Open **Terminal 1** and run from the `taskflow/` root:

```bash
cd backend
uvicorn main:app --reload --port 8000
```

Expected output:

```
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
INFO:     Started reloader process ...
INFO:     Application startup complete.
2026-08-05 20:38:44  INFO     Database tables ensured / created.
```

The interactive API docs are available at <http://127.0.0.1:8000/docs>.

### Step 5 — Serve the frontend

Open **Terminal 2**.

**Option A — VS Code Live Server (recommended)**

1. Open the `taskflow/` folder in VS Code.
2. Right-click `frontend/index.html` → **Open with Live Server**.
3. Live Server starts on `http://127.0.0.1:5500` (or `http://localhost:5500`).

**Option B — Python's built-in HTTP server**

```bash
cd frontend
python -m http.server 5500
```

Then open <http://127.0.0.1:5500> in your browser.

**Option C — Open `index.html` directly**

Double-click `frontend/index.html` to open it as a `file://` URL.
This works because `null` is listed in `ALLOWED_ORIGINS` (the browser sends
`Origin: null` for `file://` requests). Note: some Chromium-based browsers
block cross-origin fetch from `file://` regardless of CORS headers — use
Option A or B if you see CORS errors.

### Step 6 — Verify the connection

With both processes running, open the dashboard. The Users panel should show
"Loading users…" briefly, then either an empty list (clean DB) or your
existing users. Add a user → add a project → add a task to confirm the full
create flow works end to end.

The backend terminal will print a log line for every request:

```
2026-08-05 20:38:45  INFO     GET /users/  →  200  (3.21 ms)
2026-08-05 20:38:46  INFO     POST /tasks/  →  201  (12.44 ms)
```

---

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `sqlite:///./app.db` | SQLAlchemy connection string |
| `APP_ENV` | `development` | `development` enables SQL query logging |
| `ALLOWED_ORIGINS` | `http://localhost:5500,http://127.0.0.1:5500,null` | Comma-separated CORS origins |
| `USE_REAL_LLM` | `false` | Set `true` to route quick-add through OpenAI |
| `OPENAI_API_KEY` | _(unset)_ | Required when `USE_REAL_LLM=true` |

---

## Database schema

Three tables, implemented as SQLAlchemy ORM models in `backend/models.py`.

### `users`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | INTEGER | PRIMARY KEY, auto-increment |
| `name` | VARCHAR(255) | NOT NULL |
| `email` | VARCHAR(255) | NOT NULL, UNIQUE, indexed |
| `created_at` | DATETIME | NOT NULL, server default = now() |

### `projects`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | INTEGER | PRIMARY KEY, auto-increment |
| `title` | VARCHAR(255) | NOT NULL |
| `description` | TEXT | nullable |
| `owner_id` | INTEGER | NOT NULL, FK → `users.id` ON DELETE CASCADE |
| `created_at` | DATETIME | NOT NULL, server default = now() |

### `tasks`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | INTEGER | PRIMARY KEY, auto-increment |
| `title` | VARCHAR(255) | NOT NULL |
| `description` | TEXT | nullable |
| `status` | VARCHAR(20) | NOT NULL, default `todo`, CHECK IN ('todo','in_progress','done') |
| `priority` | VARCHAR(10) | NOT NULL, default `medium`, CHECK IN ('low','medium','high') |
| `due_date` | VARCHAR(100) | nullable — stores both `2024-12-31` and `next friday` as plain text |
| `project_id` | INTEGER | NOT NULL, FK → `projects.id` ON DELETE CASCADE |
| `created_at` | DATETIME | NOT NULL, server default = now() |

### ORM relationships

```
User.projects   ←→  Project.owner    (one-to-many, back_populates on both sides)
Project.tasks   ←→  Task.project     (one-to-many, back_populates on both sides)
```

Both sides resolve correctly:

```python
project.tasks   # → list[Task]  (lazy SELECT fires automatically)
task.project    # → Project     (back_populates)
user.projects   # → list[Project]
project.owner   # → User
```

Cascade `all, delete-orphan` is set on both relationships so deleting a user
removes all their projects and tasks, and deleting a project removes all its tasks.

---

## API reference

All endpoints are prefixed with `http://127.0.0.1:8000`.
Interactive docs: <http://127.0.0.1:8000/docs>

### Users

| Method | Path | Success | Failure |
|--------|------|---------|---------|
| POST | `/users/` | 201 — created | 422 blank name/invalid email |
| GET | `/users/` | 200 — list | — |
| GET | `/users/{id}` | 200 — user object | 404 not found |
| GET | `/users/{id}/projects` | 200 — user + projects list | 404 not found |
| DELETE | `/users/{id}` | 200 — confirmation | 404 not found |

### Projects

| Method | Path | Success | Failure |
|--------|------|---------|---------|
| POST | `/projects/` | 201 — created | 422 blank title · 404 owner not found |
| GET | `/projects/` | 200 — list | — |
| GET | `/projects/{id}` | 200 — project object | 404 not found |
| GET | `/projects/{id}/tasks` | 200 — project + tasks | 404 not found |
| PUT | `/projects/{id}` | 200 — updated | 404 not found · 422 blank title |
| DELETE | `/projects/{id}` | 200 — confirmation | 404 not found |

### Tasks

| Method | Path | Success | Failure |
|--------|------|---------|---------|
| POST | `/tasks/` | 201 — created | 422 blank title / bad priority · 404 project not found |
| GET | `/tasks/` | 200 — list | — |
| GET | `/tasks/?project_id=N` | 200 — filtered list | — |
| GET | `/tasks/?sort=priority` | 200 — sorted by priority (insertion_sort) | 422 bad sort param |
| GET | `/tasks/?sort=due_date` | 200 — sorted by due_date (insertion_sort) | 422 bad sort param |
| GET | `/tasks/search?title=X&algo=binary` | 200 — matched task | 404 not found |
| GET | `/tasks/search?title=X&algo=linear` | 200 — matched task | 404 not found |
| GET | `/tasks/{id}` | 200 — task object | 404 not found |
| PUT | `/tasks/{id}` | 200 — updated | 404 not found · 422 blank title |
| DELETE | `/tasks/{id}` | 200 — confirmation | 404 not found |

### Statistics

| Method | Path | Success | Failure |
|--------|------|---------|---------|
| GET | `/stats/projects/{id}` | 200 — total + count-by-status | 404 not found |

The aggregation is executed entirely in SQL (`COUNT` + `GROUP BY tasks.status`);
no Python-side aggregation over a full result set is performed.

### Quick-Add (Section 3)

| Method | Path | Success | Failure |
|--------|------|---------|---------|
| POST | `/tasks/quick-add` | 201 — created task | 422 blank description · 404 project not found |

Request body: `{ "description": "<free text>", "project_id": <int> }`

---

## Architecture notes

### Shared `get_db` dependency

`database.get_db()` is defined once and injected into every endpoint via
`Depends(get_db)`.  It yields a SQLAlchemy `Session` and guarantees the session
is closed after the request even if an exception is raised.  It is used in:
`routers/users.py`, `routers/projects.py`, `routers/tasks.py`,
`routers/stats.py`, and `routers/quick_add.py`.

### Logging middleware

`LoggingMiddleware(BaseHTTPMiddleware)` in `main.py` runs on **every** request
and logs the HTTP method, path, response status code, and processing time in
milliseconds to stdout:

```
2026-08-05 20:38:44  INFO     GET /tasks/  →  200  (3.21 ms)
2026-08-05 20:38:44  INFO     POST /tasks/  →  201  (12.44 ms)
2026-08-05 20:38:44  INFO     OPTIONS /tasks/  →  200  (0.18 ms)
```

It is added before the CORS middleware so preflight `OPTIONS` requests are
also logged.

### CORS configuration

Configured in `main.py` using `CORSMiddleware` with explicit values — no
wildcards:

```python
allow_origins = ["http://localhost:5500", "http://127.0.0.1:5500", "null"]
allow_methods = ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
allow_headers = ["Content-Type", "Authorization", "Accept", "X-Requested-With"]
```

The origins list is read from `ALLOWED_ORIGINS` in `.env` so it can be
adjusted without touching code.

### Frontend data flow

All data in the frontend comes from the real backend — there is no mock,
no hard-coded task list, and no disconnected data layer:

1. **Page load:** `init()` calls `loadUsers()` → `GET /users/`.
2. **Select user:** `loadProjectsForUser()` → `GET /users/{id}/projects`.
3. **Select project:** `loadTasksForProject()` → `GET /tasks/?project_id=N`.
4. **Add task:** `POST /tasks/` → refresh list.
5. **Edit task:** `PUT /tasks/{id}` → update list in place.
6. **Delete task:** `DELETE /tasks/{id}` → remove from list.

### localStorage cache

`frontend/app.js` caches the task list for each project in `localStorage`
under the key `tf_tasks_<projectId>` (serialised with `JSON.stringify`).

On project select, the cached array is read with `JSON.parse` and rendered
immediately so the list is never blank while the live fetch is in flight.
The cache is written (`setTaskCache`) after every mutation — create, edit,
delete, checkbox toggle, and status change — so it always reflects the last
known backend state.  The cache is a **performance optimisation**, not a data
source: the live backend response always overwrites it.

### Pydantic validation

`TaskCreate` and `TaskUpdate` in `schemas.py` enforce:

- `priority: Literal["low", "medium", "high"]` — Field constraint; any other
  value returns 422 automatically.
- `@field_validator("title")` — strips whitespace then raises `ValueError` if
  the result is empty, catching inputs like `"   "` that `min_length=1` would
  pass.

The same `PriorityType` literal is reused by `QuickAddRequest` and the mock
parser, keeping the allowed values consistent across the whole stack.

---

## Section 2 — Algorithms engine

### Algorithm complexity

#### `insertion_sort`

| Case | Complexity | Why |
|------|-----------|-----|
| Best | O(n) | Input already sorted; inner while-loop never executes. |
| Worst | O(n²) | Reverse-sorted; every element shifts to index 0, giving 1+2+…+(n-1) comparisons. |

#### `binary_search`

| Case | Complexity | Why |
|------|-----------|-----|
| Best | O(1) | Target is the first midpoint chosen. |
| Worst | O(log n) | Each iteration halves the search space. |

#### `linear_search`

| Case | Complexity | Why |
|------|-----------|-----|
| Best | O(1) | Target is the first element. |
| Worst | O(n) | Target absent or last; every element inspected. |

### Benchmark results (real DB data — three sizes)

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

### Analysis: is paying the sort cost worth it?

Sorting 3,000 tasks costs **1,501,499 comparisons** — roughly n²/6, which is
exactly what insertion sort's O(n²) worst case predicts for a mix of three
repeated values.  A subsequent binary search costs only **12 comparisons**,
versus up to **3,000** for a linear scan.

For TaskFlow's read-heavy workload (re-sort the board several times a day,
add only a handful of tasks), paying the one-time sort cost per request is
worth it: it converts every subsequent search from O(n) to O(log n).

### Algorithm endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/tasks?sort=priority` | Sort by priority using `insertion_sort` |
| GET | `/tasks?sort=due_date` | Sort by due_date using `insertion_sort` |
| GET | `/tasks/search?title=X&algo=binary` | `insertion_sort` + `binary_search` |
| GET | `/tasks/search?title=X&algo=linear` | `linear_search` on unsorted index |

No `ORDER BY`, `sorted()`, or `list.sort()` is used.

### Running the scripts

```bash
# Seed the database at 10, 500, 3000 tasks
python seed.py --clear

# Run comparison-counting benchmarks
python benchmark.py

# Run all 12 automated algorithm checks
python check_algorithms.py
```

---

## Section 3 — AI Quick-Add

### Endpoint

```
POST /tasks/quick-add
Content-Type: application/json

{ "description": "<free text>", "project_id": <int> }
```

Returns the created task (201).  
Returns 422 if the description is blank or parsed fields fail validation.  
Returns 404 if `project_id` does not exist.

Set `USE_REAL_LLM=true` **and** `OPENAI_API_KEY=<key>` in `.env` to route
through a real model.  The default (no flag, no key) uses the deterministic
mock — no paid API required.

### Prompting technique

The system message uses **zero-shot prompting**: the instruction specifies
exactly what to extract and what format to return, with no worked examples.

Zero-shot was chosen for three reasons:

1. **Token economy** — the extraction problem is simple and fully constrained
   by the system message; few-shot examples would add 50–150 tokens per
   request with no correctness benefit.
2. **Reliability** — every decision rule is explicit in the prompt ("use
   'high' if the text contains 'urgent' or 'asap'"), leaving no ambiguity.
   This makes the response as predictable as the deterministic mock.
3. **Consistency** — the system message is the specification for the mock.
   Any divergence between the two would be a bug, so they stay in sync.

### Five example inputs

These outputs are produced by `mock_parser.parse()`.  Verify with:

```bash
# Run from the backend/ directory (or taskflow/ root with path adjusted)
python -c "from mock_parser import parse; import json; print(json.dumps(parse('YOUR INPUT'), indent=2))"
```

**Input 1:** `"This is urgent, mark it ASAP please"`
```json
{ "title": "This is , mark it  please", "priority": "high", "due_date_hint": null }
```
Both "urgent" and "ASAP" stripped (both are group-i keywords). Priority = high
because group-i matched first. No date keyword present.

**Input 2:** `" "` *(whitespace only)*
```json
{ "title": "Untitled task", "priority": "medium", "due_date_hint": null }
```
No keyword matches. Stripped result is empty, so title falls back to the
placeholder `"Untitled task"`. Priority defaults to medium.

**Input 3:** `"Finish the report next Friday, it's urgent"`
```json
{ "title": "Finish the report , it's", "priority": "high", "due_date_hint": "next friday" }
```
"urgent" → group-i → priority = high. "next Friday" matched as one whole
two-word phrase before the bare-weekday pass; both "urgent" and "next friday"
spans stripped from the title.

**Input 4:** `"tomorrow review tomorrow"`
```json
{ "title": "review", "priority": "medium", "due_date_hint": "tomorrow" }
```
No priority keyword → medium. "tomorrow" matched on the first date-phrase check;
every occurrence (both instances) stripped, leaving only "review".

**Input 5:** `"Whenever you can, review the docs next monday"`
```json
{ "title": "you can, review the docs", "priority": "low", "due_date_hint": "next monday" }
```
"whenever" → group-ii → priority = low. "next monday" matched as a two-word
phrase and stripped. "whenever" also stripped from the title.

---

## Acceptance criteria evidence

| Criterion | Evidence |
|-----------|----------|
| Backend starts with no errors | `uvicorn main:app --reload --port 8000` exits cleanly; all 19 routes registered (confirmed by `python -c "import main; [print(r.path) for r in main.app.routes if hasattr(r,'path')]"`) |
| Three tables with PK / FK / constraints | `models.py`: `users.email` UNIQUE NOT NULL, `projects.owner_id` FK→users, `tasks.project_id` FK→projects, `tasks.priority` CHECK IN ('low','medium','high') |
| Full CRUD for tasks; create + list for projects and users | See API reference table; 201 on create, 404 on missing id, 422 on bad body |
| Statistics endpoint uses SQL aggregation | `stats.py`: `func.count()` + `.group_by(models.Task.status)` — no Python-side counting |
| `get_db` dependency reused | `Depends(get_db)` appears in `users.py`, `projects.py`, `tasks.py`, `stats.py`, `quick_add.py` |
| Middleware log visible | Every request prints `METHOD PATH → STATUS (ms)` to the uvicorn console |
| CORS names explicit origin | `allow_origins=ALLOWED_ORIGINS` — values are `http://localhost:5500`, `http://127.0.0.1:5500`, `null`; no unconditional `*` |
| Dashboard shows real backend data | `app.js` line 7: `const API_BASE = "http://127.0.0.1:8000"` — every API function calls `apiFetch()` against this URL; no hard-coded tasks |
| Layout changes at breakpoints | `styles.css`: `@media (max-width: 1024px)` stacks panels 2-up; `@media (max-width: 767px)` switches to mobile drill-down; `@media (max-width: 479px)` collapses detail grid |
| Sticky / fixed persistent UI element | `.site-header { position: sticky; top: 0; z-index: 300; }` (desktop); `.mobile-header { position: sticky; top: 0; }` (mobile) |
| Empty-title validation shows error, no task created | `validateField(tTitle, tTitleErr, "Title is required.")` blocks submit; error shown in `<span id="t-title-err">`; clears on next valid input |
| Reload shows same tasks as DB | `loadTasksForProject()` fetches `GET /tasks/?project_id=N` on every project select; localStorage cache is seeded first but overwritten by live data |
| Feature branch with ≥2 commits merged to main | `git log --oneline --all --graph` shows `feature/localstorage-cache-and-readme` branch with commits merged into `main` |
