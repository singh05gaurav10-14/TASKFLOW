"""
routers/tasks.py
----------------
Task endpoints — full CRUD plus two algorithm-powered endpoints.

POST    /tasks/                             201  Create a task
GET     /tasks/                             200  List tasks (optional filter + sort)
GET     /tasks/search?title=&algo=          200  Search by exact title
GET     /tasks/{id}                         200  Get one task
PUT     /tasks/{id}                         200  Update a task
DELETE  /tasks/{id}                         200  Delete a task

Sorting and searching use the hand-rolled functions from algorithms.py —
never Python's sorted() / list.sort() and never a DB ORDER BY.
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

import models
import schemas
from algorithms import binary_search, insertion_sort, linear_search
from database import get_db

router = APIRouter(prefix="/tasks", tags=["tasks"])

# Priority rank used when sorting by priority so that "low" < "medium" < "high"
PRIORITY_RANK = {"low": 1, "medium": 2, "high": 3}


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _get_task_or_404(task_id: int, db: Session) -> models.Task:
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if task is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task with id={task_id} not found.",
        )
    return task


def _task_to_dict(task: models.Task) -> dict:
    """Convert an ORM Task to a plain dict matching the TaskOut schema fields."""
    return {
        "id":          task.id,
        "title":       task.title,
        "description": task.description,
        "status":      task.status,
        "priority":    task.priority,
        "due_date":    task.due_date,
        "project_id":  task.project_id,
        "created_at":  task.created_at,
        # Computed rank key used internally for priority sort; stripped before return
        "_priority_rank": PRIORITY_RANK.get(task.priority, 0),
    }


# ---------------------------------------------------------------------------
# POST /tasks/   — create
# ---------------------------------------------------------------------------

@router.post("/", response_model=schemas.TaskOut, status_code=status.HTTP_201_CREATED)
def create_task(payload: schemas.TaskCreate, db: Session = Depends(get_db)):
    """
    Create a new task.
    Returns 422 on Pydantic validation failure, 404 if the project is missing.
    """
    project = db.query(models.Project).filter(
        models.Project.id == payload.project_id
    ).first()
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project with id={payload.project_id} not found.",
        )

    task = models.Task(
        title=payload.title,
        description=payload.description,
        priority=payload.priority,
        status=payload.status,
        due_date=payload.due_date,
        project_id=payload.project_id,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


# ---------------------------------------------------------------------------
# GET /tasks/search   — must be declared BEFORE /{task_id} to avoid collision
# ---------------------------------------------------------------------------

@router.get("/search", status_code=status.HTTP_200_OK)
def search_tasks(
    title: str = Query(..., description="Exact task title to search for"),
    algo: str  = Query(default="binary", description="'binary' or 'linear'"),
    db: Session = Depends(get_db),
):
    """
    Search for a task by exact title using the hand-rolled search algorithms.

    - ``algo=binary``  sorts the in-memory title index with ``insertion_sort``
      then locates the title with ``binary_search``.
    - ``algo=linear``  scans the unsorted index with ``linear_search``.

    Returns the full task on a match (200) or 404 when the title is absent.
    No ORDER BY or Python built-in sort is used at any point.
    """
    if algo not in ("binary", "linear"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="algo must be 'binary' or 'linear'.",
        )

    # 1. Fetch all tasks from the DB into an in-memory list of dicts
    rows = db.query(models.Task).all()
    index = [{"id": t.id, "title": t.title} for t in rows]

    if not index:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No tasks exist in the database.",
        )

    if algo == "binary":
        # Sort the index by title with our own insertion_sort, then binary search
        insertion_sort(index, key="title")
        found_idx = binary_search(index, target_value=title, key="title")
    else:
        # Linear search on the unsorted index
        found_idx = linear_search(index, target_value=title, key="title")

    if found_idx == -1:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No task found with title '{title}'.",
        )

    task_id = index[found_idx]["id"]
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    return schemas.TaskOut.model_validate(task)


# ---------------------------------------------------------------------------
# GET /tasks/   — list (with optional sort)
# ---------------------------------------------------------------------------

@router.get("/", response_model=List[schemas.TaskOut], status_code=status.HTTP_200_OK)
def list_tasks(
    project_id: Optional[int] = Query(default=None, description="Filter by project"),
    sort: Optional[str]       = Query(default=None,
                                      description="Sort field: 'priority' or 'due_date'"),
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    """
    Return tasks, optionally filtered by project and sorted by a field.

    When ``sort=priority`` or ``sort=due_date`` is supplied the tasks are
    fetched from the DB (without any ORDER BY), converted to plain dicts,
    sorted in place with ``insertion_sort``, and returned.

    The ordering the client sees is produced entirely by the hand-rolled
    ``insertion_sort`` — not by the database and not by Python's built-in sort.
    """
    query = db.query(models.Task)
    if project_id is not None:
        query = query.filter(models.Task.project_id == project_id)
    rows = query.offset(skip).limit(limit).all()

    if sort is None:
        return rows

    if sort not in ("priority", "due_date"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="sort must be 'priority' or 'due_date'.",
        )

    # Convert ORM objects → plain dicts so insertion_sort can compare values
    task_dicts = [_task_to_dict(t) for t in rows]

    if sort == "priority":
        # Sort by the numeric rank so low(1) < medium(2) < high(3)
        insertion_sort(task_dicts, key="_priority_rank")
    else:
        # due_date is stored as plain text; None values sort last
        # Temporarily replace None with a high sentinel so they go to the end
        SENTINEL = "\xff\xff"
        for d in task_dicts:
            if d["due_date"] is None:
                d["due_date"] = SENTINEL
        insertion_sort(task_dicts, key="due_date")
        for d in task_dicts:
            if d["due_date"] == SENTINEL:
                d["due_date"] = None

    # Strip the internal _priority_rank key before validating
    for d in task_dicts:
        d.pop("_priority_rank", None)

    return [schemas.TaskOut.model_validate(d) for d in task_dicts]


# ---------------------------------------------------------------------------
# GET /tasks/{task_id}
# ---------------------------------------------------------------------------

@router.get("/{task_id}", response_model=schemas.TaskOut, status_code=status.HTTP_200_OK)
def get_task(task_id: int, db: Session = Depends(get_db)):
    """Fetch one task by primary key; 404 if it does not exist."""
    return _get_task_or_404(task_id, db)


# ---------------------------------------------------------------------------
# PUT /tasks/{task_id}
# ---------------------------------------------------------------------------

@router.put("/{task_id}", response_model=schemas.TaskOut, status_code=status.HTTP_200_OK)
def update_task(
    task_id: int,
    payload: schemas.TaskUpdate,
    db: Session = Depends(get_db),
):
    """
    Partially update a task (only supplied fields are changed).
    404 if absent; 422 on Pydantic validation failure.
    """
    task = _get_task_or_404(task_id, db)

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(task, field, value)

    db.commit()
    db.refresh(task)
    return task


# ---------------------------------------------------------------------------
# DELETE /tasks/{task_id}
# ---------------------------------------------------------------------------

@router.delete("/{task_id}", status_code=status.HTTP_200_OK)
def delete_task(task_id: int, db: Session = Depends(get_db)):
    """Delete a task by primary key; 404 if absent."""
    task = _get_task_or_404(task_id, db)
    db.delete(task)
    db.commit()
    return {"detail": f"Task with id={task_id} deleted successfully."}
