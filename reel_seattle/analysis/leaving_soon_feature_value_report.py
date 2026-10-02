"""Charts and the review page for the point-in-time feature audit."""

from __future__ import annotations

import csv
import html
import json
from pathlib import Path
from typing import Any, Mapping, Sequence

from reel_seattle.analysis.leaving_soon_feature_value import feature_dictionary_rows


def _pct(value: Any) -> str:
    if not isinstance(value, float):
        return "n/a"
    return f"{value * 100:.1f}%"


def _num(value: Any) -> str:
    if isinstance(value, float):
        return f"{value:.3f}"
    if value is None:
        return "n/a"
    return str(value)


def _write_csv(path: Path, rows: Sequence[Mapping[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not rows:
        path.write_text("", encoding="utf-8")
        return
    fields: list[str] = []
    seen: set[str] = set()
    for row in rows:
        for key in row:
            if key not in seen:
                seen.add(key)
                fields.append(key)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow({key: "" if row.get(key) is None else row.get(key) for key in fields})


def _metric_cell(block: Mapping[str, Any]) -> str:
    if not block or block.get("n") in (0, None):
        return "n/a"
    return (
        f"{_pct(block.get('precision'))} precision, {_pct(block.get('recall'))} recall, "
        f"F1 {_num(block.get('f1'))}, PR-AUC {_num(block.get('pr_auc'))}, n={block.get('n')}"
    )


def _evidence(delta: float | None) -> str:
    if delta is None:
        return "no measurable gain"
    if delta >= 0.03:
        return "strong evidence"
    if delta >= 0.01:
        return "moderate evidence"
    if delta > 0:
        return "weak evidence"
    return "no measurable gain"


def render_charts(result: Mapping[str, Any], out_dir: Path) -> None:
    import matplotlib.pyplot as plt
    import numpy as np

    plt.rcParams.update({"figure.facecolor": "white", "axes.facecolor": "white", "axes.grid": True, "grid.alpha": 0.28, "font.size": 10, "figure.dpi": 120})

    def save(fig: Any, name: str) -> None:
        fig.tight_layout()
        fig.savefig(out_dir / name, bbox_inches="tight")
        plt.close(fig)

    names = [
        "existing",
        "existing_publication",
        "existing_contraction",
        "existing_market",
        "existing_segment",
        "existing_theater",
        "all_new",
    ]
    labels = ["Existing", "+ publication", "+ contraction", "+ market", "+ segment", "+ theater", "All new"]
    fig, ax = plt.subplots(figsize=(10.2, 5.4))
    x = np.arange(len(names))
    prauc = []
    prec50 = []
    for name in names:
        hold = (result["ablations"].get(name) or {}).get("holdout") or {}
        prauc.append((hold.get("pr_auc") or 0) * 100)
        prec50.append((hold.get("precision_at_recall_50") or 0) * 100)
    ax.bar(x - 0.18, prauc, width=0.36, color="#1f4e79", label="PR-AUC")
    ax.bar(x + 0.18, prec50, width=0.36, color="#c47b2b", label="Precision at 50% recall")
    ax.set_xticks(x, labels, rotation=20, ha="right")
    ax.set_ylim(0, 105)
    ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda value, _pos: f"{value:.0f}%"))
    ax.legend(frameon=False)
    ax.set_title("Holdout feature-family ablation\nOne row per engagement. Model chosen on validation.", loc="left", color="#243040")
    save(fig, "feature_family_ablation.png")

    # Heatmap
    heat_rows = result["publication_rows"]
    segments = ["ordinary", "rerelease", "special_event"]
    weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday"]
    buckets = ["lt_50", "50_80", "80_95", "ge_95"]
    fig, axes = plt.subplots(1, 3, figsize=(12.2, 4.6), sharey=True)
    for ax, segment in zip(axes, segments):
        grid = np.full((len(weekdays), len(buckets)), np.nan)
        annot = [["" for _ in buckets] for _ in weekdays]
        for row in heat_rows:
            if row["segment"] != segment or row["weekday"] not in weekdays:
                continue
            i = weekdays.index(row["weekday"])
            j = buckets.index(row["completeness_bucket"])
            if row["leaves_within_7_rate"] is not None:
                grid[i, j] = row["leaves_within_7_rate"]
            annot[i][j] = f"{row['n']}"
        image = ax.imshow(grid, vmin=0, vmax=1, cmap="YlOrRd", aspect="auto")
        ax.set_xticks(range(len(buckets)), ["<50%", "50–80%", "80–95%", "≥95%"], fontsize=8)
        ax.set_yticks(range(len(weekdays)), [day[:3] for day in weekdays])
        ax.set_title(segment.replace("_", " "), fontsize=10)
        for i in range(len(weekdays)):
            for j in range(len(buckets)):
                if annot[i][j]:
                    ax.text(j, i, annot[i][j], ha="center", va="center", fontsize=7, color="#243040")
    fig.colorbar(image, ax=axes, fraction=0.03, pad=0.02, label="P(leaves within 7 days)")
    fig.suptitle("Film absent from Friday: departure rate by weekday and theater Friday completeness", fontsize=11, color="#243040")
    fig.savefig(out_dir / "publication_absence_precision_heatmap.png", bbox_inches="tight")
    plt.close(fig)

    fig, ax = plt.subplots(figsize=(8.4, 4.8))
    for segment, color in (("ordinary", "#1f4e79"), ("rerelease", "#c47b2b"), ("special_event", "#2f6f4e")):
        xs, ys = [], []
        for index, day in enumerate(weekdays):
            chosen = [
                row["leaves_within_7_rate"]
                for row in heat_rows
                if row["segment"] == segment and row["weekday"] == day and row["completeness_bucket"] == "ge_95" and row["leaves_within_7_rate"] is not None
            ]
            xs.append(index)
            ys.append((chosen[0] * 100) if chosen else 0)
        ax.plot(xs, ys, marker="o", color=color, label=segment.replace("_", " "))
    ax.set_xticks(range(len(weekdays)), [day[:3] for day in weekdays])
    ax.set_ylim(0, 105)
    ax.set_ylabel("P(leaves within 7 days | absent, Friday ≥95%)")
    ax.legend(frameon=False)
    ax.set_title("Friday absence once the theater Friday listing looks full", loc="left", color="#243040")
    save(fig, "publication_absence_by_weekday.png")

    fig, ax = plt.subplots(figsize=(8.2, 4.6))
    slices = result["contraction_rows"]
    ax.bar(range(len(slices)), [(row["leaves_within_7_rate"] or 0) * 100 for row in slices], color="#1f4e79")
    ax.set_xticks(range(len(slices)), [row["slice"].replace("_", "\n") for row in slices], fontsize=8)
    for index, row in enumerate(slices):
        ax.text(index, (row["leaves_within_7_rate"] or 0) * 100 + 1.5, f"n={row['n']}", ha="center", fontsize=8)
    ax.set_ylim(0, 110)
    ax.set_ylabel("P(leaves within 7 days)")
    ax.set_title("Holdout departure rate by point-in-time contraction slice", loc="left", color="#243040")
    save(fig, "contraction_signal_lift.png")

    fig, ax = plt.subplots(figsize=(8.0, 4.6))
    market = result["market_signal_rows"]
    ax.bar(range(len(market)), [(row["leaves_within_7_rate"] or 0) * 100 for row in market], color="#8c3a3a")
    ax.set_xticks(range(len(market)), [row["slice"].replace("_", "\n") for row in market], fontsize=8)
    for index, row in enumerate(market):
        ax.text(index, (row["leaves_within_7_rate"] or 0) * 100 + 1.5, f"n={row['n']}", ha="center", fontsize=8)
    ax.set_ylim(0, 110)
    ax.set_ylabel("P(leaves within 7 days)")
    ax.set_title("Holdout departure rate by 7-day change in market theater count", loc="left", color="#243040")
    save(fig, "market_theater_count_signal.png")

    fig, ax = plt.subplots(figsize=(10.4, 5.2))
    theaters = []
    for row in result["theater_weekday_rows"]:
        if row["theater"] not in theaters:
            theaters.append(row["theater"])
    x = np.arange(len(theaters))
    width = 0.25
    for offset, slice_name, color in ((-width, "known_last_wednesday", "#1f4e79"), (0, "known_last_thursday", "#c47b2b"), (width, "known_last_other", "#98a2b3")):
        heights = []
        for theater in theaters:
            match = next((row for row in result["theater_weekday_rows"] if row["theater"] == theater and row["slice"] == slice_name), None)
            heights.append(((match or {}).get("leaves_within_7_rate") or 0) * 100)
        ax.bar(x + offset, heights, width=width * 0.9, color=color, label=slice_name.replace("known_last_", ""))
    ax.set_xticks(x, [name.replace("AMC ", "") for name in theaters], rotation=20, ha="right")
    ax.set_ylim(0, 110)
    ax.legend(frameon=False, fontsize=8)
    ax.set_ylabel("P(leaves within 7 days)")
    ax.set_title("Holdout departure rate by theater and the currently known last weekday", loc="left", color="#243040")
    save(fig, "weekday_prior_by_theater.png")

    fig, ax = plt.subplots(figsize=(8.6, 4.8))
    separate = result["segment_models"]["separate"]
    keys = ["ordinary", "rerelease", "special", "special_known_last_rule"]
    pretty = ["Ordinary model", "Rerelease model", "Specials model", "Specials: last date < 7"]
    vals = []
    for key in keys:
        block = separate.get(key) or {}
        hold = block.get("holdout") or block
        vals.append((hold.get("pr_auc") or hold.get("precision") or 0) * 100)
    ax.bar(range(len(keys)), vals, color=["#1f4e79", "#c47b2b", "#2f6f4e", "#8c3a3a"])
    ax.set_xticks(range(len(keys)), pretty, rotation=15, ha="right")
    ax.set_ylim(0, 105)
    ax.set_ylabel("Holdout PR-AUC, or precision for the rule")
    ax.set_title("Separate segment models versus a last-date rule for specials", loc="left", color="#243040")
    save(fig, "segment_model_comparison.png")

    fig, ax = plt.subplots(figsize=(9.2, 4.8))
    stability = [row for row in result["stability_rows"] if row["slice"] in {"stable_3_and_last_within_7", "moved_within_2_snapshots_and_last_within_7", "last_within_7"}]
    segments = ["ordinary", "rerelease", "special_event"]
    slice_names = ["last_within_7", "stable_3_and_last_within_7", "moved_within_2_snapshots_and_last_within_7"]
    x = np.arange(len(segments))
    for offset, slice_name, color in ((-0.25, slice_names[0], "#98a2b3"), (0, slice_names[1], "#1f4e79"), (0.25, slice_names[2], "#c47b2b")):
        heights = []
        for segment in segments:
            match = next((row for row in stability if row["segment"] == segment and row["slice"] == slice_name), None)
            heights.append(((match or {}).get("leaves_within_7_rate") or 0) * 100)
        ax.bar(x + offset, heights, width=0.24, color=color, label=slice_name.replace("_", " "))
    ax.set_xticks(x, ["ordinary", "rerelease", "special"])
    ax.set_ylim(0, 110)
    ax.legend(frameon=False, fontsize=7)
    ax.set_ylabel("P(leaves within 7 days)")
    ax.set_title("Known-final-date stability, among rows whose listed end is inside 7 days", loc="left", color="#243040")
    save(fig, "known_final_date_stability.png")

    payload = result.get("holdout_for_charts") or {}
    y = np.array(payload.get("y") or [])
    best_scores = np.array(payload.get("best_scores") or [])
    production = np.array(payload.get("production_scores") or [])
    fig, ax = plt.subplots(figsize=(7.4, 5.2))
    for scores, label, color in ((best_scores, result.get("best_model", "candidate"), "#1f4e79"), (production, "production p7", "#c47b2b")):
        if y.size == 0 or scores.size != y.size or y.sum() == 0:
            continue
        order = np.argsort(-scores)
        tp = 0
        curve_r, curve_p = [0.0], [1.0]
        total = y.sum()
        for seen, idx in enumerate(order, start=1):
            tp += int(y[idx] == 1)
            curve_r.append(tp / total)
            curve_p.append(tp / seen)
        ax.plot(curve_r, curve_p, color=color, label=label)
    ax.set_xlabel("Recall")
    ax.set_ylabel("Precision")
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1.05)
    ax.legend(frameon=False)
    ax.set_title("Holdout precision-recall", loc="left", color="#243040")
    save(fig, "precision_recall_comparison.png")

    fig, ax = plt.subplots(figsize=(7.2, 5.0))
    for scores, label, color in ((best_scores, result.get("best_model", "candidate"), "#1f4e79"), (production, "production p7", "#c47b2b")):
        if y.size == 0 or scores.size != y.size:
            continue
        bins = np.linspace(0, 1, 6)
        xs, ys = [], []
        for low, high in zip(bins[:-1], bins[1:]):
            mask = (scores >= low) & (scores < high if high < 1 else scores <= high)
            if mask.sum() < 5:
                continue
            xs.append(float(scores[mask].mean()))
            ys.append(float(y[mask].mean()))
        ax.plot(xs, ys, marker="o", color=color, label=label)
    ax.plot([0, 1], [0, 1], color="#98a2b3", linestyle="--", label="calibrated")
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.set_xlabel("Mean predicted probability")
    ax.set_ylabel("Observed departure rate")
    ax.legend(frameon=False)
    ax.set_title("Holdout calibration", loc="left", color="#243040")
    save(fig, "calibration_comparison.png")


