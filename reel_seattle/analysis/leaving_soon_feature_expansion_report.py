"""Charts and the review page for the remaining-week feature expansion."""

from __future__ import annotations

import csv
import html
import json
import math
from pathlib import Path
from typing import Any, Mapping, Sequence

import numpy as np

CHARTS = (
    "middle_case_outcomes.png",
    "survival_by_opening_footprint.png",
    "survival_by_current_vs_peak.png",
    "survival_by_prime_time_share.png",
    "survival_by_market_shape.png",
    "film_archetype_survival.png",
    "new_feature_family_ablation.png",
    "middle_bucket_pr_auc.png",
    "remaining_weeks_calibration_comparison.png",
    "urgency_ranking_comparison.png",
    "error_archetypes.png",
)


def _pct(value: Any) -> str:
    if not isinstance(value, (int, float)) or isinstance(value, bool) or (isinstance(value, float) and math.isnan(value)):
        return "n/a"
    return f"{float(value) * 100:.1f}%"


def _num(value: Any) -> str:
    if not isinstance(value, (int, float)) or isinstance(value, bool) or (isinstance(value, float) and math.isnan(value)):
        return "n/a"
    return f"{float(value):.3f}" if isinstance(value, float) else str(value)


def _cell(value: Any) -> Any:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return ""
    if isinstance(value, (np.floating, np.integer)):
        return value.item()
    return value


