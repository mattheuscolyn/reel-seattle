"""Feature-expansion audit for the pre-publication remaining-week forecast."""

from __future__ import annotations

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from reel_seattle.analysis.leaving_soon_feature_expansion import run_feature_expansion  # noqa: E402
from reel_seattle.analysis.leaving_soon_feature_expansion_report import write_outputs  # noqa: E402


def main() -> None:
    out = PROJECT_ROOT / "data" / "audits" / "leaving_soon_feature_expansion"
    result = run_feature_expansion(PROJECT_ROOT)
    write_outputs(result, out)
    base = result["baseline"]
    best = result["best_metrics"]
    print(
        f"baseline log loss {base.get('log_loss')} +1 {base.get('pr_auc_exactly_1')}; "
        f"best {result['best_model']} log loss {best.get('log_loss')} +1 {best.get('pr_auc_exactly_1')}; wrote {out}"
    )


if __name__ == "__main__":
    main()