def _jsonable(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): _jsonable(item) for key, item in value.items() if key not in {"holdout_rows", "holdout_scores", "holdout_for_charts"}}
    if isinstance(value, (list, tuple)):
        return [_jsonable(item) for item in value]
    if isinstance(value, float):
        if value != value or value in (float("inf"), float("-inf")):
            return None
        return value
    if hasattr(value, "item"):
        try:
            return value.item()
        except Exception:
            return str(value)
    return value


def render_html(result: Mapping[str, Any], out_dir: Path) -> None:
    base = (result["ablations"].get("existing") or {}).get("holdout") or {}
    base_auc = base.get("pr_auc")
    rows = []
    for name, block in result["ablations"].items():
        hold = block.get("holdout") or {}
        delta = None
        if isinstance(hold.get("pr_auc"), float) and isinstance(base_auc, float):
            delta = hold["pr_auc"] - base_auc
        rows.append(
            f"<tr><td>{html.escape(name)}</td><td>{_metric_cell(hold)}</td><td>{_num(delta)}</td><td>{_evidence(delta if name != 'existing' else 0.0)}</td></tr>"
        )
    publication = result["publication_rows"]
    def rate(segment: str, bucket: str) -> str:
        chosen = [row for row in publication if row["segment"] == segment and row["completeness_bucket"] == bucket and row["weekday"] in {"Wednesday", "Thursday"}]
        n = sum(row["n"] for row in chosen)
        hits = sum((row["leaves_within_7_rate"] or 0) * row["n"] for row in chosen if row["leaves_within_7_rate"] is not None)
        if not n:
            return "n=0"
        return f"{hits / n * 100:.1f}% (n={n}, Wed–Thu pooled)"
    images = [
        "feature_family_ablation.png",
        "precision_recall_comparison.png",
        "calibration_comparison.png",
        "publication_absence_precision_heatmap.png",
        "publication_absence_by_weekday.png",
        "contraction_signal_lift.png",
        "market_theater_count_signal.png",
        "weekday_prior_by_theater.png",
        "segment_model_comparison.png",
        "known_final_date_stability.png",
    ]
    figures = "".join(f'<figure><img src="{name}" alt="{name}"><figcaption>{name}</figcaption></figure>' for name in images)
    baselines = result["baselines"]
    baseline_rows = "".join(
        f"<tr><td>{html.escape(name)}</td><td>{_metric_cell(block)}</td></tr>" for name, block in baselines.items()
    )
    counts = result["counts"]
    page = f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Leaving Soon point-in-time feature value</title>
