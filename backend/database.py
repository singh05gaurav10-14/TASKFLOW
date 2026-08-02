"""
Database engine, session factory, and the FastAPI Depends-compatible
session dependency that is shared across all endpoint modules.

All configuration is read from config.py, which loads it from .env.
"""

from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from config import DATABASE_URL, SQL_ECHO
from models import Base

# If using SQLite with a relative path, anchor it to the taskflow/ root
# (one level above this file) so the DB file is always in the same place
# regardless of the working directory uvicorn is launched from.
import os as _os
_resolved_url = DATABASE_URL
if DATABASE_URL.startswith("sqlite:///./") or DATABASE_URL == "sqlite:///./app.db":
    _db_filename = DATABASE_URL.replace("sqlite:///./", "")
    _root = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
    _resolved_url = f"sqlite:///{_os.path.join(_root, _db_filename)}"

engine = create_engine(
    _resolved_url,
    # check_same_thread is only relevant for SQLite; harmless for other DBs.
    connect_args={"check_same_thread": False} if _resolved_url.startswith("sqlite") else {},
    echo=SQL_ECHO,   # logs every SQL statement when APP_ENV=development
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def create_tables() -> None:
    """Create all tables that do not yet exist.  Called once at startup."""
    Base.metadata.create_all(bind=engine)


# ---------------------------------------------------------------------------
# FastAPI dependency
# ---------------------------------------------------------------------------

def get_db() -> Generator[Session, None, None]:
    """
    Yield a SQLAlchemy session and guarantee it is closed after the request,
    even if an exception is raised.

    Usage in any endpoint:
        def my_endpoint(db: Session = Depends(get_db)):
            ...
    """
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()
