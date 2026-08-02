"""
benchmark.py
------------
Run the comparison-counting wrappers (algorithms_count.py) against the real
task data seeded into the database at three sizes (10, 500, 3000 rows).

For each size the script:
  1. Fetches all tasks from the matching benchmark project.
  2. Converts them to plain dicts using the same fields the API endpoints use.
  3. Runs insertion_sort_count, binary_search_count, and linear_search_count.
  4. Prints and saves the raw numbers to benchmark_results.txt.

Run with:
    python benchmark.py
"""

import os
import sys
# Add backend/ to sys.path so algorithms_count, database, models are importable
# when benchmark.py is run from the taskflow/ root.
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend"))

os.environ.setdefault("APP_ENV", "production")   # suppress SQL echo

from database import SessionLocal, create_tables
from models import Project, Task
from algorithms_count import (
    binary_search_count,
    insertion_sort_count,
    linear_search_count,
)

# Project titles created by seed.py
BENCHMARK_PROJECTS = {
    10:   "Benchmark-10",
    500:  "Benchmark-500",
    3000: "Benchmark-3000",
}


def task_to_dict(task: Task) -> dict:
    return {
        "id":         task.id,
        "title":      task.title,
        "priority":   task.priority,
        "due_date":   task.due_date,
        "status":     task.status,
        "project_id": task.project_id,
    }


PRIORITY_RANK = {"low": 1, "medium": 2, "high": 3}


def run_benchmarks() -> list[dict]:
    create_tables()
    db = SessionLocal()
    results = []

    try:
        for size, proj_name in BENCHMARK_PROJECTS.items():
            proj = db.query(Project).filter(Project.title == proj_name).first()
            if proj is None:
                print(f"  [SKIP] project '{proj_name}' not found — run seed.py first")
                continue

            rows = db.query(Task).filter(Task.project_id == proj.id).all()
            actual_size = len(rows)
            if actual_size == 0:
                print(f"  [SKIP] project '{proj_name}' has no tasks")
                continue

            task_dicts = [task_to_dict(t) for t in rows]

            # ── Insertion sort by priority rank ──────────────────────────
            sort_sample = []
            for d in task_dicts:
                copy = dict(d)
                copy["_priority_rank"] = PRIORITY_RANK.get(d["priority"], 0)
                sort_sample.append(copy)

            sort_comparisons = insertion_sort_count(sort_sample, key="_priority_rank")

            # ── Binary search (on title-sorted list) ─────────────────────
            # Sort by title first (using the counting sort — counts included)
            title_index = [{"id": d["id"], "title": d["title"]} for d in task_dicts]
            sort_for_bs = insertion_sort_count(title_index, key="title")

            # Search for the LAST title in the sorted index (worst-case position)
            target_title = title_index[-1]["title"]   # last after sort
            bs_result = binary_search_count(title_index, target_title, key="title")

            # Also search for a title in the MIDDLE
            mid_title = title_index[actual_size // 2]["title"]
            bs_mid = binary_search_count(title_index, mid_title, key="title")

            # ── Linear search (worst case: absent target) ─────────────────
            ls_result = linear_search_count(
                task_dicts, target_value="__not_present__", key="title"
            )

            # ── Linear search (best case: first element) ──────────────────
            first_title = task_dicts[0]["title"]
            ls_best = linear_search_count(task_dicts, first_title, key="title")

            row = {
                "size":                      actual_size,
                "insertion_sort_comparisons": sort_comparisons,
                "binary_search_worst_comparisons": bs_result["comparison_count"],
                "binary_search_mid_comparisons":   bs_mid["comparison_count"],
                "linear_search_worst_comparisons": ls_result["comparison_count"],
                "linear_search_best_comparisons":  ls_best["comparison_count"],
            }
            results.append(row)

    finally:
        db.close()

    return results


def format_results(results: list[dict]) -> str:
    lines = [
        "=" * 70,
        "BENCHMARK RESULTS — comparison counts from real DB task data",
        "=" * 70,
        "",
        f"{'Size':>6}  {'InsSort':>10}  {'BinSrch(W)':>12}  {'BinSrch(M)':>12}  {'LinSrch(W)':>12}  {'LinSrch(B)':>12}",
        f"{'':>6}  {'comps':>10}  {'comps':>12}  {'comps':>12}  {'comps':>12}  {'comps':>12}",
        "-" * 70,
    ]
    for r in results:
        lines.append(
            f"{r['size']:>6}  "
            f"{r['insertion_sort_comparisons']:>10,}  "
            f"{r['binary_search_worst_comparisons']:>12}  "
            f"{r['binary_search_mid_comparisons']:>12}  "
            f"{r['linear_search_worst_comparisons']:>12}  "
            f"{r['linear_search_best_comparisons']:>12}"
        )
    lines += [
        "",
        "Legend:",
        "  InsSort      = insertion_sort_count comparisons (sort by priority rank)",
        "  BinSrch(W)   = binary_search_count searching last element (near worst case)",
        "  BinSrch(M)   = binary_search_count searching middle element",
        "  LinSrch(W)   = linear_search_count on absent target (true worst case = N)",
        "  LinSrch(B)   = linear_search_count on first element (best case = 1)",
        "",
    ]
    return "\n".join(lines)


def main():
    print("Running benchmarks against seeded database...\n")
    results = run_benchmarks()
    if not results:
        print("No results — ensure seed.py has been run.")
        return

    output = format_results(results)
    print(output)

    out_path = os.path.join(os.path.dirname(__file__), "benchmark_results.txt")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(output)
    print(f"Results saved to {out_path}")


if __name__ == "__main__":
    main()
