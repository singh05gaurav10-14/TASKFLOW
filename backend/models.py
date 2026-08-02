"""
SQLAlchemy ORM models.

Schema:
  users    — id (PK), name (NOT NULL), email (UNIQUE, NOT NULL), created_at
  projects — id (PK), title (NOT NULL), description, owner_id (FK → users.id, NOT NULL)
  tasks    — id (PK), title (NOT NULL), description, status (NOT NULL, default='todo'),
             priority (NOT NULL, CHECK low|medium|high), due_date (TEXT, nullable),
             project_id (FK → projects.id, NOT NULL)

Relationships (both sides wired with back_populates):
  User.projects       ←→  Project.owner        (one-to-many: User → Project)
  Project.tasks       ←→  Task.project         (one-to-many: Project → Task)

Resolves correctly:
  a_project.tasks   → list of Task ORM objects for that project
  a_task.project    → the parent Project ORM object
  a_user.projects   → list of Project ORM objects owned by that user
  a_project.owner   → the owner User ORM object
"""

from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    DateTime,
    ForeignKey,
    CheckConstraint,
    func,
)
from sqlalchemy.orm import relationship, DeclarativeBase


class Base(DeclarativeBase):
    """Shared declarative base for all ORM models."""
    pass


# ===========================================================================
# User
# ===========================================================================

class User(Base):
    __tablename__ = "users"

    id         = Column(Integer, primary_key=True, index=True)
    name       = Column(String(255), nullable=False)
    email      = Column(String(255), nullable=False, unique=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # ── Relationship: one user → many projects ──────────────────────────
    # back_populates="owner" means Project.owner resolves back to this User.
    # cascade="all, delete-orphan": deleting a user removes all their projects.
    projects = relationship(
        "Project",
        back_populates="owner",
        cascade="all, delete-orphan",
        lazy="select",
    )

    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email!r}>"


# ===========================================================================
# Project
# ===========================================================================

class Project(Base):
    __tablename__ = "projects"

    id          = Column(Integer, primary_key=True, index=True)
    title       = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    owner_id    = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_at  = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # ── Relationship: many projects → one user (back side of User.projects) ─
    # back_populates="projects" closes the loop: project.owner → User instance
    owner = relationship(
        "User",
        back_populates="projects",
        lazy="select",
    )

    # ── Relationship: one project → many tasks ───────────────────────────
    # back_populates="project" means Task.project resolves back to this Project.
    # cascade="all, delete-orphan": deleting a project removes all its tasks.
    tasks = relationship(
        "Task",
        back_populates="project",
        cascade="all, delete-orphan",
        lazy="select",
    )

    def __repr__(self) -> str:
        return f"<Project id={self.id} title={self.title!r}>"


# ===========================================================================
# Task
# ===========================================================================

class Task(Base):
    __tablename__ = "tasks"

    # Priority/status are restricted to these closed sets at the DB level
    # (CHECK constraints below) to stay in sync with what the AI parser emits.
    PRIORITY_VALUES = ("low", "medium", "high")
    STATUS_VALUES   = ("todo", "in_progress", "done")

    id          = Column(Integer, primary_key=True, index=True)
    title       = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    status      = Column(
        String(20),
        nullable=False,
        default="todo",
        server_default="todo",
    )
    priority    = Column(
        String(10),
        nullable=False,
        default="medium",
        server_default="medium",
    )
    # Stored as plain TEXT — accepts both "2024-12-31" and "next friday"
    due_date    = Column(String(100), nullable=True)
    project_id  = Column(
        Integer,
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_at  = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # ── Relationship: many tasks → one project (back side of Project.tasks) ─
    # back_populates="tasks" closes the loop: task.project → Project instance
    project = relationship(
        "Project",
        back_populates="tasks",
        lazy="select",
    )

    # CHECK constraints — priority and status are enforced at the DB level
    __table_args__ = (
        CheckConstraint(
            "priority IN ('low', 'medium', 'high')",
            name="ck_task_priority",
        ),
        CheckConstraint(
            "status IN ('todo', 'in_progress', 'done')",
            name="ck_task_status",
        ),
    )

    def __repr__(self) -> str:
        return f"<Task id={self.id} title={self.title!r} priority={self.priority!r}>"
