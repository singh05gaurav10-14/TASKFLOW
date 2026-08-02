"""
algorithms_count.py
-------------------
Comparison-counting wrappers that re-implement the same logic as algorithms.py
but instrument every comparison and return the count alongside the result.

Signatures and return contracts differ from algorithms.py by design —
these are benchmark/analysis wrappers, not the endpoint functions.
"""


def insertion_sort_count(records: list, key: str) -> int:
    """
    Sort *records* in place by record[key] using insertion sort, counting
    every element comparison made by the inner while-loop.

    The sort logic is identical to insertion_sort(); only a counter is added.

    Returns:
        int — the total number of element comparisons performed.
              (Does not return the sorted list; the list is mutated in place.)
    """
    comparisons = 0

    for i in range(1, len(records)):
        current = records[i]
        current_val = current[key]
        j = i - 1
        while j >= 0:
            comparisons += 1          # count the comparison records[j][key] > current_val
            if records[j][key] > current_val:
                records[j + 1] = records[j]
                j -= 1
            else:
                break
        records[j + 1] = current

    return comparisons


def binary_search_count(sorted_records: list, target_value, key: str) -> dict:
    """
    Search *sorted_records* for target_value using binary search, counting
    every mid-point comparison.

    Returns:
        dict with exactly two keys:
            "index"            — int index of the match, or -1 if absent
            "comparison_count" — int number of comparisons performed
    """
    comparisons = 0
    low = 0
    high = len(sorted_records) - 1

    while low <= high:
        mid = (low + high) // 2
        comparisons += 1              # count the comparison against mid_val
        mid_val = sorted_records[mid][key]

        if mid_val == target_value:
            return {"index": mid, "comparison_count": comparisons}
        elif mid_val < target_value:
            low = mid + 1
        else:
            high = mid - 1

    return {"index": -1, "comparison_count": comparisons}


def linear_search_count(records: list, target_value, key: str) -> dict:
    """
    Scan every record for target_value, counting every comparison.

    Returns:
        dict with exactly two keys:
            "index"            — int index of the first match, or -1 if absent
            "comparison_count" — int number of comparisons performed
    """
    comparisons = 0

    for i, record in enumerate(records):
        comparisons += 1              # count every element inspection
        if record[key] == target_value:
            return {"index": i, "comparison_count": comparisons}

    return {"index": -1, "comparison_count": comparisons}
