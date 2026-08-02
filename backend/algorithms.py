"""
algorithms.py
-------------
Hand-rolled sorting and search functions used by the Section 1 API endpoints.

None of these functions use Python's built-in sorted() or list.sort().
"""


def insertion_sort(records: list, key: str) -> None:
    """
    Sort *records* in place by records[i][key] using insertion sort.

    Starting from the second element, each element is compared against the
    elements before it and shifted rightward until its correct position is
    found, then inserted there.

    Mutates the list directly; returns nothing (bare return).

    Time complexity:
        Best case  — O(n)      already-sorted input; inner loop never executes
        Worst case — O(n²)     reverse-sorted input; every element shifts all
                               the way to index 0

    Args:
        records: list of dicts to sort in place.
        key:     the dict key whose value is used for comparison.
    """
    for i in range(1, len(records)):
        current = records[i]
        current_val = current[key]
        j = i - 1
        # Shift elements that are greater than current_val one position right
        while j >= 0 and records[j][key] > current_val:
            records[j + 1] = records[j]
            j -= 1
        records[j + 1] = current
    return   # explicit bare return; list is mutated in place


def binary_search(sorted_records: list, target_value, key: str) -> int:
    """
    Search *sorted_records* (sorted ascending by *key*) for a record whose
    record[key] == target_value.

    Uses the standard low / high / mid pointer structure.

    Returns:
        The index of the matching record, or -1 if no match exists.

    Args:
        sorted_records: list of dicts, already sorted ascending by *key*.
        target_value:   the value to find.
        key:            the dict key to compare against.
    """
    low = 0
    high = len(sorted_records) - 1

    while low <= high:
        mid = (low + high) // 2
        mid_val = sorted_records[mid][key]

        if mid_val == target_value:
            return mid
        elif mid_val < target_value:
            low = mid + 1
        else:
            high = mid - 1

    return -1


def linear_search(records: list, target_value, key: str) -> int:
    """
    Scan every record in order and return the index of the first record whose
    record[key] == target_value.

    Returns:
        The index of the first match, or -1 if no match exists.

    Args:
        records:       list of dicts (need not be sorted).
        target_value:  the value to find.
        key:           the dict key to compare against.
    """
    for i, record in enumerate(records):
        if record[key] == target_value:
            return i
    return -1
