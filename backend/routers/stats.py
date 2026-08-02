"""
Statistics endpoints.

GET /stats/projects/{project_id}  → Per-project task count broken down by status.

The aggregation is performed entirely in SQL (COUNT + GROUP BY) through
SQLAlchemy — no Python-side aggregation over a full result set.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db

router = APIRouter(prefix="/stats", tags=["statistics"])


@router.get(
    "/projects/{project_id}",
    response_model=schemas.ProjectStatsOut,
    status_code=status.HTTP_200_OK,
)
def project_task_stats(project_id: int, db: Session = Depends(get_db)):
    """
    Return task statistics for a single project:

    - **total_tasks**: COUNT of all tasks in the project.
    - **by_status**: list of `{status, count}` rows produced by a
      `GROUP BY tasks.status` query — the database engine does the
      aggregation, not Python.

    Returns **404** when the project does not exist.
    """
    # 1. Verify the project exists
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project with id={project_id} not found.",
        )

    # 2. Total task count via SQL COUNT — one aggregated row returned
    total: int = (
        db.query(func.count(models.Task.id))
        .filter(models.Task.project_id == project_id)
        .scalar()
        or 0
    )

    # 3. Count per status via SQL COUNT + GROUP BY — database does the work
    #    Result: list of (status_string, count_int) tuples
    rows = (
        db.query(models.Task.status, func.count(models.Task.id).label("count"))
        .filter(models.Task.project_id == project_id)
        .group_by(models.Task.status)
        .all()
    )

    by_status = [schemas.TaskStatusCount(status=row.status, count=row.count) for row in rows]

    return schemas.ProjectStatsOut(
        project_id=project.id,
        project_title=project.title,
        total_tasks=total,
        by_status=by_status,
    )
