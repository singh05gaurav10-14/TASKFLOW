"""
seed.py
-------
Seed the database with tasks at three realistic sizes: 10, 500, and 3 000.

Usage:
    python seed.py            # seeds all three sizes (additive)
    python seed.py --clear    # wipes tasks/projects/users first, then seeds

The script reuses the same SQLAlchemy models and session factory used by
the Section 1 API, so the seeded rows are immediately visible via the
live endpoints.
"""

import argparse
import random
import sys

# Add backend/ to sys.path so the ORM models and DB session are importable
# when seed.py is run from the taskflow/ root.
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

from database import SessionLocal, create_tables
from models import User, Project, Task

# ---------------------------------------------------------------------------
# Seed data pools
# ---------------------------------------------------------------------------

PRIORITIES = ["low", "medium", "high"]
STATUSES   = ["todo", "in_progress", "done"]

TITLE_ADJECTIVES = [
    "Fix", "Add", "Update", "Remove", "Review", "Test", "Deploy",
    "Refactor", "Document", "Investigate", "Migrate", "Optimise",
    "Implement", "Design", "Validate",
]

TITLE_NOUNS = [
    "login page", "database schema", "API endpoint", "unit tests",
    "CI pipeline", "auth middleware", "search index", "task router",
    "seed script", "benchmark report", "README file", "CSS layout",
    "CORS config", "error handler", "Pydantic model",
]

DUE_DATES = [
    "2024-12-31", "next friday", "end of sprint", "tomorrow",
    "2025-01-15", "next monday", "by EOD", "2025-03-01", None, None,
]


def _make_title(index: int) -> str:
    adj  = TITLE_ADJECTIVES[index % len(TITLE_ADJECTIVES)]
    noun = TITLE_NOUNS[(index * 3 + 7) % len(TITLE_NOUNS)]
    return f"{adj} {noun} #{index}"


def seed(target_total: int, project: Project, db) -> int:
    """
    Insert tasks until the project has *target_total* tasks.
    Returns the number of rows actually inserted.
    """
    existing = db.query(Task).filter(Task.project_id == project.id).count()
    needed   = target_total - existing
    if needed <= 0:
        print(f"  project {project.id!r} already has {existing} tasks — skipping")
        return 0

    batch = []
    for i in range(needed):
        idx = existing + i
        batch.append(Task(
            title      = _make_title(idx),
            description= f"Auto-generated task {idx} for benchmark.",
            priority   = PRIORITIES[idx % 3],
            status     = STATUSES[idx % 3],
            due_date   = DUE_DATES[idx % len(DUE_DATES)],
            project_id = project.id,
        ))

    db.bulk_save_objects(batch)
    db.commit()
    print(f"  inserted {needed} tasks -> project {project.id!r} now has {target_total}")
    return needed


def get_or_create_user(db) -> User:
    user = db.query(User).first()
    if user:
        return user
    user = User(name="Seed User", email="seed@example.com")
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def get_or_create_project(name: str, owner: User, db) -> Project:
    proj = db.query(Project).filter(Project.title == name).first()
    if proj:
        return proj
    proj = Project(title=name, owner_id=owner.id)
    db.add(proj)
    db.commit()
    db.refresh(proj)
    return proj


def clear_all(db) -> None:
    # Delete in FK-safe order: tasks first, then projects, then users
    db.query(Task).delete(synchronize_session=False)
    db.query(Project).delete(synchronize_session=False)
    db.query(User).delete(synchronize_session=False)
    db.commit()
    print("  database cleared")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Seed tasks at 10 / 500 / 3000 rows")
    parser.add_argument("--clear", action="store_true",
                        help="Wipe existing tasks/projects/users before seeding")
    args = parser.parse_args()

    create_tables()
    db = SessionLocal()

    try:
        if args.clear:
            print("Clearing database…")
            clear_all(db)

        user = get_or_create_user(db)
        print(f"Using user id={user.id} ({user.email})")

        # Three benchmark projects, one per size
        sizes = [
            ("Benchmark-10",   10),
            ("Benchmark-500",  500),
            ("Benchmark-3000", 3000),
        ]

        for proj_name, size in sizes:
            print(f"\nSeeding project '{proj_name}' -> {size} tasks...")
            project = get_or_create_project(proj_name, user, db)
            seed(size, project, db)

        print("\nDone.")

    finally:
        db.close()


if __name__ == "__main__":
    main()
