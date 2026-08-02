"""
check_algorithms.py
-------------------
Automated pass/fail verification for all algorithm functions.
Uses plain if/else — no assert, pytest, or unittest.

Run with:
    python check_algorithms.py
"""

import sys
import os
# algorithms.py and algorithms_count.py live in backend/
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend"))

from algorithms import binary_search, insertion_sort, linear_search
from algorithms_count import (
    binary_search_count,
    insertion_sort_count,
    linear_search_count,
)

passed = 0
failed = 0


def check(case_name: str, result, expected):
    global passed, failed
    if result == expected:
        print(f"PASS: {case_name}")
        passed += 1
    else:
        print(f"FAIL: {case_name} -- expected {expected!r}, got {result!r}")
        failed += 1


# ===========================================================================
# 1. insertion_sort on an empty list
# ===========================================================================

empty = []
insertion_sort(empty, key="val")
check("insertion_sort: empty list stays empty", empty, [])

# ===========================================================================
# 2. insertion_sort on a single-element list
# ===========================================================================

single = [{"val": 42}]
insertion_sort(single, key="val")
check("insertion_sort: single element unchanged", single, [{"val": 42}])

# ===========================================================================
# 3. binary_search finds a value at the FIRST index
# ===========================================================================

sorted_list = [
    {"k": 1},
    {"k": 3},
    {"k": 5},
    {"k": 7},
    {"k": 9},
]
check("binary_search: finds value at first index (k=1)",
      binary_search(sorted_list, target_value=1, key="k"), 0)

# ===========================================================================
# 4. binary_search finds a value at the LAST index
# ===========================================================================

check("binary_search: finds value at last index (k=9)",
      binary_search(sorted_list, target_value=9, key="k"), 4)

# ===========================================================================
# 5. binary_search finds a value at the MIDDLE index
# ===========================================================================

check("binary_search: finds value at middle index (k=5)",
      binary_search(sorted_list, target_value=5, key="k"), 2)

# ===========================================================================
# 6. binary_search returns -1 when target is absent
# ===========================================================================

check("binary_search: absent target returns -1",
      binary_search(sorted_list, target_value=99, key="k"), -1)

# ===========================================================================
# 7a. insertion_sort_count: list is correctly sorted after the call
# ===========================================================================

hand_list = [
    {"v": 5},
    {"v": 1},
    {"v": 4},
    {"v": 2},
    {"v": 3},
]
insertion_sort_count(hand_list, key="v")
sorted_vals = [d["v"] for d in hand_list]
check("insertion_sort_count: list correctly sorted",
      sorted_vals, [1, 2, 3, 4, 5])

# ===========================================================================
# 7b. insertion_sort_count: return value is a plain int > 0
# ===========================================================================

hand_list2 = [{"v": 3}, {"v": 1}, {"v": 2}]
count_result = insertion_sort_count(hand_list2, key="v")

if type(count_result) == int and count_result > 0:
    print(f"PASS: insertion_sort_count: returns int > 0 (got {count_result})")
    passed += 1
else:
    print(f"FAIL: insertion_sort_count: returns int > 0 -- expected int > 0, got {count_result!r}")
    failed += 1

# ===========================================================================
# 8. binary_search_count: correct index + comparison_count is int > 0
# ===========================================================================

bs_sorted = [{"k": 10}, {"k": 20}, {"k": 30}, {"k": 40}, {"k": 50}]
# Target is at index 2 (value 30)
bs_count_result = binary_search_count(bs_sorted, target_value=30, key="k")

check("binary_search_count: 'index' equals expected index (2)",
      bs_count_result["index"], 2)

if (isinstance(bs_count_result.get("comparison_count"), int)
        and bs_count_result["comparison_count"] > 0):
    print(f"PASS: binary_search_count: comparison_count is int > 0 "
          f"(got {bs_count_result['comparison_count']})")
    passed += 1
else:
    print(f"FAIL: binary_search_count: comparison_count is int > 0 -- "
          f"got {bs_count_result!r}")
    failed += 1

# ===========================================================================
# 9. linear_search_count: absent target => index == -1, count == len(list)
# ===========================================================================

ls_list = [{"k": "a"}, {"k": "b"}, {"k": "c"}, {"k": "d"}]
ls_result = linear_search_count(ls_list, target_value="z", key="k")

check("linear_search_count: absent target index == -1",
      ls_result["index"], -1)

check("linear_search_count: absent target comparison_count == len(list)",
      ls_result["comparison_count"], len(ls_list))

# ===========================================================================
# Summary
# ===========================================================================

total = passed + failed
print()
print(f"Results: {passed}/{total} passed, {failed}/{total} failed")
sys.exit(0 if failed == 0 else 1)
