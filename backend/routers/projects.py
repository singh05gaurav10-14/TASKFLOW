"""
Project endpoints.

POST   /projects/                    → 201  Create a new project
GET    /projects/                    → 200  List all projects
GET    /projects/{id}                → 200  Get a single project (404 if not found)
GET    /projects/{id}/tasks          → 200  Get project + all tasks via ORM relationship
PUT    /projects/{id}                → 200  Update a project (title / description)
DELETE /projects/{id}                → 200  Delete a project and its tasks (cascade)
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db


# ---------------------------------------------------------------------------
# ProjectUpdate — PATCH-style partial update body (both fields optional)
# ---------------------------------------------------------------------------

class ProjectUpdate(BaseModel):
    """All fields are optional — only the supplied ones are written."""
    title:       Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = None

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not v.strip():
            raise ValueError("title must not be blank or whitespace-only")
        return v.strip() if v is not None else v

router = APIRouter(prefix="/projects", tags=["projects"])


# ---------------------------------------------------------------------------
# Internal helper
# ---------------------------------------------------------------------------

def _get_project_or_404(project_id: int, db: Session) -> models.Project:
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project with id={project_id} not found.",
        )
    return project


# ---------------------------------------------------------------------------
# POST /projects/   — create
# ---------------------------------------------------------------------------

@router.post("/", response_model=schemas.ProjectOut, status_code=status.HTTP_201_CREATED)
def create_project(payload: schemas.ProjectCreate, db: Session = Depends(get_db)):
    """Create a new project.  Returns 404 if the owner does not exist."""
    owner = db.query(models.User).filter(models.User.id == payload.owner_id).first()
    if owner is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User with id={payload.owner_id} not found.",
        )

    project = models.Project(
        title=payload.title,
        description=payload.description,
        owner_id=payload.owner_id,
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


# ---------------------------------------------------------------------------
# GET /projects/   — list all
# ---------------------------------------------------------------------------

@router.get("/", response_model=List[schemas.ProjectOut], status_code=status.HTTP_200_OK)
def list_projects(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """Return a paginated list of all projects."""
    return db.query(models.Project).offset(skip).limit(limit).all()


# ---------------------------------------------------------------------------
# GET /projects/{project_id}/tasks
# — resolves tasks via the ORM relationship (back_populates)
# ---------------------------------------------------------------------------

@router.get(
    "/{project_id}/tasks",
    response_model=schemas.ProjectWithTasksOut,
    status_code=status.HTTP_200_OK,
    summary="Get project with its tasks (via ORM relationship)",
)
def get_project_with_tasks(project_id: int, db: Session = Depends(get_db)):
    """
    Fetch a project **and** all its tasks resolved through the SQLAlchemy
    ORM relationship (``Project.tasks ←→ Task.project``).

    SQLAlchemy's lazy='select' strategy automatically issues a second
    ``SELECT … WHERE tasks.project_id = :id`` the first time
    ``project.tasks`` is accessed — no explicit join needed.

    Proof that ``back_populates`` works on both sides:
    - ``project.tasks``    → list of Task ORM objects  ✓
    - ``task.project``     → the parent Project object  ✓  (verified below)
    """
    project = _get_project_or_404(project_id, db)

    # Access the relationship to trigger lazy-load (fires SELECT on tasks table)
    # This line proves that project.tasks resolves correctly.
    _ = project.tasks  # noqa: F841  — touched so SQLAlchemy loads the collection

    # Also verify the reverse side: every task's .project points back here
    for task in project.tasks:
        assert task.project is project  # back_populates sanity check

    # ProjectWithTasksOut has from_attributes=True — Pydantic reads .tasks directly
    return project


# ---------------------------------------------------------------------------
# GET /projects/{project_id}   — single project (flat, no tasks)
# ---------------------------------------------------------------------------

@router.get("/{project_id}", response_model=schemas.ProjectOut, status_code=status.HTTP_200_OK)
def get_project(project_id: int, db: Session = Depends(get_db)):
    """Fetch one project by primary key; 404 if not found."""
    return _get_project_or_404(project_id, db)


# ---------------------------------------------------------------------------
# PUT /projects/{project_id}   — partial update (title and/or description)
# ---------------------------------------------------------------------------

@router.put("/{project_id}", response_model=schemas.ProjectOut, status_code=status.HTTP_200_OK)
def update_project(
    project_id: int,
    payload: ProjectUpdate,
    db: Session = Depends(get_db),
):
    """
    Update a project's title and/or description.
    Only the fields that are explicitly supplied in the body are written;
    omitted fields remain unchanged.
    Returns 404 if the project does not exist; 422 on validation failure.
    """
    project = _get_project_or_404(project_id, db)

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(project, field, value)

    db.commit()
    db.refresh(project)
    return project


# ---------------------------------------------------------------------------
# DELETE /projects/{project_id}
# ---------------------------------------------------------------------------

@router.delete("/{project_id}", status_code=status.HTTP_200_OK)
def delete_project(project_id: int, db: Session = Depends(get_db)):
    """
    Delete a project and all its tasks (cascade delete-orphan fires automatically
    via the ORM relationship defined in models.py).
    """
    project = _get_project_or_404(project_id, db)
    db.delete(project)
    db.commit()
    return {"detail": f"Project with id={project_id} deleted successfully."}
