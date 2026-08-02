"""
User endpoints.

POST   /users/                       → 201  Create a new user
GET    /users/                       → 200  List all users
GET    /users/{id}                   → 200  Get a single user (404 if not found)
GET    /users/{id}/projects          → 200  Get user + all their projects via ORM relationship
DELETE /users/{id}                   → 200  Delete a user and their projects (cascade)
"""

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db

router = APIRouter(prefix="/users", tags=["users"])


# ---------------------------------------------------------------------------
# Internal helper
# ---------------------------------------------------------------------------

def _get_user_or_404(user_id: int, db: Session) -> models.User:
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User with id={user_id} not found.",
        )
    return user


# ---------------------------------------------------------------------------
# POST /users/   — create
# ---------------------------------------------------------------------------

@router.post("/", response_model=schemas.UserOut, status_code=status.HTTP_201_CREATED)
def create_user(payload: schemas.UserCreate, db: Session = Depends(get_db)):
    """Create a new user.  Returns 422 automatically on Pydantic validation errors."""
    existing = db.query(models.User).filter(models.User.email == payload.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"A user with email '{payload.email}' already exists.",
        )

    user = models.User(name=payload.name, email=payload.email)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


# ---------------------------------------------------------------------------
# GET /users/   — list all
# ---------------------------------------------------------------------------

@router.get("/", response_model=List[schemas.UserOut], status_code=status.HTTP_200_OK)
def list_users(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """Return a paginated list of users."""
    return db.query(models.User).offset(skip).limit(limit).all()


# ---------------------------------------------------------------------------
# GET /users/{user_id}/projects
# — resolves projects via the ORM relationship (back_populates)
# ---------------------------------------------------------------------------

@router.get(
    "/{user_id}/projects",
    response_model=schemas.UserWithProjectsOut,
    status_code=status.HTTP_200_OK,
    summary="Get user with their projects (via ORM relationship)",
)
def get_user_with_projects(user_id: int, db: Session = Depends(get_db)):
    """
    Fetch a user **and** all their projects resolved through the SQLAlchemy
    ORM relationship (``User.projects ←→ Project.owner``).

    SQLAlchemy's lazy='select' strategy automatically issues a second
    ``SELECT … WHERE projects.owner_id = :id`` the first time
    ``user.projects`` is accessed — no explicit join needed.

    Proof that ``back_populates`` works on both sides:
    - ``user.projects``      → list of Project ORM objects  ✓
    - ``project.owner``      → the owner User object         ✓  (verified below)
    """
    user = _get_user_or_404(user_id, db)

    # Access the relationship to trigger lazy-load (fires SELECT on projects table)
    # This line proves that user.projects resolves correctly.
    _ = user.projects  # noqa: F841  — touched so SQLAlchemy loads the collection

    # Also verify the reverse side: every project's .owner points back to this user
    for project in user.projects:
        assert project.owner is user  # back_populates sanity check

    # UserWithProjectsOut has from_attributes=True — Pydantic reads .projects directly
    return user


# ---------------------------------------------------------------------------
# GET /users/{user_id}   — single user (flat, no projects)
# ---------------------------------------------------------------------------

@router.get("/{user_id}", response_model=schemas.UserOut, status_code=status.HTTP_200_OK)
def get_user(user_id: int, db: Session = Depends(get_db)):
    """Fetch one user by primary key; 404 if not found."""
    return _get_user_or_404(user_id, db)


# ---------------------------------------------------------------------------
# DELETE /users/{user_id}
# ---------------------------------------------------------------------------

@router.delete("/{user_id}", status_code=status.HTTP_200_OK)
def delete_user(user_id: int, db: Session = Depends(get_db)):
    """
    Delete a user and all their projects + tasks
    (cascade delete-orphan fires via the ORM relationships in models.py).
    """
    user = _get_user_or_404(user_id, db)
    db.delete(user)
    db.commit()
    return {"detail": f"User with id={user_id} deleted successfully."}
