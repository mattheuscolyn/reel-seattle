"""Research page for the shadow remaining-run forecast. Not a Reel Seattle screen."""

from __future__ import annotations

import html
from pathlib import Path
from typing import Any, Mapping, Sequence


def _num(value: Any) -> str:
    if isinstance(value, float):
        return f"{value:.3f}"
    if value is None:
        return ""
    return str(value)


def _table(rows: Sequence[Mapping[str, Any]], columns: Sequence[tuple[str, str]]) -> str:
    head = "".join(f"<th>{html.escape(label)}</th>" for _key, label in columns)
    body = []
    for row in rows:
        cells = "".join(f"<td>{html.escape(_num(row.get(key)))}</td>" for key, _label in columns)
        body.append(f"<tr>{cells}</tr>")
    return f"<table><thead><tr>{head}</tr></thead><tbody>{''.join(body)}</tbody></table>"


def write_review(out_dir: Path, current: Mapping[str, Any], manifest: Mapping[str, Any]) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    probs = (
        ("title", "Film"),
        ("theaterName", "Theater"),
        ("forecastState", "State"),
        ("pFinalWeek", "Final week"),
        ("pPlus1Week", "+1"),
        ("pPlus2Weeks", "+2"),
        ("pPlus3PlusWeeks", "3+"),
        ("expectedRemainingWeeks", "Expected"),
        ("productionPEndWithin7d", "Production 7-day"),
        ("urgencyRank", "Urgency rank"),
    )
    market_cols = [item for item in probs if item[0] != "theaterName"]
    pre = [row for row in current["theaters"] if row["forecastState"] == "pre_publication"]
    post = [row for row in current["theaters"] if row["forecastState"] == "post_publication"]
    market_pre = [row for row in current["market"] if row["forecastState"] == "pre_publication"]
    market_post = [row for row in current["market"] if row["forecastState"] == "post_publication"]
    inputs = []
    for row in current["theaters"][:12]:
        flat = dict(row)
        flat.update(row.get("inputs") or {})
        inputs.append(flat)
    verification = manifest.get("verification_holdout") or {}
    page = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Remaining-run shadow forecast</title>
<style>
body {{ font-family: Georgia, serif; margin: 2rem auto; max-width: 1100px; line-height: 1.45; color: #1c1c1c; }}
table {{ border-collapse: collapse; width: 100%; font-size: 0.84rem; }}
th, td {{ border-bottom: 1px solid #ccc; text-align: left; padding: 0.3rem; vertical-align: top; }}
</style></head><body>
<h1>Shadow remaining-run forecast</h1>
<p>Research only. This page is not the Reel Seattle Leaving Soon shelf. Model {html.escape(str(current.get("modelVersion")))}. Snapshot {html.escape(str(current.get("asOf")))}. Horizon Friday {html.escape(str(current.get("upcomingFriday")))}.</p>
<p>Holdout check against PR #141: log loss {_num(verification.get("log_loss"))}, Brier {_num(verification.get("brier"))}, final-week PR-AUC {_num(verification.get("pr_auc_final_week"))}, +1 {_num(verification.get("pr_auc_exactly_1"))}, +2 {_num(verification.get("pr_auc_exactly_2"))}, 3+ {_num(verification.get("pr_auc_3_plus"))}, median expected-week error {_num(verification.get("median_abs_error_capped"))}, pairwise {_num(verification.get("ranking_pairwise"))}.</p>
<h2>Pre-publication theater forecasts</h2>
{_table(sorted(pre, key=lambda row: row.get("urgencyRank") or 999), probs)}
<h2>Post-publication theater rows</h2>
<p>These rows were scored from the last snapshot before the next Friday reached 80% of that theater's other Friday volume. The schedule published after that snapshot is a confirmation signal and is not mixed into the pre-publication evaluation set.</p>
{_table(sorted(post, key=lambda row: row.get("urgencyRank") or 999), probs)}
<h2>Market predictions</h2>
<p>Direct film-level hazard. Theater probabilities are not multiplied together.</p>
<h3>Pre-publication</h3>
{_table(market_pre, market_cols)}
<h3>Post-publication</h3>
{_table(market_post, market_cols)}
<h2>Model inputs</h2>
<p>Compact point-in-time inputs stored with each theater forecast. The full feature vector is in the append-only forecast ledger.</p>
{_table(inputs, (("title", "Film"), ("theaterName", "Theater"), ("forecastState", "State"), ("segment", "Segment"), ("current_week_screenings", "Current screenings"), ("opening_week_screenings", "Opening screenings"), ("market_theater_count", "Theaters"), ("market_screenings", "Market screenings")))}
<h2>Disagreements with the production 7-day score</h2>
{_table(current.get("disagreements") or [], (("title", "Film"), ("disagreement", "Disagreement"), ("p_final_week", "Shadow final"), ("production_p_end_within_7d", "Production 7-day"), ("p_final_week_min", "Min theater"), ("p_final_week_max", "Max theater"), ("market_p_final_week", "Market"), ("median_theater_p_final_week", "Median theater")))}
</body></html>
"""
    (out_dir / "index.html").write_text(page, encoding="utf-8")
