#!/usr/bin/env python3
"""Validate the canonical showtimes history CSV contract."""

from __future__ import annotations

import csv
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from daily_processor import HISTORY_FIELDNAMES, HISTORY_PATH, parse_history_date  # noqa: E402
from reel_seattle.history_nulls import HISTORY_OPTIONAL_CSV_FIELDS  # noqa: E402
from reel_seattle.normalize.values import normalize_optional_string  # noqa: E402

DEFAULT_HISTORY_PATH = HISTORY_PATH
REQUIRED_NON_EMPTY_FIELDS: tuple[str, ...] = ("Date", "Time", "Theater", "Film")
NULL_SENTINEL_FIELDS: tuple[str, ...] = tuple(
    field for field in HISTORY_OPTIONAL_CSV_FIELDS if field in HISTORY_FIELDNAMES
)
DEFAULT_MAX_ERRORS = 20


def _header_mismatch_message(header: list[str]) -> str:
    expected = list(HISTORY_FIELDNAMES)
    if header == expected:
        return ""

    lines = [
        "history CSV header does not match HISTORY_FIELDNAMES",
        f"  expected ({len(expected)}): {expected}",
        f"  got ({len(header)}): {header}",
    ]
    missing = [name for name in expected if name not in header]
    extra = [name for name in header if name not in expected]
    if missing:
        lines.append(f"  missing columns: {missing}")
    if extra:
        lines.append(f"  extra columns: {extra}")
    if not missing and not extra:
        lines.append("  columns match as a set but order differs")
    return "\n".join(lines)


def validate_history_csv(
    history_path: Path | None = None,
    *,
    strict: bool = False,
    max_errors: int = DEFAULT_MAX_ERRORS,
) -> tuple[list[str], int]:
    """Validate history CSV contract. Returns (errors, data_row_count).

    Default checks: file exists, header order, row width, optional-field null sentinels.
    ``strict=True`` also requires core fields to be non-empty and dates to parse.
    """
    path = history_path or DEFAULT_HISTORY_PATH
    errors: list[str] = []
    data_row_count = 0

    if not path.is_file():
        return [f"missing history CSV: {path.as_posix()}"], 0

    try:
        handle = path.open(newline="", encoding="utf-8")
    except OSError as exc:
        return [f"could not read history CSV {path.as_posix()}: {exc}"], 0

    with handle:
        reader = csv.reader(handle)
        try:
            header = next(reader)
        except StopIteration:
            return ["history CSV is empty (no header row)"], 0

        mismatch = _header_mismatch_message(header)
        if mismatch:
            return [mismatch], 0

        expected_width = len(HISTORY_FIELDNAMES)
        for row_number, row in enumerate(reader, start=2):
            data_row_count += 1
            if len(errors) >= max_errors:
                errors.append(f"stopping after {max_errors} errors")
                break

            if len(row) != expected_width:
                errors.append(
                    f"row {row_number}: expected {expected_width} columns, got {len(row)}"
                )
                continue

            record = dict(zip(HISTORY_FIELDNAMES, row, strict=True))

            if strict:
                for field in REQUIRED_NON_EMPTY_FIELDS:
                    if not record[field].strip():
                        errors.append(f"row {row_number}: required field {field!r} is blank")

                show_date = parse_history_date(record["Date"])
                if show_date is None:
                    errors.append(
                        f"row {row_number}: Date {record['Date']!r} is not parseable as MM/DD/YYYY"
                    )

            for field in NULL_SENTINEL_FIELDS:
                raw = record[field]
                if raw.strip() and normalize_optional_string(raw) is None:
                    errors.append(
                        f"row {row_number}: {field} uses null sentinel {raw!r} — use an empty field"
                    )

    if data_row_count == 0 and not errors:
        errors.append("history CSV has header only (no data rows)")

    return errors, data_row_count


def main(argv: list[str] | None = None) -> int:
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--strict",
        action="store_true",
        help="also require core fields and parseable dates on every row",
    )
    args = parser.parse_args(argv)

    errors, row_count = validate_history_csv(strict=args.strict)
    if errors:
        print("validate_history_csv: FAILED", file=sys.stderr)
        print(f"  ({len(errors)} error{'s' if len(errors) != 1 else ''})", file=sys.stderr)
        for message in errors:
            print(f"  - {message}", file=sys.stderr)
        return 1

    mode = "strict" if args.strict else "default"
    print("validate_history_csv: OK")
    print(f"  - mode: {mode}")
    print(f"  - {DEFAULT_HISTORY_PATH.as_posix()} exists")
    print(f"  - header matches HISTORY_FIELDNAMES ({len(HISTORY_FIELDNAMES)} columns)")
    print(f"  - {row_count:,} data rows passed contract checks")
    if not args.strict:
        print("  - core field/date checks deferred (use --strict)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