<style>
body {{ font-family: Georgia, serif; margin: 2rem auto; max-width: 980px; color: #243040; line-height: 1.45; }}
img {{ max-width: 100%; height: auto; }}
table {{ border-collapse: collapse; width: 100%; margin: 1rem 0; }}
th, td {{ border-bottom: 1px solid #d9e0ea; text-align: left; padding: 0.35rem 0.4rem; vertical-align: top; font-size: 0.92rem; }}
code {{ font-family: ui-monospace, monospace; font-size: 0.9em; }}
</style></head><body>
<h1>Leaving Soon point-in-time feature value</h1>
<p>Train through {html.escape(result['train_end'])}. Validation {html.escape(result['train_end'])} through {html.escape(result['validation_end'])}. Holdout is every later snapshot, one row per film×theater engagement. As-of {html.escape(result['as_of'])}. A positive 7-day label means the confirmed end is fewer than 7 days away, matching the production survival horizon.</p>
<h2>1. What does the current model do?</h2>
<p>Production scores a film's market-wide run with the frozen discrete-time hazard model. On this film×theater holdout, that probability is a baseline, not a retrained model. {_metric_cell(baselines.get('production') or {})}.</p>
<h2>2. Which feature families add value?</h2>
<p>Each row is a logistic regression trained on dates through the train cutoff. The threshold is chosen on validation for precision of at least 75% when that is attainable, otherwise for F1. The evidence label is the holdout PR-AUC change versus the existing-feature model.</p>
<table><thead><tr><th>Model</th><th>Holdout</th><th>PR-AUC minus existing</th><th>Evidence</th></tr></thead><tbody>{''.join(rows)}</tbody></table>
<h2>3. Does publication-cycle awareness help?</h2>
<p>Friday completeness is listed Friday showtimes divided by that theater's median Friday volume on dates already played. It does not use the eventual Friday total.</p>
<p>Ordinary, absent from Friday, Wednesday–Thursday, completeness under 80%: {rate('ordinary', 'lt_50')} and {rate('ordinary', '50_80')}. Completeness at least 95%: {rate('ordinary', 'ge_95')}.</p>
<p>Rerelease, same Wednesday–Thursday cut: under 50% {rate('rerelease', 'lt_50')}; at least 95% {rate('rerelease', 'ge_95')}. Specials: under 50% {rate('special_event', 'lt_50')}; at least 95% {rate('special_event', 'ge_95')}.</p>
<h2>4. Does contraction help?</h2>
<p>The contraction chart is the holdout departure rate when the next 7 listed showtimes are sparse, when the played schedule has fallen at least halfway from its peak, and when both are true.</p>
<h2>5. Does market-level decline help?</h2>
<p>The market chart splits the same holdout by how many theaters the film lost or gained over about 7 days, using only earlier snapshots.</p>
<h2>6. Are rereleases and specials better handled separately?</h2>
<p>Shared all-feature model: {_metric_cell((result['segment_models']['shared_all_features'].get('holdout') or {}))}.</p>
<p>Separate ordinary: {_metric_cell(((result['segment_models']['separate'].get('ordinary') or {}).get('holdout') or {}))}. Separate rerelease: {_metric_cell(((result['segment_models']['separate'].get('rerelease') or {}).get('holdout') or {}))}. Separate specials: {_metric_cell(((result['segment_models']['separate'].get('special') or {}).get('holdout') or {}))}. Specials last-date rule: {_metric_cell(result['segment_models']['separate'].get('special_known_last_rule') or {})}.</p>
<h2>7. Does Wednesday/Thursday structure help prediction?</h2>
<p>Known-last-date only: {_metric_cell(((result['calendar_models'].get('known_last_only') or {}).get('holdout') or {}))}. Plus weekday, Thursday/Wednesday flags, Friday absence, and Friday completeness: {_metric_cell(((result['calendar_models'].get('known_last_plus_calendar') or {}).get('holdout') or {}))}.</p>
<h2>8. Does known-final-date stability help?</h2>
<p>All segments, known last date only: {_metric_cell((((result['stability_models'].get('all') or {}).get('known_last_only') or {}).get('holdout') or {}))}. Plus stability: {_metric_cell((((result['stability_models'].get('all') or {}).get('plus_stability') or {}).get('holdout') or {}))}.</p>
<p>Rerelease known-last only: {_metric_cell((((result['stability_models'].get('rerelease') or {}).get('known_last_only') or {}).get('holdout') or {}))}. Rerelease plus stability: {_metric_cell((((result['stability_models'].get('rerelease') or {}).get('plus_stability') or {}).get('holdout') or {}))}.</p>
<h2>9. What kinds of errors remain?</h2>
<p>The false-positive and false-negative CSVs are the highest-scoring misses of the validation-selected model. Read them beside the production probability on the same row.</p>
<h2>10. Candidate production changes for review</h2>
<p>Nothing here is wired into scoring. The evidence column in the ablation table is the classification: strong, moderate, weak, or no measurable gain. A near-rule is worth a separate gate only when the high-completeness absence rate stays high on this holdout and the low-completeness rate does not.</p>
<h2>Baselines on the same holdout</h2>
<table><thead><tr><th>Baseline</th><th>Holdout</th></tr></thead><tbody>{baseline_rows}</tbody></table>
<p>Rows built {counts['rows_built']}. Labeled 7-day observations {counts['labeled_y7']['n']} ({counts['labeled_y7']['positives_y7']} positive). Holdout engagements {counts['holdout_one_per_engagement']['n']} ({counts['holdout_one_per_engagement']['positives_y7']} positive).</p>
{figures}
</body></html>"""
    (out_dir / "index.html").write_text(page, encoding="utf-8")


def write_outputs(result: dict[str, Any], out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    render_charts(result, out_dir)
    _write_csv(out_dir / "false_positive_examples.csv", result["examples"]["false_positives"])
    _write_csv(out_dir / "false_negative_examples.csv", result["examples"]["false_negatives"])
    _write_csv(out_dir / "true_positive_examples.csv", result["examples"]["true_positives"])
    _write_csv(out_dir / "borderline_examples.csv", result["examples"]["borderline"])
    _write_csv(out_dir / "feature_importance_or_coefficients.csv", result["coefficients"])
    _write_csv(out_dir / "point_in_time_feature_summary.csv", result["feature_summary"])
    _write_csv(out_dir / "feature_dictionary.csv", feature_dictionary_rows())
    _write_csv(out_dir / "publication_absence_rates.csv", result["publication_rows"])
    summary = {key: _jsonable(value) for key, value in result.items() if key not in {"holdout_for_charts", "examples"}}
    summary["examples_written"] = {name: len(rows) for name, rows in result["examples"].items()}
    (out_dir / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    render_html(result, out_dir)
