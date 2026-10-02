"""Auditorium-commitment audit for the pre-publication remaining-week forecast."""

from __future__ import annotations

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from reel_seattle.analysis.leaving_soon_auditorium_commitment import run_auditorium_audit  # noqa: E402
from reel_seattle.analysis.leaving_soon_auditorium_commitment_report import write_outputs  # noqa: E402


def main() -> None:
    out = PROJECT_ROOT / "data" / "audits" / "leaving_soon_auditorium_commitment"
    result = run_auditorium_audit(PROJECT_ROOT)
    write_outputs(result, out)
    base = next(row for row in result["results"] if row["model"] == "pr141_opening")
    hierarchy = next(row for row in result["results"] if row["model"] == "hierarchy_score" and row.get("mode") == "added_alone")
    print(
        f"first log {result['first_auditorium_log']}; "
        f"baseline log loss {base.get('log_loss')}; "
        f"hierarchy log loss {hierarchy.get('log_loss')}; wrote {out}"
    )


if __name__ == "__main__":
    main()
