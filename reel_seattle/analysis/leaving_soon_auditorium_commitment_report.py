"""Charts, tables, and the review page for the auditorium-commitment audit."""

from __future__ import annotations

import csv
import html
import json
import math
from pathlib import Path
from typing import Any, Mapping, Sequence

import numpy as np

CHARTS = (
    "auditorium_coverage.png",
    "auditorium_layout_stability.png",
    "auditorium_hierarchy_by_theater.png",
    "survival_by_auditorium_tier.png",
    "auditorium_movement_before_exit.png",
    "opening_vs_current_auditorium_strength.png",
    "auditorium_feature_ablation.png",
    "error_examples_with_auditorium.png",
)

FEATURE_FIELDS = (
    "observation_date",
    "title",
    "theater_name",
    "segment",
    "bucket",
    "censored",
    "current_week_screenings",
    "opening_week_screenings",
    "distinct_auditoriums",
    "dominant_auditorium",
    "dominant_layout_id",
    "mean_auditorium_score",
    "best_auditorium_score",
    "high_tier_share",
    "prime_high_tier_share",
    "tier",
    "opening_auditorium_score",
    "opening_to_current_score",
    "auditorium_score_change",
    "peak_to_current_score",
    "current_over_peak_auditorium",
    "consecutive_weeks_same_tier",
    "moved_to_weaker",
    "moved_to_stronger",
    "premium_retained",
    "premium_lost_since_prior_week",
    "mean_adult_price",
    "price_vs_theater_median",
    "price_vs_format_median",
    "price_vs_daypart_median",
)

ERROR_FIELDS = (
    "error_class",
    "title",
    "theater_name",
    "observation_date",
    "predicted_bucket",
    "bucket",
    "dominant_auditorium",
    "tier",
    "opening_auditorium_score",
    "mean_auditorium_score",
    "opening_to_current_score",
    "auditorium_score_change",
    "premium_retained",
    "premium_lost_since_prior_week",
    "mean_adult_price",
    "current_week_screenings",
    "opening_week_screenings",
    "p0",
    "p1",
    "p2",
    "p3",
)

METRIC_KEYS = (
    "n",
    "log_loss",
    "brier",
    "pr_auc_final_week",
    "pr_auc_exactly_1",
    "pr_auc_exactly_2",
    "pr_auc_3_plus",
    "median_abs_error_capped",
    "ranking_pairwise",
)


def _num(value: Any, digits: int = 3) -> str:
    if not isinstance(value, (int, float)) or isinstance(value, bool) or (isinstance(value, float) and math.isnan(value)):
        return "n/a"
    if isinstance(value, float):
        return f"{value:.{digits}f}"
    return str(value)


def _pct(value: Any) -> str:
    if not isinstance(value, (int, float)) or isinstance(value, bool) or (isinstance(value, float) and math.isnan(value)):
        return "n/a"
    return f"{float(value) * 100:.1f}%"


def _cell(value: Any) -> Any:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return ""
    if isinstance(value, (np.floating, np.integer)):
        return value.item()
    return value


