"""Build the extension-risk audit. Does not write production scores."""

from __future__ import annotations

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from reel_seattle.analysis.leaving_soon_extension_risk import run_extension_audit  # noqa: E402
from reel_seattle.analysis.leaving_soon_extension_risk_report import write_outputs  # noqa: E402


def main() -> None:
    out = PROJECT_ROOT / "data" / "audits" / "leaving_soon_extension_risk"
    result = run_extension_audit(PROJECT_ROOT)
    write_outputs(result, out)
    holdout = result["counts"]["holdout"]
    population = result["counts"]["population_a_within_7"]
    print(
        f"population A {population['n']} engagements, {population['extensions']} extensions "
        f"({population['extension_rate']}); holdout {holdout['n']} / {holdout['extensions']}; wrote {out}"
    )


if __name__ == "__main__":
    main()
