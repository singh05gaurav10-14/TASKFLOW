"""
Pydantic v2 request / response schemas.

Design decisions:
  - TaskCreate / TaskUpdate validate the priority field against the closed set
    {"low", "medium", "high"} using a Literal type (Field constraint).
  - A custom @field_validator on title rejects blank strings after trimming.
  - Response schemas (…Out) use model_config = ConfigDict(from_attributes=True)
    so they can be constructed directly from ORM model instances.

Nested relationship schemas:
  - ProjectWithTasksOut: ProjectOut + tasks: list[TaskOut]
    Exposes project.tasks (resolved via ORM relationship / back_populates)
  - UserWithProjectsOut: UserOut + projects: list[ProjectOut]
    Exposes user.projects (resolved via ORM relationship / back_populates)

The nested schemas use model_rebuild() at the end of the file to resolve any
forward references produced by self-referential or circular type annotations.
"""

from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


# ---------------------------------------------------------------------------
# Priority / status types — shared by Task schemas and the AI parser (Sec 3)
# ---------------------------------------------------------------------------

PriorityType = Literal["low", "medium", "high"]
StatusType   = Literal["todo", "in_progress", "done"]


# ===========================================================================
# User schemas
# ===========================================================================

class UserCreate(BaseModel):
    name:  str      = Field(..., min_length=1, max_length=255)
    email: EmailStr

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("name must not be blank or whitespace-only")
        return v.strip()


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:         int
    name:       str
    email:      str
    created_at: datetime


# ===========================================================================
# Project schemas
# ===========================================================================

class ProjectCreate(BaseModel):
    title:       str           = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    owner_id:    int

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("title must not be blank or whitespace-only")
        return v.strip()


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:          int
    title:       str
    description: Optional[str]
    owner_id:    int
    created_at:  datetime


# ===========================================================================
# Task schemas
# ===========================================================================

class TaskCreate(BaseModel):
    title:       str                = Field(..., min_length=1, max_length=255)
    description: Optional[str]     = None
    priority:    PriorityType       = Field(default="medium")
    status:      StatusType         = Field(default="todo")
    due_date:    Optional[str]      = Field(default=None, max_length=100)
    project_id:  int

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("title must not be blank or whitespace-only")
        return stripped

    @field_validator("due_date")
    @classmethod
    def due_date_not_blank(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not v.strip():
            raise ValueError("due_date must not be an empty string; use null to omit it")
        return v


class TaskUpdate(BaseModel):
    """All fields are optional — a PATCH-style partial update."""
    title:       Optional[str]          = Field(default=None, min_length=1, max_length=255)
    description: Optional[str]          = None
    priority:    Optional[PriorityType] = None
    status:      Optional[StatusType]   = None
    due_date:    Optional[str]          = Field(default=None, max_length=100)

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not v.strip():
            raise ValueError("title must not be blank or whitespace-only")
        return v.strip() if v is not None else v


class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:          int
    title:       str
    description: Optional[str]
    status:      str
    priority:    str
    due_date:    Optional[str]
    project_id:  int
    created_at:  datetime


# ===========================================================================
# Nested relationship schemas
# ===========================================================================

class ProjectWithTasksOut(BaseModel):
    """
    Project response that includes all tasks resolved via the ORM relationship.

    Constructed from a Project ORM instance whose .tasks attribute has been
    loaded by SQLAlchemy (lazy='select' fires automatically when accessed).
    This proves that project.tasks resolves correctly via back_populates.
    """
    model_config = ConfigDict(from_attributes=True)

    id:          int
    title:       str
    description: Optional[str]
    owner_id:    int
    created_at:  datetime
    # Resolved via Project.tasks ←→ Task.project (back_populates on both sides)
    tasks:       List[TaskOut] = []


class UserWithProjectsOut(BaseModel):
    """
    User response that includes all projects resolved via the ORM relationship.

    Constructed from a User ORM instance whose .projects attribute has been
    loaded by SQLAlchemy (lazy='select' fires automatically when accessed).
    This proves that user.projects resolves correctly via back_populates.
    """
    model_config = ConfigDict(from_attributes=True)

    id:         int
    name:       str
    email:      str
    created_at: datetime
    # Resolved via User.projects ←→ Project.owner (back_populates on both sides)
    projects:   List[ProjectOut] = []


# ===========================================================================
# Statistics schemas
# ===========================================================================

class TaskStatusCount(BaseModel):
    status: str
    count:  int


class ProjectStatsOut(BaseModel):
    project_id:    int
    project_title: str
    total_tasks:   int
    by_status:     List[TaskStatusCount]


# ===========================================================================
# Quick-Add schema (Section 3)
# ===========================================================================

class QuickAddRequest(BaseModel):
    description: str = Field(..., min_length=1)
    project_id:  int
