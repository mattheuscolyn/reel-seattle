"""Pre-publication remaining-weeks audit. Does not write production scores."""

from __future__ import annotations

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from reel_seattle.analysis.leaving_soon_prepublication_survival import run_prepublication_audit  # noqa: E402
from reel_seattle.analysis.leaving_soon_prepublication_survival_report import write_outputs  # noqa: E402


def main() -> None:
    out = PROJECT_ROOT / "data" / "audits" / "leaving_soon_prepublication_survival"
    result = run_prepublication_audit(PROJECT_ROOT)
    write_outputs(result, out)
    film = result["counts"]["film_theater"]
    hazard = result["models"]["hazard"]
    print(
        f"film-theater {film['n']} uncensored {film['uncensored']}; "
        f"holdout final-week PR-AUC {hazard.get('pr_auc_final_week')}; wrote {out}"
    )


if __name__ == "__main__":
    main()