def _write_csv(path: Path, rows: Sequence[Mapping[str, Any]], fields: Sequence[str] | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    names = list(fields or [])
    if not names:
        seen: set[str] = set()
        for row in rows:
            for key in row:
                if key not in seen and not isinstance(row.get(key), (dict, list)):
                    seen.add(key)
                    names.append(key)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=names, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow({key: _cell(row.get(key)) for key in names})


def _metric_rows(result: Mapping[str, Any]) -> list[dict[str, Any]]:
    return [row for row in result["results"] if row["mode"] in {"baseline", "cumulative"}]


def render_charts(result: Mapping[str, Any], out_dir: Path) -> None:
    import matplotlib.pyplot as plt

    plt.rcParams.update({"figure.facecolor": "white", "axes.grid": True, "grid.alpha": 0.25, "font.size": 10, "figure.dpi": 120})

    def save(fig, name: str) -> None:
        fig.tight_layout()
        fig.savefig(out_dir / name, bbox_inches="tight")
        plt.close(fig)

    def survival(table, key, title, name):
        labels = [str(row.get(key)) for row in table]
        fig, ax = plt.subplots(figsize=(8.4, 4.4))
        x = np.arange(len(labels))
        width = 0.2
        for index, weeks in enumerate((1, 2, 3)):
            vals = [float(row.get(f"survive_at_least_{weeks}") or 0) * 100 for row in table]
            ax.bar(x + (index - 1) * width, vals, width=width, label=f"at least {weeks} more")
        ax.set_xticks(x, labels, rotation=20, ha="right")
        ax.set_ylim(0, 105)
        ax.set_ylabel("Share still playing (%)")
        ax.set_title(title)
        ax.legend(fontsize=8)
        save(fig, name)

    survival(result["survival"]["opening"], "opening", "Survival by opening-week screening count", "survival_by_opening_footprint.png")
    survival(result["survival"]["retention"], "retention", "Survival by current screenings as a share of the observed peak", "survival_by_current_vs_peak.png")
    survival(result["survival"]["prime"], "prime", "Survival by prime-time share of the visible week", "survival_by_prime_time_share.png")
    survival(result["survival"]["shape"], "shape", "Survival by whether several theaters still have a full schedule", "survival_by_market_shape.png")
    survival(result["survival"]["archetype"], "archetype", "Survival by release archetype", "film_archetype_survival.png")

    middle = [row for row in result["middle"] if not row.get("censored") and row.get("bucket") is not None]
    counts = [sum(1 for row in middle if int(row["bucket"]) == bucket) for bucket in range(4)]
    fig, ax = plt.subplots(figsize=(7, 4.2))
    ax.bar(["Final week", "+1", "+2", "3+"], counts, color="#1f4e79")
    ax.set_title(f"Actual outcomes in the uncertain middle (n={len(middle)} labeled)")
    ax.set_ylabel("Observations")
    save(fig, "middle_case_outcomes.png")

    cumulative = _metric_rows(result)
    fig, ax = plt.subplots(figsize=(8.6, 4.4))
    x = np.arange(len(cumulative))
    ax.plot(x, [row.get("log_loss") or 0 for row in cumulative], marker="o", label="Log loss")
    ax.plot(x, [row.get("pr_auc_exactly_1") or 0 for row in cumulative], marker="o", label="PR-AUC exactly +1")
    ax.plot(x, [row.get("pr_auc_final_week") or 0 for row in cumulative], marker="o", label="PR-AUC final week")
    ax.set_xticks(x, [row["model"] for row in cumulative], rotation=25, ha="right")
    ax.set_title("Cumulative families against the PR #140 hazard")
    ax.legend(fontsize=8)
    save(fig, "new_feature_family_ablation.png")

    labels = ["Final week", "Exactly +1", "Exactly +2", "3+"]
    keys = ("pr_auc_final_week", "pr_auc_exactly_1", "pr_auc_exactly_2", "pr_auc_3_plus")
    base = result["baseline"]
    best = result["best_metrics"]
    fig, ax = plt.subplots(figsize=(7.4, 4.2))
    x = np.arange(len(labels))
    ax.bar(x - 0.15, [base.get(key) or 0 for key in keys], width=0.3, label="PR #140")
    ax.bar(x + 0.15, [best.get(key) or 0 for key in keys], width=0.3, label=result["best_model"])
    ax.set_xticks(x, labels)
    ax.set_ylim(0, 1.05)
    ax.set_title("Bucket discrimination before and after the added families")
    ax.legend()
    save(fig, "middle_bucket_pr_auc.png")

    fig, ax = plt.subplots(figsize=(7.2, 4.4))
    base_cal = base.get("calibration") or []
    best_cal = best.get("calibration") or []
    if base_cal and best_cal:
        x = np.arange(len(base_cal))
        ax.plot(x, [row["observed_share"] for row in base_cal], marker="o", label="Observed share")
        ax.plot(x, [row["mean_predicted"] for row in base_cal], marker="o", label="PR #140 predicted")
        ax.plot(x, [row["mean_predicted"] for row in best_cal], marker="o", label="Expanded predicted")
        ax.set_xticks(x, [row["bucket"] for row in base_cal], rotation=15, ha="right")
    ax.set_ylim(0, 1.05)
    ax.set_title("Calibration of the remaining-week probabilities")
    ax.legend(fontsize=8)
    save(fig, "remaining_weeks_calibration_comparison.png")

    fig, ax = plt.subplots(figsize=(6.4, 4.2))
    ax.bar(["PR #140", result["best_model"]], [base.get("ranking_pairwise") or 0, best.get("ranking_pairwise") or 0], color="#9b2335")
    ax.set_ylim(0, 1.05)
    ax.set_title("Pairwise urgency ranking on the film-by-theater holdout")
    save(fig, "urgency_ranking_comparison.png")

    names = list(result["error_counts"])
    fig, ax = plt.subplots(figsize=(8.2, 4.4))
    ax.barh(names, [result["error_counts"][name] for name in names], color="#6b4c3b")
    ax.set_xlabel("Holdout rows")
    ax.set_title("Where the PR #140 model is confidently wrong")
    save(fig, "error_archetypes.png")


def _table(rows: Sequence[Mapping[str, Any]], columns: Sequence[tuple[str, str]]) -> str:
    head = "".join(f"<th>{html.escape(label)}</th>" for _key, label in columns)
    body = []
    for row in rows:
        cells = []
        for key, _label in columns:
            value = row.get(key, "")
            if isinstance(value, float) and ("pr_" in key or "share" in key or key.startswith("survive") or "pairwise" in key):
                text = _pct(value)
            elif isinstance(value, float):
                text = _num(value)
            else:
                text = "" if value is None else str(value)
            cells.append(f"<td>{html.escape(text)}</td>")
        body.append("<tr>" + "".join(cells) + "</tr>")
    return f"<table><thead><tr>{head}</tr></thead><tbody>{''.join(body)}</tbody></table>"


def render_html(result: Mapping[str, Any], out_dir: Path) -> None:
    base = result["baseline"]
    best = result["best_metrics"]
    boot = result["bootstrap_best_minus_baseline"]
    two = result["two_stage"]
    opening = result["opening_week"]
    coverage = result["coverage"]

    def section(number: int, title: str, body: str) -> str:
        return f"<section><h2>{number}. {html.escape(title)}</h2>{body}</section>"

    def figure(name: str, caption: str) -> str:
        return f"<figure><img src='{name}' alt='{html.escape(caption)}'><figcaption>{html.escape(caption)}</figcaption></figure>"

    metric_cols = (
        ("model", "Model"),
        ("mode", "How added"),
        ("n", "N"),
        ("log_loss", "Log loss"),
        ("brier", "Brier"),
        ("pr_auc_final_week", "Final week"),
        ("pr_auc_exactly_1", "Exactly +1"),
        ("pr_auc_exactly_2", "Exactly +2"),
        ("pr_auc_3_plus", "3+"),
        ("median_abs_error_capped", "Median week error"),
        ("ranking_pairwise", "Pairwise rank"),
    )
    parts = [
        "<!DOCTYPE html><html lang='en'><head><meta charset='utf-8'><title>Remaining-week feature expansion</title>",
        "<style>body{font-family:Georgia,serif;max-width:1000px;margin:2rem auto;padding:0 1.2rem;color:#1c1c1c;line-height:1.45}",
        "h1{font-size:1.7rem} h2{margin-top:2rem;font-size:1.2rem} table{border-collapse:collapse;width:100%;font-family:ui-sans-serif,sans-serif;font-size:.82rem;margin:.8rem 0}",
        "th,td{border-bottom:1px solid #ddd;text-align:left;padding:.35rem .4rem;vertical-align:top} th{background:#f6f4ef}",
        "img{max-width:100%;height:auto;border:1px solid #eee} figcaption{font-family:ui-sans-serif,sans-serif;font-size:.84rem;color:#444}</style></head><body>",
        "<h1>What would tell a one-week film from a longer run?</h1>",
        "<p>Same pre-publication snapshot as PR #140. Train through 2026-08-16, validation through 2026-09-06, holdout after that. Production Leaving Soon is unchanged.</p>",
        section(1, "What is still hard?",
            f"<p>The PR #140 hazard already reaches final-week PR-AUC {_num(base.get('pr_auc_final_week'))} and pairwise ranking {_pct(base.get('ranking_pairwise'))}. "
            f"Exactly one more week is {_num(base.get('pr_auc_exactly_1'))}. Exactly two is {_num(base.get('pr_auc_exactly_2'))} on a small holdout cell. "
            f"The uncertain middle in this audit has {result['middle_n']} rows.</p>"
            + figure("middle_case_outcomes.png", "What actually happened when the current model was unsure")
            + figure("error_archetypes.png", "High-confidence mistakes of the PR #140 model")),
        section(2, "What extra data does AMC expose?",
            "<p>The showtimes payload has been probed on 29 June, 1 August, 3 September, and 1 October 2026. "
            "Adult ticket price and auditorium number are in the daily logs from 19 July. "
            "Seat capacity (`maximumIntendedAttendance`) is present as a key and empty. "
            "`isAlmostSoldOut` is stored for the whole window and true on well under 2% of showtimes. "
            "`isSoldOut` is true a handful of times a day. There is no seat map or seats-remaining field in the showtimes response.</p>"
            + _table(result["probe"], (("snapshot", "Snapshot"), ("showtimes", "Showtimes"), ("almost_sold_out_true", "Almost sold out"), ("is_sold_out_true", "Sold out"), ("auditorium_captured", "Auditorium captured"), ("ticket_prices_captured", "Prices captured")))),
        section(3, "What useful TMDB metadata is safe?",
            f"<p>Stable language, genres, runtime, and release date are joined from the stored enrichment and confirmed matches. "
            f"Language is known on {coverage['language_known_rows']} of {coverage['rows']} pre-publication rows. "
            f"Adult price matched on {coverage['priced_rows']} rows. "
            "Current popularity, vote count, vote average, revenue, and budget are not used.</p>"
            + _table(result["tmdb_inventory"], (("field", "Field"), ("class", "Class"), ("reason", "Why")))),
        section(4, "Does opening footprint matter?",
            figure("survival_by_opening_footprint.png", "Remaining run by how large the opening week was")
            + _table(result["survival"]["opening"], (("opening", "Opening week"), ("n", "N"), ("survive_at_least_1", "At least 1"), ("n_1", "N"), ("survive_at_least_2", "At least 2"), ("survive_at_least_3", "At least 3")))
            + figure("survival_by_current_vs_peak.png", "Remaining run by how far the current week has fallen from its observed peak")),
        section(5, "Does schedule quality matter beyond showtime count?",
            figure("survival_by_prime_time_share.png", "Remaining run by prime-time share")
            + _table(result["survival"]["friday_evening"], (("friday_evening", "Friday or Saturday evening"), ("n", "N"), ("survive_at_least_1", "At least 1"), ("survive_at_least_2", "At least 2"), ("survive_at_least_3", "At least 3")))),
        section(6, "Does market shape matter?",
            figure("survival_by_market_shape.png", "Several full theaters versus a footprint of thin schedules")
            + _table(result["survival"]["shape"], (("shape", "Shape"), ("n", "N"), ("survive_at_least_1", "At least 1"), ("survive_at_least_2", "At least 2"), ("survive_at_least_3", "At least 3")))),
        section(7, "Do film or release archetypes explain thin schedules?",
            figure("film_archetype_survival.png", "Remaining run by archetype")
            + _table(result["survival"]["archetype"], (("archetype", "Archetype"), ("n", "N"), ("survive_at_least_1", "At least 1"), ("n_1", "N"), ("survive_at_least_2", "At least 2"), ("survive_at_least_3", "At least 3")))),
        section(8, "Can competition be measured better?",
            "<p>The new competition block counts national titles whose AMC release date falls in the upcoming week and that this catalog had already seen, plus advance showtimes already on sale at the theater. "
            "A separate run adds whether the incumbent itself already lists showtimes beyond the next week. That last flag is known future commitment, not a forecast from schedule shape. Both are in the results table.</p>"),
        section(9, "Does a two-stage survival model improve the middle?",
            f"<p>Stage 1 is the chance the visible week is the last. Stage 2 splits the survivors into exactly one more week, exactly two, and three or more. "
            f"Holdout log loss {_num(two.get('log_loss'))}, exactly +1 PR-AUC {_num(two.get('pr_auc_exactly_1'))}, exactly +2 {_num(two.get('pr_auc_exactly_2'))}, final week {_num(two.get('pr_auc_final_week'))}. "
            f"The single weekly hazard on the PR #140 features has log loss {_num(base.get('log_loss'))}.</p>"
            f"<p>A separate opening-week hazard, fit only on first-week rows, has holdout log loss {_num((opening.get('separate') or {}).get('log_loss'))} "
            f"against {_num((opening.get('general') or {}).get('log_loss'))} for the general model on the same {opening.get('holdout_n')} rows.</p>"),
        section(10, "What improves +1 versus +2?",
            f"<p>The selected expanded model is <strong>{html.escape(str(result['best_model']))}</strong>. "
            f"Log loss moves from {_num(base.get('log_loss'))} to {_num(best.get('log_loss'))}. "
            f"Exactly +1 moves from {_num(base.get('pr_auc_exactly_1'))} to {_num(best.get('pr_auc_exactly_1'))}. "
            f"Exactly +2 moves from {_num(base.get('pr_auc_exactly_2'))} to {_num(best.get('pr_auc_exactly_2'))}. "
            f"Final week moves from {_num(base.get('pr_auc_final_week'))} to {_num(best.get('pr_auc_final_week'))}. "
            f"Pairwise ranking moves from {_pct(base.get('ranking_pairwise'))} to {_pct(best.get('ranking_pairwise'))}.</p>"
            f"<p>Bootstrap of the holdout, {boot.get('draws')} draws of {boot.get('n')} paired rows: "
            f"log-loss delta mean {_num((boot.get('log_loss') or {}).get('mean_delta'))} "
            f"(interval {_num((boot.get('log_loss') or {}).get('low'))} to {_num((boot.get('log_loss') or {}).get('high'))}). "
            f"Exactly-+1 delta mean {_num((boot.get('pr_auc_exactly_1') or {}).get('mean_delta'))} "
            f"(interval {_num((boot.get('pr_auc_exactly_1') or {}).get('low'))} to {_num((boot.get('pr_auc_exactly_1') or {}).get('high'))}). "
            f"A interval that crosses zero is a change this holdout cannot pin down.</p>"
            + figure("new_feature_family_ablation.png", "Log loss and the two hardest PR-AUC numbers as families are added")
            + figure("middle_bucket_pr_auc.png", "Bucket PR-AUC, baseline versus the selected model")
            + _table(result["results"], metric_cols)),
        section(11, "Error archetypes",
            "<p>These are the PR #140 model's confident mistakes on the holdout. The named rows are the highest-confidence examples.</p>"
            + _table(result["errors"][:12], (("title", "Film"), ("theater_name", "Theater"), ("observation_date", "Snapshot"), ("error_archetype", "Miss"), ("segment", "Segment"), ("archetype", "Archetype"), ("current_week_screenings", "This week"), ("opening_week_screenings", "Opening"), ("market_theater_count", "Theaters"), ("base_p0", "P(final)"), ("bucket", "Actual bucket")))),
        section(12, "What data should we begin collecting prospectively?",
            "<p>The signal this history cannot supply is demand on a thin schedule: how full those six shows are. "
            "AMC's showtimes payload does not include a seat map, and the capacity field it does include is empty. "
            "`isAlmostSoldOut` is already logged and almost never true, so it is a weak substitute. "
            "The collection note in this folder is the plan. Nothing here is wired into production scoring.</p>"
            f"<p>Direct market model with the new film-level fields: log loss {_num(result['market_expanded'].get('log_loss'))}, "
            f"exactly +1 {_num(result['market_expanded'].get('pr_auc_exactly_1'))}, "
            f"against the PR #140 market feature set at log loss {_num(result['market_baseline'].get('log_loss'))}.</p>"),
        section(13, "Recommended next modeling direction",
            "<p>Keep the weekly hazard. The added families are worth keeping only where the holdout log loss and the exactly-+1 number move together and the bootstrap interval stays on one side of zero. "
            "Do not stand up a separate opening-week model unless that comparison above is clearly better. "
            "Start a research log of adult price, auditorium id, and any future seat-availability field, and start a weekly snapshot of TMDB popularity and vote count. "
            "Evaluate those only after they have their own history.</p>"),
        "</body></html>",
    ]
    (out_dir / "index.html").write_text("".join(parts), encoding="utf-8")


def _collection_plan() -> str:
    return """# Prospective feature collection

Research only. Do not feed these fields to the production Leaving Soon model until each one has its own history and a later audit.

## Already in the daily logs, not yet a stable model input

| Field | Source | Cadence | Grain | Why | How long before a fair test |
| --- | --- | --- | --- | --- | --- |
| `ticketPrices` adult price | AMC showtimes attribute, daily log from 2026-07-19 | every daily scrape | showtime | Slot quality when the screening count is similar | Already partially usable; keep it on the lifecycle row so a later audit does not re-parse logs |
| `auditorium` and `layoutId` | same | every daily scrape | showtime | Screen identity. Not capacity. Useful only if a capacity table is joined later | Same as price |
| `isAlmostSoldOut`, `isSoldOut` | showtimes | every daily scrape | showtime | Demand flags. In this window they are true on a very small share of showtimes, so they need a longer run before they can be judged | One more season, and only if the true rate rises enough to split films |

`maximumIntendedAttendance` is on the payload and empty in every probed log. Keep the key. Do not invent a capacity.

## Not in the historical record

| Field | Source | Cadence | Grain | Storage | Why | How long |
| --- | --- | --- | --- | --- | --- | --- |
| Seat map or seats remaining, if AMC exposes one outside the showtimes list | A separate, rate-limited read of a purchase or seat endpoint. Confirm it means seats sold before storing it as demand | once per showtime on the day it is first on sale, then T-3, T-1 | showtime | one row: showtime id, observed at, capacity, unavailable seats, source field name | A thin schedule that is selling out is a different film from a thin schedule that is empty | At least one full booking season, roughly three months of paired snapshots, before fitting |
| Auditorium capacity | that same seat response, or a theater layout feed | once per layout id, refreshed when `layoutVersionNumber` changes | auditorium | layout id, seat count | Turns auditorium id into a commitment measure | As soon as the feed exists; capacity itself is stable |
| TMDB `popularity` | TMDB movie details | weekly, for films currently listed at an enabled AMC | film × week | tmdb id, week ending, popularity | Interest that the schedule has not yet reflected | 8 to 12 weekly snapshots before a first look |
| TMDB `vote_count` and `vote_average` | same call | same weekly snapshot | film × week | three numbers beside popularity | Growth in votes during the run | Same window. Do not backfill today's values onto old weeks |

Do not scrape seat maps aggressively. If the only access is a per-showtime purchase call, sample the visible week's showtimes once per snapshot day rather than polling. Store the raw count and the field name so a later audit can tell seats-held from seats-sold.

Estimated size for the research log: one row per showtime per snapshot day is what the daily logs already are. A compact side file of `(showtime id, snapshot date, adult price, auditorium, almost sold out, sold out)` is a few megabytes a month. A weekly TMDB file for the films on screen is a few hundred rows.

## Explicitly rejected for historical scoring

- Today's TMDB popularity, vote count, vote average, revenue, or budget.
- The movies-catalog `attribute_codes` list, which is the set of formats seen by the latest refresh.
- Any current seat map applied to a past week.
"""


def write_outputs(result: dict[str, Any], out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    render_charts(result, out_dir)
    middle_fields = (
        "title", "theater_name", "observation_date", "segment", "archetype",
        "base_p0", "base_p1", "base_p2", "base_p3", "base_expected",
        "p0", "p1", "p2", "p3", "expected_weeks",
        "bucket", "remaining_weeks", "censored",
        "current_week_screenings", "opening_week_screenings", "current_over_peak",
        "prime_share", "friday_saturday_evening_share", "market_theater_count",
        "theaters_with_10plus", "screening_concentration", "mean_adult_price",
    )
    _write_csv(out_dir / "middle_case_observations.csv", result["middle"], middle_fields)
    _write_csv(out_dir / "amc_available_field_inventory.csv", result["amc_inventory"])
    _write_csv(out_dir / "tmdb_candidate_feature_inventory.csv", result["tmdb_inventory"])
    _write_csv(out_dir / "new_feature_family_results.csv", result["results"])
    _write_csv(
        out_dir / "error_archetypes.csv",
        result["errors"],
        ("title", "theater_name", "observation_date", "segment", "archetype", "error_archetype", "bucket", "base_p0", "base_p1", "base_p2", "base_p3", "current_week_screenings", "opening_week_screenings", "current_over_peak", "market_theater_count", "prime_share"),
    )
    dictionary = [
        {"feature": "opening_week_screenings", "family": "opening", "historical": "yes, from played weeks before the snapshot", "included": "yes"},
        {"feature": "current_over_opening", "family": "opening", "historical": "yes; blank when the run is left-truncated", "included": "yes"},
        {"feature": "current_over_peak", "family": "opening", "historical": "yes, observed weeks only", "included": "yes"},
        {"feature": "friday_saturday_evening_share", "family": "schedule quality", "historical": "yes, show times on the snapshot", "included": "yes"},
        {"feature": "matinee_share", "family": "schedule quality", "historical": "yes", "included": "yes"},
        {"feature": "late_share", "family": "schedule quality", "historical": "yes", "included": "yes"},
        {"feature": "theaters_with_10plus", "family": "market shape", "historical": "yes", "included": "yes"},
        {"feature": "screening_concentration", "family": "market shape", "historical": "yes", "included": "yes"},
        {"feature": "runtime_minutes", "family": "metadata", "historical": "stable AMC or TMDB value", "included": "yes"},
        {"feature": "days_since_release", "family": "metadata", "historical": "release date on or before the snapshot", "included": "yes"},
        {"feature": "language_* and genre_*", "family": "metadata", "historical": "stable TMDB or AMC genre", "included": "yes"},
        {"feature": "arch_*", "family": "archetype", "historical": "derived from those stable fields and opening theater count", "included": "yes"},
        {"feature": "known_national_openings", "family": "competition", "historical": "catalog first_seen on or before the snapshot and release date in the next week", "included": "yes"},
        {"feature": "advance_screening_count", "family": "competition", "historical": "showtimes already listed at the snapshot for titles that have not played", "included": "yes"},
        {"feature": "mean_adult_price", "family": "auditorium/price", "historical": "daily log from 2026-07-19; blank before that", "included": "yes"},
        {"feature": "distinct_auditoriums", "family": "auditorium/price", "historical": "same window; number is not capacity", "included": "yes"},
        {"feature": "screenings_x_week and related products", "family": "interactions", "historical": "products of pre-publication features", "included": "yes"},
        {"feature": "incumbent_beyond_next_week", "family": "known future commitment", "historical": "yes, but it is a listing beyond next week, so it is scored separately", "included": "separate run only"},
        {"feature": "tmdb popularity, votes, revenue", "family": "rejected", "historical": "no", "included": "no"},
        {"feature": "seat map, seats remaining, auditorium capacity", "family": "prospective", "historical": "no", "included": "no"},
        {"feature": "movies catalog attribute_codes", "family": "rejected", "historical": "current union of formats", "included": "no"},
    ]
    _write_csv(out_dir / "feature_dictionary_expanded.csv", dictionary)
    render_html(result, out_dir)
    (out_dir / "prospective_feature_collection_plan.md").write_text(_collection_plan(), encoding="utf-8")
    slim = {key: value for key, value in result.items() if key not in {"middle", "errors", "baseline_scored", "best_scored"}}
    (out_dir / "summary.json").write_text(json.dumps(slim, indent=2, default=str), encoding="utf-8")