def _write_csv(path: Path, rows: Sequence[Mapping[str, Any]], fields: Sequence[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(fields), extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow({key: _cell(row.get(key)) for key in fields})


def _metric(result: Mapping[str, Any], model: str, mode: str | None = None) -> Mapping[str, Any]:
    for row in result["results"]:
        if row["model"] != model:
            continue
        if mode is not None and row.get("mode") != mode:
            continue
        return row
    return {}


def _interval(boot: Mapping[str, Any], key: str) -> str:
    block = boot.get(key) if isinstance(boot, Mapping) else None
    if not isinstance(block, Mapping):
        return "n/a"
    return f"{_num(block.get('mean_delta'))} ({_num(block.get('low'))} to {_num(block.get('high'))})"


def render_charts(result: Mapping[str, Any], out_dir: Path) -> None:
    import matplotlib.pyplot as plt

    plt.rcParams.update({"figure.facecolor": "white", "axes.grid": True, "grid.alpha": 0.25, "font.size": 10, "figure.dpi": 120})

    def save(fig, name: str) -> None:
        fig.tight_layout()
        fig.savefig(out_dir / name, bbox_inches="tight")
        plt.close(fig)

    dates = [row for row in result["coverage_summary"] if row["slice"] == "log_date"]
    fig, ax = plt.subplots(figsize=(9, 4))
    ax.plot([row["key"] for row in dates], [row["auditorium_share"] or 0 for row in dates], label="auditorium")
    ax.plot([row["key"] for row in dates], [row["adult_price_share"] or 0 for row in dates], label="adult price")
    ax.set_title("Share of logged showtimes with auditorium and adult price")
    ax.set_ylabel("share")
    ax.legend()
    for label in ax.get_xticklabels():
        label.set_rotation(60)
        label.set_fontsize(7)
    save(fig, "auditorium_coverage.png")

    labels: dict[str, int] = {}
    for row in result["mapping"]:
        labels[row["mapping_stability"]] = labels.get(row["mapping_stability"], 0) + 1
    fig, ax = plt.subplots(figsize=(8, 4))
    ax.barh(list(labels), list(labels.values()))
    ax.set_title("Auditorium-to-layout mapping rows")
    ax.set_xlabel("mapping rows")
    save(fig, "auditorium_layout_stability.png")

    hierarchy = result["hierarchy"]
    theaters = sorted({row["theater"] for row in hierarchy})
    fig, ax = plt.subplots(figsize=(10, 6))
    for index, theater in enumerate(theaters):
        rows = sorted((row for row in hierarchy if row["theater"] == theater), key=lambda item: item["commitment_score"])
        ax.scatter([row["commitment_score"] for row in rows], [index] * len(rows), s=30)
        for row in rows:
            ax.text(row["commitment_score"], index, str(row["auditorium_number"]), fontsize=7, ha="center", va="bottom")
    ax.set_yticks(range(len(theaters)))
    ax.set_yticklabels(theaters, fontsize=8)
    ax.set_xlabel("commitment percentile as of " + result["hierarchy_as_of"])
    ax.set_title("Within-theater auditorium hierarchy")
    save(fig, "auditorium_hierarchy_by_theater.png")

    survival = sorted(result["survival_tier"], key=lambda row: row["tier"])
    fig, ax = plt.subplots(figsize=(8, 4))
    names = [row["tier"] for row in survival]
    ax.bar(names, [row.get("survive_at_least_1") or 0 for row in survival])
    for index, row in enumerate(survival):
        ax.text(index, row.get("survive_at_least_1") or 0, f"n={row['n']}", ha="center", va="bottom", fontsize=8)
    ax.set_ylim(0, 1.15)
    ax.set_ylabel("share surviving at least 1 more week")
    ax.set_title("Holdout survival by auditorium tier")
    save(fig, "survival_by_auditorium_tier.png")

    movement = result["movement"]
    fig, ax = plt.subplots(figsize=(7, 4))
    keys = ["final_week", "plus_1", "plus_3"]
    weaker = [movement[key].get("share_moved_weaker") or 0 for key in keys]
    stronger = [movement[key].get("share_moved_stronger") or 0 for key in keys]
    positions = range(len(keys))
    ax.bar([item - 0.15 for item in positions], weaker, width=0.3, label="moved weaker")
    ax.bar([item + 0.15 for item in positions], stronger, width=0.3, label="moved stronger")
    ax.set_xticks(list(positions))
    ax.set_xticklabels([f"{key}\nn={movement[key].get('n', 0)}" for key in keys])
    ax.set_ylim(0, 1)
    ax.set_title("Holdout week-over-week auditorium movement")
    ax.legend()
    save(fig, "auditorium_movement_before_exit.png")

    opening_bins = {"lower than opening": [], "about the same": [], "higher than opening": [], "score unavailable": []}
    for row in result["observations"]:
        if row.get("censored"):
            continue
        delta = row.get("opening_to_current_score")
        if not isinstance(delta, float) or math.isnan(delta):
            opening_bins["score unavailable"].append(row)
        elif delta < -0.15:
            opening_bins["lower than opening"].append(row)
        elif delta > 0.15:
            opening_bins["higher than opening"].append(row)
        else:
            opening_bins["about the same"].append(row)
    fig, ax = plt.subplots(figsize=(8, 4))
    labels_open = list(opening_bins)
    rates = []
    for label in labels_open:
        items = opening_bins[label]
        rates.append(sum(1 for row in items if int(row["remaining_weeks"]) >= 1) / len(items) if items else 0)
    ax.bar(labels_open, rates)
    for index, label in enumerate(labels_open):
        ax.text(index, rates[index], f"n={len(opening_bins[label])}", ha="center", va="bottom", fontsize=8)
    ax.set_ylim(0, 1.15)
    ax.set_ylabel("share surviving at least 1 more week")
    ax.set_title("Opening auditorium strength versus the current week")
    save(fig, "opening_vs_current_auditorium_strength.png")

    alone = [row for row in result["results"] if row.get("mode") in {None, "added_alone"} or row["model"] == "pr141_opening"]
    fig, ax = plt.subplots(figsize=(9, 4))
    ax.bar([row["model"] for row in alone], [row.get("log_loss") or 0 for row in alone])
    ax.set_ylabel("holdout log loss")
    ax.set_title("PR #141 baseline plus one auditorium family")
    for label in ax.get_xticklabels():
        label.set_rotation(25)
        label.set_ha("right")
    save(fig, "auditorium_feature_ablation.png")

    groups: dict[str, list[float]] = {}
    for row in result["examples"]:
        score = row.get("mean_auditorium_score")
        if isinstance(score, float) and not math.isnan(score):
            groups.setdefault(row["error_class"], []).append(score)
    fig, ax = plt.subplots(figsize=(8, 4))
    names = list(groups)
    ax.bar(names, [sum(values) / len(values) for values in groups.values()])
    for index, name in enumerate(names):
        ax.text(index, sum(groups[name]) / len(groups[name]), f"n={len(groups[name])}", ha="center", va="bottom", fontsize=8)
    ax.set_ylim(0, 1.15)
    ax.set_ylabel("mean auditorium score")
    ax.set_title("Holdout errors and the two named examples")
    for label in ax.get_xticklabels():
        label.set_rotation(20)
        label.set_ha("right")
    save(fig, "error_examples_with_auditorium.png")


def _recommendation(result: Mapping[str, Any]) -> str:
    hierarchy = result["bootstrap_hierarchy"].get("log_loss")
    if not isinstance(hierarchy, Mapping):
        return "The hierarchy comparison did not produce a bootstrap interval, so auditorium features stay out of the model."
    low = hierarchy["low"]
    high = hierarchy["high"]
    if high < 0 and low < 0:
        return "The holdout supports adding the theater-relative auditorium score: log loss improved and the 95% bootstrap interval stays below zero. That is still a research result, not a production change."
    if low > 0:
        return "Adding the auditorium hierarchy made holdout log loss worse, and the bootstrap interval stays above zero. Leave it out."
    return "Auditorium hierarchy does not clear the PR #141 model. The bootstrap interval for the log-loss change crosses zero, so the assignment is mostly redundant with current-week screening count and opening footprint."


def render_html(result: Mapping[str, Any]) -> str:
    def rows_html(items, fields):
        head = "".join(f"<th>{html.escape(field)}</th>" for field in fields)
        body = []
        for item in items:
            body.append("<tr>" + "".join(f"<td>{html.escape(_num(item.get(field)) if isinstance(item.get(field), float) else str(_cell(item.get(field))))}</td>" for field in fields) + "</tr>")
        return f"<table><thead><tr>{head}</tr></thead><tbody>{''.join(body)}</tbody></table>"

    coverage_dates = [row for row in result["coverage_summary"] if row["slice"] == "log_date" and (row["auditorium_share"] or 0) > 0]
    first = result["first_auditorium_log"]
    last_empty = next((row["key"] for row in reversed(result["coverage_summary"]) if row["slice"] == "log_date" and not row["auditorium_share"]), "n/a")
    movement = result["movement"]
    hierarchy_boot = result["bootstrap_hierarchy"]
    price_boot = result["bootstrap_price"]
    all_boot = result["bootstrap_all"]
    base = _metric(result, "pr141_opening")
    hierarchy = _metric(result, "hierarchy_score", "added_alone")
    price = _metric(result, "relative_price", "added_alone")
    everyone = _metric(result, "all_auditorium", "cumulative")
    sold = result["sold_out"]
    almost = result["almost_sold_out"]
    changes = result["assignment_changes"]
    premium_rooms = [row for row in result["hierarchy"] if float(row["premium_share"]) >= 0.8]
    premium_tiers = {}
    for row in premium_rooms:
        premium_tiers[row["tier"]] = premium_tiers.get(row["tier"], 0) + 1
    survival_bits = []
    for row in sorted(result["survival_tier"], key=lambda item: item["tier"]):
        survival_bits.append(f"{row['tier']} {_pct(row.get('survive_at_least_1'))} (n={row.get('n_1', row['n'])})")
    named = [
        row
        for row in result["examples"]
        if "alderwood" in row["theater_name"].casefold() and row["title"].casefold() in {"cars: 20th anniversary", "by any means"}
    ]
    raw = _metric(result, "raw_auditorium_count", "added_alone")
    premium_metric = _metric(result, "premium_retention", "added_alone")
    movement_metric = _metric(result, "movement", "added_alone")
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Auditorium commitment audit</title>
<style>
body {{ font-family: Georgia, serif; margin: 2rem auto; max-width: 980px; line-height: 1.45; color: #1c1c1c; }}
img {{ max-width: 100%; height: auto; }}
table {{ border-collapse: collapse; width: 100%; font-size: 0.86rem; }}
th, td {{ border-bottom: 1px solid #ccc; text-align: left; padding: 0.3rem; vertical-align: top; }}
</style></head><body>
<h1>AMC auditorium assignment and remaining-run forecasts</h1>
<p>Research only. Production Leaving Soon scoring, thresholds, and the public artifact were not changed. Scores use showtimes that had already played before the prediction date. Premium format and ticket price are not inputs to the hierarchy score.</p>
<h2>1. What auditorium data do we actually have?</h2>
<p>The first daily log with an auditorium number is {html.escape(str(first))}. The last probed log without it is {html.escape(str(last_empty))}. Layout id and layout version arrive in the same capture. Adult price is on the same records. Pre-publication rows with a matched auditorium: {result['coverage']['rows_with_auditorium']} of {result['coverage']['prepublication_rows']}. Holdout rows with a usable score: {result['coverage']['holdout_with_score']}.</p>
<img src="auditorium_coverage.png" alt="Auditorium and price coverage by log date">
{rows_html(coverage_dates[:8], ("key", "showtimes", "auditorium_share", "adult_price_share", "is_sold_out_true", "is_almost_sold_out_true"))}
<h2>2. Is auditorium identity stable?</h2>
<p>{result['stable_auditoriums']} theater-auditorium pairs keep one layout id on the show-date listing. {result['mixed_auditoriums']} do not, including any auditorium whose layout id is missing. No layout version changes appear on those show-date rows, and no layout id is shared by two auditorium numbers. Across earlier logs for the same showtime, the auditorium number differs on {changes['auditorium_changed_across_logs']} of {changes['showtime_keys']} keys and the layout id differs on {changes['layout_changed_across_logs']}. That is a small pre-show reassignment rate, not a rotating layout identity. Auditorium number can be treated as a persistent screen inside one theater. It is not comparable across theaters, and layout id is not a more stable key.</p>
<img src="auditorium_layout_stability.png" alt="Mapping stability counts">
<h2>3. Can we infer an auditorium hierarchy?</h2>
<p>As of {html.escape(result['hierarchy_as_of'])}, an auditorium needs 40 played showtimes before it receives a score. The raw score is the average of prime-time share, Friday/Saturday evening share, opening-week share, and wide-opening share, using only shows dated before that day. Percentile rank is inside the theater. Price and premium format are left out of the score. Every enabled theater has a spread from 0 to 1, so the screens are not identical. Dedicated premium rooms (premium share at least 80%) land in these tiers: {html.escape(str(premium_tiers))}. Several of the lowest-scoring auditoriums are the premium houses, because they take fewer opening-week bookings. The ranking is a programming pattern. It is not a seat-capacity ranking.</p>
<img src="auditorium_hierarchy_by_theater.png" alt="Auditorium scores by theater">
<h2>4. Does moving to a weaker screen precede departure?</h2>
<p>Holdout survival for at least one more week by tier: {html.escape('; '.join(survival_bits))}. The top tier does not keep films longer than the lower tiers. On labeled holdout rows with both weeks matched, final-week films moved to a weaker auditorium in {_pct(movement['final_week'].get('share_moved_weaker'))} of cases (n={movement['final_week'].get('n', 0)}) and to a stronger one in {_pct(movement['final_week'].get('share_moved_stronger'))}. Films with 3 or more weeks left moved weaker in {_pct(movement['plus_3'].get('share_moved_weaker'))} (n={movement['plus_3'].get('n', 0)}). Departure is not preceded by a move to a weaker screen.</p>
<img src="auditorium_movement_before_exit.png" alt="Movement before exit">
<img src="survival_by_auditorium_tier.png" alt="Survival by tier">
<img src="opening_vs_current_auditorium_strength.png" alt="Opening versus current auditorium strength">
<h2>5. Does auditorium assignment help beyond showtime count?</h2>
<p>The comparison model is the PR #141 weekly hazard: pre-publication features plus opening footprint. Holdout log loss is {_num(base.get('log_loss'))}, final-week PR-AUC {_num(base.get('pr_auc_final_week'))}, exactly +1 {_num(base.get('pr_auc_exactly_1'))}, exactly +2 {_num(base.get('pr_auc_exactly_2'))}, 3+ {_num(base.get('pr_auc_3_plus'))}, median expected-week error {_num(base.get('median_abs_error_capped'))}, pairwise urgency {_pct(base.get('ranking_pairwise'))} (n={base.get('n')}).</p>
<p>Hierarchy score alone: log loss {_num(hierarchy.get('log_loss'))}, final-week {_num(hierarchy.get('pr_auc_final_week'))}, +1 {_num(hierarchy.get('pr_auc_exactly_1'))}, +2 {_num(hierarchy.get('pr_auc_exactly_2'))}, 3+ {_num(hierarchy.get('pr_auc_3_plus'))}. Bootstrap change versus PR #141, hierarchy minus baseline: log loss {_interval(hierarchy_boot, 'log_loss')}; final-week PR-AUC {_interval(hierarchy_boot, 'pr_auc_final_week')}; +1 {_interval(hierarchy_boot, 'pr_auc_exactly_1')}; +2 {_interval(hierarchy_boot, 'pr_auc_exactly_2')}. Negative log loss is an improvement. An interval that crosses zero is not a supported gain.</p>
<p>Raw auditorium count alone changes log loss from {_num(base.get('log_loss'))} to {_num(raw.get('log_loss'))}. Its bootstrap log-loss change is {_interval(result['bootstrap_raw'], 'log_loss')}. Week-over-week movement alone moves log loss to {_num(movement_metric.get('log_loss'))}. Premium retention alone moves it to {_num(premium_metric.get('log_loss'))}. All auditorium families together reach log loss {_num(everyone.get('log_loss'))}, bootstrap {_interval(all_boot, 'log_loss')}.</p>
<img src="auditorium_feature_ablation.png" alt="Ablation log loss">
{rows_html(result['results'], ('model', 'mode', *METRIC_KEYS))}
<h2>6. Does price help?</h2>
<p>Adult price is tested as the week's mean, divided by the theater median, the same theater's premium-or-standard median, and the same theater/daypart median. Medians use played shows dated before the snapshot. Price is not treated as demand. Added alone, log loss is {_num(price.get('log_loss'))}. Bootstrap log-loss change {_interval(price_boot, 'log_loss')}. If that interval crosses zero, relative price does not earn a feature.</p>
<h2>7. Are sold-out flags useful?</h2>
<p>isSoldOut is true on {sold['true_showtimes']} log rows ({sold['films']} films, {sold['theaters']} theaters), out of {result['facts_n']} captured showtime rows. {sold['true_on_show_date']} of those truths fall on the show date and {sold['true_before_show_date']} fall on an earlier log, so the same showtime can be counted more than once. isAlmostSoldOut is true on {almost['true_showtimes']} log rows, {almost['films']} films, {almost['theaters']} theaters; {almost['true_on_show_date']} fall on the show date. Both flags are too rare, and too concentrated in a handful of films, to estimate a remaining-week hazard. Keep logging them. This audit does not put them in the model.</p>
<h2>8. Error examples</h2>
<p>Cars: 20th Anniversary at Alderwood on 2026-09-08 was called final and played one more week. It was already on auditorium 15, a top-tier screen, with premium retained and only a 0.04 drop from its opening score, while showing 16 times off an opening footprint of 3. The screen assignment agreed with a still-strong booking. It did not mark the extra week. By Any Means at Alderwood on 2026-09-08 was still near its opening score (about 0.50 versus 0.44), lower-middle tier, premium retained, 36 screenings, and the model still treated the run as long. Auditorium assignment did not contain the exit those two misses needed.</p>
<img src="error_examples_with_auditorium.png" alt="Mean auditorium score by error class">
{rows_html(named, ('title', 'observation_date', 'error_class', 'bucket', 'predicted_bucket', 'dominant_auditorium', 'tier', 'mean_auditorium_score', 'opening_auditorium_score', 'premium_lost_since_prior_week', 'mean_adult_price', 'current_week_screenings', 'opening_week_screenings', 'p0'))}
<h2>9. What can we collect prospectively?</h2>
<p>AMC auditorium number, layout id, layout version, adult price, isSoldOut, and isAlmostSoldOut are already on the daily logs from the first capture date above. No additional AMC collector is required. Do not call restricted seat-map endpoints. {html.escape(result['capacity_note'])}</p>
<p>A research-only TMDB snapshot writer stores popularity, vote count, and vote average with a timestamp, film id, and TMDB id. It is not used in this historical evaluation. Run it only with TMDB credentials, and pass film rows on stdin. Output path: data/research/tmdb_weekly/.</p>
<h2>10. Recommendation</h2>
<p>{html.escape(_recommendation(result))}</p>
<p>Raw auditorium number is a within-theater label and is a poor cross-theater feature. Layout id does not replace auditorium number when one layout is shared. Premium retention stays a separate family from screen importance. Sold-out flags stay logged and unused until they are common.</p>
</body></html>
"""


def write_outputs(result: Mapping[str, Any], out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    render_charts(result, out_dir)
    _write_csv(
        out_dir / "coverage_summary.csv",
        result["coverage_summary"],
        ("slice", "key", "showtimes", "auditorium_showtimes", "layout_id_showtimes", "adult_price_showtimes", "premium_format_showtimes", "is_sold_out_true", "is_almost_sold_out_true", "auditorium_share", "adult_price_share"),
    )
    mapping_fields = (
        "theater",
        "auditorium_number",
        "layout_id",
        "layout_versions",
        "first_seen",
        "last_seen",
        "number_of_showtimes",
        "number_of_distinct_films",
        "premium_formats_seen",
        "median_adult_price",
        "layout_auditorium_count",
        "mapping_stability",
    )
    _write_csv(out_dir / "auditorium_layout_mapping.csv", result["mapping"], mapping_fields)
    _write_csv(
        out_dir / "auditorium_hierarchy.csv",
        result["hierarchy"],
        ("as_of", "theater", "auditorium_number", "commitment_score", "tier", "showtimes_before_as_of", "premium_share", "opening_week_share", "wide_opening_share", "prime_share", "friday_saturday_evening_share", "median_adult_price"),
    )
    _write_csv(out_dir / "auditorium_features.csv", result["observations"], FEATURE_FIELDS)
    _write_csv(out_dir / "auditorium_feature_results.csv", result["results"], ("model", "mode", *METRIC_KEYS))
    _write_csv(out_dir / "auditorium_error_examples.csv", result["examples"], ERROR_FIELDS)
    summary = {key: value for key, value in result.items() if key not in {"observations", "examples", "mapping", "hierarchy", "coverage_summary", "log_coverage"}}
    summary["recommendation"] = _recommendation(result)
    (out_dir / "summary.json").write_text(json.dumps(summary, indent=2, default=str), encoding="utf-8")
    (out_dir / "index.html").write_text(render_html(result), encoding="utf-8")
