"""Charts, tables, and the review page for the extension-risk audit."""

from __future__ import annotations

import csv
import html
import json
import math
from pathlib import Path
from typing import Any, Mapping, Sequence

import numpy as np

from reel_seattle.analysis.leaving_soon_extension_risk import feature_dictionary

CHARTS = (
    "extension_rate_by_days_to_end.png",
    "extension_rate_by_segment.png",
    "extension_rate_by_theater.png",
    "extension_rate_by_theatrical_week.png",
    "extension_timing_relative_to_listed_end.png",
    "cross_theater_continuation_signal.png",
    "shared_market_end_signal.png",
    "final_day_screenings_extension_rate.png",
    "extension_model_precision_recall.png",
    "extension_model_calibration.png",
    "simulated_leaving_soon_comparison.png",
)

OBS_FIELDS = (
    "film_id",
    "title",
    "theater_name",
    "observation_date",
    "known_last_show_date",
    "days_to_known_last",
    "segment",
    "days_since_opening",
    "extended",
    "extension_first_observed",
    "extension_magnitude_days",
    "days_until_extension_visible",
    "extension_published_before_listed_end",
    "extension_published_on_listed_end",
    "extension_published_after_listed_end",
    "extension_timing_day",
    "later_final_date_moves",
    "in_population_a",
    "in_population_b",
    "in_population_c",
    "listed_end_weekday",
    "observation_weekday",
    "screenings_on_final_day",
    "screenings_final_2_days",
    "screenings_final_3_days",
    "snapshots_on_this_final",
    "days_on_this_final",
    "prior_extension_count",
    "distinct_final_dates",
    "moved_within_3_snapshots",
    "other_theaters_beyond_listed_end",
    "other_theaters_on_same_end",
    "share_other_theaters_on_same_end",
    "all_theaters_share_listed_end",
    "this_theater_is_earliest_exit",
    "this_theater_is_latest_exit",
    "solo_theater",
    "market_theater_count",
    "final_vs_recent_average",
    "production_p7",
    "y7",
)


def _pct(value: Any) -> str:
    if not isinstance(value, (int, float)) or isinstance(value, bool) or (isinstance(value, float) and math.isnan(value)):
        return "n/a"
    return f"{float(value) * 100:.1f}%"


def _num(value: Any, digits: int = 3) -> str:
    if not isinstance(value, (int, float)) or isinstance(value, bool) or (isinstance(value, float) and math.isnan(value)):
        return "n/a"
    if isinstance(value, float):
        return f"{value:.{digits}f}"
    return str(value)


def _cell(value: Any) -> Any:
    if value is None:
        return ""
    if isinstance(value, float) and math.isnan(value):
        return ""
    if isinstance(value, (np.floating, np.integer)):
        return value.item()
    return value


def _write_csv(path: Path, rows: Sequence[Mapping[str, Any]], fields: Sequence[str] | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not rows and not fields:
        path.write_text("", encoding="utf-8")
        return
    if fields is None:
        names: list[str] = []
        seen: set[str] = set()
        for row in rows:
            for key in row:
                if key not in seen and not isinstance(row.get(key), (dict, list)):
                    seen.add(key)
                    names.append(key)
        fields = names
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(fields), extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow({key: _cell(row.get(key)) for key in fields})


def _jsonable(value: Any) -> Any:
    if isinstance(value, dict):
        skip = {"observations", "change_points", "holdout_rows", "holdout_scores", "features"}
        return {str(key): _jsonable(item) for key, item in value.items() if key not in skip}
    if isinstance(value, (list, tuple)):
        return [_jsonable(item) for item in value]
    if isinstance(value, np.ndarray):
        return None
    if isinstance(value, (np.floating, float)):
        number = float(value)
        return None if math.isnan(number) else number
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.bool_,)):
        return bool(value)
    return value


def _find(rows: Sequence[Mapping[str, Any]], key: str, label: str) -> Mapping[str, Any]:
    for row in rows:
        if str(row.get(key)) == label:
            return row
    return {}


def _rate_bits(row: Mapping[str, Any]) -> str:
    if not row:
        return "n/a"
    return f"{_pct(row.get('extension_rate'))} ({row.get('extensions')}/{row.get('n')}, CI {_pct(row.get('ci_low'))}–{_pct(row.get('ci_high'))})"


def _table_html(rows: Sequence[Mapping[str, Any]], columns: Sequence[tuple[str, str]]) -> str:
    head = "".join(f"<th>{html.escape(label)}</th>" for _key, label in columns)
    body = []
    for row in rows:
        cells = []
        for key, _label in columns:
            value = row.get(key, "")
            if key.endswith("rate") or key.endswith("precision") or key.endswith("recall") or key in {"ci_low", "ci_high", "coverage", "false_trust_rate", "genuine_precision", "genuine_recall", "pr_auc", "brier", "f1"}:
                text = _pct(value) if "rate" in key or key in {"coverage", "false_trust_rate", "genuine_precision", "genuine_recall", "precision", "recall"} else _num(value)
            else:
                text = "" if value is None else str(value)
            cells.append(f"<td>{html.escape(text)}</td>")
        body.append("<tr>" + "".join(cells) + "</tr>")
    return f"<table><thead><tr>{head}</tr></thead><tbody>{''.join(body)}</tbody></table>"


def _label_gap(left: Mapping[str, Any], right: Mapping[str, Any], *, minimum: int = 30, strong: float = 0.15) -> str:
    if int(left.get("n") or 0) < minimum or int(right.get("n") or 0) < minimum:
        return "weak evidence"
    gap = abs(float(left.get("extension_rate") or 0) - float(right.get("extension_rate") or 0))
    if gap >= strong:
        return "strong evidence"
    if gap >= 0.08:
        return "moderate evidence"
    if gap >= 0.03:
        return "weak evidence"
    return "unsupported"


def _implications(result: Mapping[str, Any]) -> list[dict[str, str]]:
    descriptive = result["descriptive"]
    rules = result["rules_holdout"]
    always = rules.get("always_trust", {})
    logistic = result.get("logistic", {}).get("holdout", {})
    simulation = result.get("simulation", {})
    naive = simulation.get("naive_listed_end_within_7", {})
    hard = simulation.get("listed_end_and_low_extension_risk", {})
    soft = simulation.get("listed_end_times_genuine_probability", {})
    existing = simulation.get("existing_feature_logistic", {})
    days_base = result.get("baselines", {}).get("days_bucket_rate", {})
    specials = _find(descriptive["by_segment"], "segment", "special_event")
    beyond_none = _find(descriptive["by_other_theaters_beyond"], "other_theaters_beyond", "0")
    beyond_many = _find(descriptive["by_other_theaters_beyond"], "other_theaters_beyond", "2+")
    shared = _find(descriptive["by_shared_market_end"], "market_end_state", "shared")
    split = _find(descriptive["by_shared_market_end"], "market_end_state", "split")
    timing = [row for row in result.get("timing", []) if row.get("segment") == "all" and row.get("days_from_listed_end") == -2]
    published_by_d2 = timing[0].get("cumulative_share") if timing else None

    naive_recall = naive.get("recall")
    if isinstance(naive_recall, float) and naive_recall >= 0.90:
        signal = "strong evidence"
    elif isinstance(naive_recall, float) and naive_recall >= 0.70:
        signal = "moderate evidence"
    elif isinstance(naive_recall, float) and naive_recall >= 0.40:
        signal = "weak evidence"
    else:
        signal = "unsupported"

    tree_hold = result.get("tree", {}).get("holdout", {})
    trust_gap = None
    if isinstance(always.get("false_trust_rate"), float) and isinstance(logistic.get("false_trust_rate"), float):
        trust_gap = always["false_trust_rate"] - logistic["false_trust_rate"]
    tree_gap = None
    if isinstance(always.get("false_trust_rate"), float) and isinstance(tree_hold.get("false_trust_rate"), float):
        tree_gap = always["false_trust_rate"] - tree_hold["false_trust_rate"]
    naive_fp = naive.get("false_positives")
    hard_fp = hard.get("false_positives")
    fp_cut = (naive_fp - hard_fp) if isinstance(naive_fp, int) and isinstance(hard_fp, int) else None
    recall_kept = None
    if isinstance(naive.get("recall"), float) and naive["recall"] and isinstance(hard.get("recall"), float):
        recall_kept = hard["recall"] / naive["recall"]
    if tree_gap is not None and tree_gap >= 0.10 and (tree_hold.get("genuine_recall") or 0) >= 0.50 and (tree_hold.get("false_trust_rate") or 1) <= 0.20:
        discount = "strong evidence"
    elif trust_gap is not None and trust_gap >= 0.10 and (logistic.get("genuine_recall") or 0) >= 0.50:
        discount = "strong evidence"
    elif (fp_cut or 0) >= 15 and (recall_kept or 0) >= 0.70:
        discount = "moderate evidence"
    elif (trust_gap or 0) >= 0.05 or (tree_gap or 0) >= 0.05 or (fp_cut or 0) >= 8:
        discount = "moderate evidence"
    elif (trust_gap or 0) > 0 or (fp_cut or 0) > 0:
        discount = "weak evidence"
    else:
        discount = "unsupported"

    cross = _label_gap(beyond_none, beyond_many)
    shared_label = _label_gap(shared, split)
    if isinstance(published_by_d2, float) and published_by_d2 >= 0.60 and cross == "strong evidence":
        converge = "strong evidence"
    elif cross in {"strong evidence", "moderate evidence"} or shared_label in {"strong evidence", "moderate evidence"} or (isinstance(published_by_d2, float) and published_by_d2 >= 0.50):
        converge = "moderate evidence"
    elif cross == "weak evidence" or shared_label == "weak evidence":
        converge = "weak evidence"
    else:
        converge = "unsupported"

    special_rate = specials.get("extension_rate")
    special_n = int(specials.get("n") or 0)
    if isinstance(special_rate, float) and special_rate <= 0.10 and special_n >= 30:
        special_label = "strong evidence"
    elif isinstance(special_rate, float) and special_rate <= 0.25 and special_n >= 30:
        special_label = "moderate evidence"
    elif isinstance(special_rate, float) and special_n >= 30:
        ordinary = _find(descriptive["by_segment"], "segment", "ordinary")
        if isinstance(ordinary.get("extension_rate"), float) and ordinary["extension_rate"] - special_rate >= 0.15:
            special_label = "weak evidence"
        else:
            special_label = "unsupported"
    else:
        special_label = "weak evidence"

    model_ap = logistic.get("pr_auc")
    base_ap = days_base.get("pr_auc")
    ap_gain = (model_ap - base_ap) if isinstance(model_ap, float) and isinstance(base_ap, float) else None
    existing_p50 = existing.get("precision_at_recall_50")
    soft_p50 = soft.get("precision_at_recall_50")
    soft_better = isinstance(soft_p50, float) and isinstance(existing_p50, float) and soft_p50 > existing_p50 + 0.02
    if soft_better and (fp_cut or 0) >= 10:
        focus = "strong evidence"
    elif (ap_gain or 0) >= 0.03 or (fp_cut or 0) >= 8:
        focus = "moderate evidence"
    elif (ap_gain or 0) > 0 or (fp_cut or 0) > 0:
        focus = "weak evidence"
    else:
        focus = "unsupported"

    return [
        {
            "id": "A",
            "claim": "Use the listed final date as the primary Leaving Soon signal.",
            "label": signal,
            "why": f"On the leave-within-7 holdout, trusting a listed end inside 7 days recalls {_pct(naive.get('recall'))} of actual departures (precision {_pct(naive.get('precision'))}, {naive.get('false_positives', 'n/a')} false positives).",
        },
        {
            "id": "B",
            "claim": "Discount confidence when extension risk is high.",
            "label": discount,
            "why": (
                f"On holdout population A the shallow tree's false-trust rate is {_pct(tree_hold.get('false_trust_rate'))}, "
                f"against {_pct(always.get('false_trust_rate'))} if every near-term end is trusted, "
                f"while still covering {_pct(tree_hold.get('genuine_recall'))} of genuine endings. "
                f"The logistic threshold does not travel as cleanly: its holdout false-trust rate is {_pct(logistic.get('false_trust_rate'))}. "
                f"The hard simulation changes naive false positives from {naive.get('false_positives', 'n/a')} to {hard.get('false_positives', 'n/a')}."
            ),
        },
        {
            "id": "C",
            "claim": "Trust a near-term listed end more when other AMC theaters end with it, the market shares one date, and no extension has appeared as that date approaches.",
            "label": converge,
            "why": (
                f"Other theaters already past this date: 0 theaters {_rate_bits(beyond_none)}; 2+ theaters {_rate_bits(beyond_many)}. "
                f"Shared market end {_rate_bits(shared)}; split market {_rate_bits(split)}. "
                f"Share of extensions already published by D-2: {_pct(published_by_d2)}."
            ),
        },
        {
            "id": "D",
            "claim": "Use deterministic logic for specials.",
            "label": special_label,
            "why": f"Special-event extension rate in population A is {_rate_bits(specials)}.",
        },
        {
            "id": "E",
            "claim": "Stop trying to infer Leaving Soon from broad contraction and focus modeling effort on extension risk.",
            "label": focus,
            "why": f"Extension-model PR-AUC is {_num(model_ap)} against a days-to-end base-rate PR-AUC of {_num(base_ap)}. Simulated precision at 50% recall is {_num(soft.get('precision_at_recall_50'))} for listed-end times genuine probability and {_num(existing.get('precision_at_recall_50'))} for the existing-feature logistic. Ranking extensions is a real gain over a days-to-end rate. It does not beat that existing leave-within-7 logistic.",
        },
    ]


def render_charts(result: Mapping[str, Any], out_dir: Path) -> None:
    import matplotlib.pyplot as plt
    from sklearn.metrics import precision_recall_curve

    plt.rcParams.update({"figure.facecolor": "white", "axes.facecolor": "white", "axes.grid": True, "grid.alpha": 0.28, "font.size": 10, "figure.dpi": 120})

    def save(fig: Any, name: str) -> None:
        fig.tight_layout()
        fig.savefig(out_dir / name, bbox_inches="tight")
        plt.close(fig)

    def bars(rows: Sequence[Mapping[str, Any]], key: str, order: Sequence[str], title: str, name: str, color: str) -> None:
        chosen = [_find(rows, key, label) for label in order]
        chosen = [row for row in chosen if row]
        if not chosen:
            chosen = list(rows)
        labels = [str(row.get(key)) for row in chosen]
        rates = [float(row.get("extension_rate") or 0) * 100 for row in chosen]
        low = [max(0.0, (float(row.get("extension_rate") or 0) - float(row.get("ci_low") or 0)) * 100) for row in chosen]
        high = [max(0.0, (float(row.get("ci_high") or 0) - float(row.get("extension_rate") or 0)) * 100) for row in chosen]
        fig, ax = plt.subplots(figsize=(8.2, 4.4))
        positions = np.arange(len(labels))
        ax.bar(positions, rates, color=color, yerr=np.vstack([low, high]), capsize=3)
        ax.set_xticks(positions, labels, rotation=25, ha="right")
        ax.set_ylabel("Later extended (%)")
        ax.set_title(title)
        for index, row in enumerate(chosen):
            ax.text(index, rates[index] + high[index] + 1.2, f"n={row.get('n')}", ha="center", va="bottom", fontsize=8)
        ax.set_ylim(0, max(rates + [10]) + 18)
        save(fig, name)

    descriptive = result["descriptive"]
    horizon_days = result.get("descriptive_current_horizon") or descriptive["by_days"]
    bars(horizon_days, "days_to_known_last", ("1", "2", "3", "4-5", "6-7"), "Extension rate when the listing still says the end is this close", "extension_rate_by_days_to_end.png", "#1f4e79")
    bars(descriptive["by_segment"], "segment", ("ordinary", "rerelease", "special_event"), "Extension rate by segment", "extension_rate_by_segment.png", "#0f6e56")
    theater_rows = sorted(descriptive["by_theater"], key=lambda row: str(row.get("theater")))
    bars(theater_rows, "theater", [str(row.get("theater")) for row in theater_rows], "Extension rate by theater", "extension_rate_by_theater.png", "#8a4b08")
    bars(descriptive["by_week"], "theatrical_week", ("pre-opening", "week 1", "week 2", "week 3+"), "Extension rate by theatrical week", "extension_rate_by_theatrical_week.png", "#5c3d8a")
    bars(descriptive["by_other_theaters_beyond"], "other_theaters_beyond", ("0", "1", "2+"), "Extension rate when other AMC theaters already list a later end", "cross_theater_continuation_signal.png", "#9b2335")
    bars(descriptive["by_shared_market_end"], "market_end_state", ("shared", "split", "solo"), "Extension rate when the market shares one final date", "shared_market_end_signal.png", "#1d4e89")
    bars(descriptive["by_final_day_screenings"], "final_day_screenings", ("0-1", "2-3", "4+"), "Extension rate by showtimes on the listed final day", "final_day_screenings_extension_rate.png", "#3d5a40")

    observations = [row for row in result.get("observations", []) if row.get("extended") == 1 and row.get("extension_timing_day") != ""]
    fig, ax = plt.subplots(figsize=(8.6, 4.6))
    bins = list(range(-7, 2))
    labels = ["D-7 or earlier", "D-6", "D-5", "D-4", "D-3", "D-2", "D-1", "D", "D+1 or later"]
    width = 0.38
    for offset, segment, color in ((-width / 2, "ordinary", "#1f4e79"), (width / 2, "rerelease", "#c47b2b")):
        counts = []
        chosen = [row for row in observations if row.get("segment") == segment]
        for day in bins:
            if day == -7:
                counts.append(sum(1 for row in chosen if int(row["extension_timing_day"]) <= -7))
            elif day == 1:
                counts.append(sum(1 for row in chosen if int(row["extension_timing_day"]) >= 1))
            else:
                counts.append(sum(1 for row in chosen if int(row["extension_timing_day"]) == day))
        ax.bar(np.arange(len(bins)) + offset, counts, width=width, label=f"{segment} (n={len(chosen)})", color=color)
    all_days = sorted(int(row["extension_timing_day"]) for row in observations)
    cumulative = []
    if all_days:
        running = 0
        total = len(all_days)
        for day in bins:
            if day == -7:
                running = sum(1 for value in all_days if value <= -7)
            elif day == 1:
                running = total
            else:
                running = sum(1 for value in all_days if value <= day)
            cumulative.append(100.0 * running / total)
    ax2 = ax.twinx()
    if cumulative:
        ax2.plot(np.arange(len(bins)), cumulative, color="#222", marker="o", label="All segments, cumulative %")
    ax2.set_ylabel("Cumulative share of extensions (%)")
    ax2.set_ylim(0, 105)
    ax.set_xticks(np.arange(len(bins)), labels, rotation=30, ha="right")
    ax.set_ylabel("Extensions first published")
    ax.set_title("When the extra showtime first appears, relative to the listed end")
    ax.legend(loc="upper left")
    save(fig, "extension_timing_relative_to_listed_end.png")

    holdout_rows = list(result.get("holdout_rows") or [])
    scores = np.asarray(result.get("holdout_scores") if result.get("holdout_scores") is not None else [], dtype=float)
    y = np.array([int(row["extended"]) for row in holdout_rows]) if holdout_rows else np.array([])
    fig, ax = plt.subplots(figsize=(7.2, 4.6))
    if y.size and len(set(y.tolist())) > 1 and scores.size == y.size:
        precision, recall, _thresholds = precision_recall_curve(y, scores)
        ax.plot(recall, precision, color="#1f4e79", label="Logistic extension model")
        base = float(y.mean())
        ax.axhline(base, color="#888", linestyle="--", label=f"Holdout extension rate {base * 100:.0f}%")
    ax.set_xlabel("Recall of extensions")
    ax.set_ylabel("Precision for extensions")
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1.05)
    ax.set_title("Holdout precision and recall for predicting an extension")
    ax.legend(loc="best")
    save(fig, "extension_model_precision_recall.png")

    fig, ax = plt.subplots(figsize=(7.2, 4.6))
    if y.size and scores.size == y.size:
        order = np.argsort(scores)
        chunks = np.array_split(order, 5)
        pred, obs, ns = [], [], []
        for chunk in chunks:
            if len(chunk) == 0:
                continue
            pred.append(float(scores[chunk].mean()))
            obs.append(float(y[chunk].mean()))
            ns.append(len(chunk))
        ax.plot([0, 1], [0, 1], color="#bbb", linestyle="--")
        ax.scatter(pred, obs, s=[max(40, n) for n in ns], color="#9b2335")
        for px, ox, n in zip(pred, obs, ns):
            ax.text(px, ox + 0.03, f"n={n}", ha="center", fontsize=8)
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1.08)
    ax.set_xlabel("Predicted extension probability")
    ax.set_ylabel("Observed extension rate")
    ax.set_title("Holdout calibration of the extension model")
    save(fig, "extension_model_calibration.png")

    sim = result.get("simulation", {})
    names = [
        ("production", "Production"),
        ("naive_listed_end_within_7", "Listed end"),
        ("existing_feature_logistic", "Existing logistic"),
        ("listed_end_times_genuine_probability", "End x genuine"),
        ("listed_end_and_low_extension_risk", "End and low risk"),
    ]
    fig, ax = plt.subplots(figsize=(8.8, 4.6))
    metrics = ["precision", "recall", "pr_auc"]
    metric_labels = ["Precision", "Recall", "PR-AUC"]
    x = np.arange(len(names))
    width = 0.24
    for index, (metric, label) in enumerate(zip(metrics, metric_labels)):
        values = [float(sim.get(key, {}).get(metric) or 0) for key, _label in names]
        ax.bar(x + (index - 1) * width, values, width=width, label=label)
    ax.set_xticks(x, [label for _key, label in names], rotation=15, ha="right")
    ax.set_ylim(0, 1.08)
    ax.set_title("Simulated leave-within-7 scores on the feature-audit holdout")
    ax.legend(loc="upper right")
    save(fig, "simulated_leaving_soon_comparison.png")


def render_html(result: Mapping[str, Any], out_dir: Path) -> None:
    descriptive = result["descriptive"]
    counts = result["counts"]
    implications = _implications(result)
    rules = result["rules_holdout"]
    rule_rows = [{"rule": name, **values} for name, values in rules.items()]
    logistic = result.get("logistic", {})
    coefficients = logistic.get("coefficients", [])[:12]
    spotlight = result.get("spotlight", [])
    errors = result.get("errors", {})
    sim = result.get("simulation", {})
    sim_rows = []
    for key, label in (
        ("production", "Production Leaving Soon"),
        ("naive_listed_end_within_7", "Naive listed end within 7 days"),
        ("existing_feature_logistic", "Existing-feature logistic"),
        ("listed_end_times_genuine_probability", "Listed end x P(genuine)"),
        ("listed_end_and_low_extension_risk", "Listed end and low extension risk"),
    ):
        block = dict(sim.get(key, {}))
        block["approach"] = label
        sim_rows.append(block)
    model_rows = []
    for name, block in (
        ("Logistic regression", logistic.get("holdout", {})),
        ("Shallow tree", result.get("tree", {}).get("holdout", {})),
        ("Gradient boosting", result.get("boosted", {}).get("holdout", {})),
    ):
        packed = dict(block or {})
        packed["model"] = name
        if not packed.get("n"):
            packed["note"] = result.get("boosted", {}).get("reason", "") if "boost" in name.casefold() else ""
        model_rows.append(packed)
    for name, block in result.get("baselines", {}).items():
        packed = dict(block)
        packed["model"] = f"Baseline: {name}"
        model_rows.append(packed)

    def section(number: int, title: str, body: str) -> str:
        return f"<section id='s{number}'><h2>{number}. {html.escape(title)}</h2>{body}</section>"

    images = {
        "days": "extension_rate_by_days_to_end.png",
        "segment": "extension_rate_by_segment.png",
        "theater": "extension_rate_by_theater.png",
        "week": "extension_rate_by_theatrical_week.png",
        "timing": "extension_timing_relative_to_listed_end.png",
        "cross": "cross_theater_continuation_signal.png",
        "shared": "shared_market_end_signal.png",
        "final": "final_day_screenings_extension_rate.png",
        "pr": "extension_model_precision_recall.png",
        "cal": "extension_model_calibration.png",
        "sim": "simulated_leaving_soon_comparison.png",
    }

    def figure(key: str, caption: str) -> str:
        return f"<figure><img src='{images[key]}' alt='{html.escape(caption)}'><figcaption>{html.escape(caption)}</figcaption></figure>"

    rate_columns = (
        ("n", "N"),
        ("extensions", "Extensions"),
        ("extension_rate", "Rate"),
        ("ci_low", "CI low"),
        ("ci_high", "CI high"),
    )

    def rate_table(rows: Sequence[Mapping[str, Any]], label_key: str, label: str) -> str:
        return _table_html(rows, ((label_key, label),) + rate_columns)

    a = counts["population_a_within_7"]
    b = counts["population_b_within_3"]
    c = counts["population_c_change_points"]
    hold = counts["holdout"]
    examples = []
    for row in result.get("observations", []):
        if row.get("other_theaters_beyond_listed_end", 0) >= 2 and row.get("extended") == 1:
            examples.append(row)
        if len(examples) >= 6:
            break
    shared_examples = []
    for row in result.get("observations", []):
        if row.get("all_theaters_share_listed_end") == 1 and row.get("extended") == 0 and row.get("segment") == "ordinary":
            shared_examples.append(row)
        if len(shared_examples) >= 6:
            break

    def mini(rows: Sequence[Mapping[str, Any]]) -> str:
        show = [
            {
                "title": row.get("title"),
                "theater": row.get("theater_name"),
                "observed": row.get("observation_date"),
                "listed_end": row.get("known_last_show_date"),
                "extended": row.get("extended"),
                "others_beyond": row.get("other_theaters_beyond_listed_end"),
            }
            for row in rows
        ]
        return _table_html(show, (("title", "Title"), ("theater", "Theater"), ("observed", "Observed"), ("listed_end", "Listed end"), ("extended", "Extended"), ("others_beyond", "Others beyond")))

    def slice_bits(pred) -> str:
        chosen = [row for row in result.get("observations", []) if pred(row)]
        if not chosen:
            return "n/a"
        extensions = sum(int(row["extended"]) for row in chosen)
        return f"{extensions}/{len(chosen)} ({extensions / len(chosen):.1%})"

    def cumulative(segment: str, day: int) -> Any:
        for row in result.get("timing", []):
            if row.get("segment") == segment and row.get("days_from_listed_end") == day:
                return row.get("cumulative_share")
        return None

    tree_rules = html.escape(str(result.get("tree", {}).get("rules", "Tree was not fit.")))
    boosted_note = html.escape(str(result.get("boosted", {}).get("status", "")))
    if result.get("boosted", {}).get("reason"):
        boosted_note += ". " + html.escape(str(result["boosted"]["reason"]))

    parts = [
        "<!DOCTYPE html><html lang='en'><head><meta charset='utf-8'>",
        "<title>Leaving Soon extension risk</title>",
        "<style>",
        "body{font-family:Georgia,serif;max-width:980px;margin:2rem auto;padding:0 1.2rem;color:#1c1c1c;line-height:1.45}",
        "h1{font-size:1.8rem;line-height:1.2} h2{margin-top:2.2rem;font-size:1.25rem}",
        "table{border-collapse:collapse;width:100%;font-family:ui-sans-serif,sans-serif;font-size:0.86rem;margin:0.8rem 0 1.2rem}",
        "th,td{border-bottom:1px solid #ddd;text-align:left;padding:0.35rem 0.45rem;vertical-align:top}",
        "th{background:#f6f4ef} figure{margin:1rem 0 1.4rem} img{max-width:100%;height:auto;border:1px solid #eee}",
        "figcaption{font-family:ui-sans-serif,sans-serif;font-size:0.85rem;color:#444}",
        ".label{display:inline-block;padding:0.1rem 0.45rem;border-radius:999px;background:#efe6d6;font-family:ui-sans-serif,sans-serif;font-size:0.78rem}",
        "pre{white-space:pre-wrap;background:#f7f7f7;padding:0.8rem;font-size:0.78rem}",
        "</style></head><body>",
        "<h1>When a listed ending is inside 7 days, will AMC extend it?</h1>",
        f"<p>Observation window {html.escape(result['dataset_start'])} through {html.escape(result['as_of'])}. "
        f"Train through {html.escape(result['train_end'])}, validation through {html.escape(result['validation_end'])}, "
        "holdout after that. Descriptive rates use every confirmed population A engagement. "
        "Rules and models are scored on the holdout only. Nothing here changes the live Leaving Soon score.</p>",
        section(
            1,
            "What is the extension-risk problem?",
            "<p>The earlier feature audit found that the last show date on today's listing is the signal that actually moves a Leaving Soon prediction. "
            "This page asks a narrower question: once that date is already inside the next 7 days, which of those endings stay put, and which ones gain a later showtime?</p>"
            f"<p>An extension is a kept screening after the listed date D whose first snapshot is after the observation. "
            "A revival after a 14-day dark gap is a new engagement, not an extension of this date. "
            "A show added and then removed before it played does not count. "
            "If no later show has been published and the engagement end is not confirmed, the row is left unlabeled.</p>"
            f"<p>Population A, the first snapshot on which the listed end is within 7 days: "
            f"<strong>{a['n']}</strong> engagements, {a['extensions']} later extended ({_pct(a['extension_rate'])}). "
            f"Of those, ordinary films that had already opened: {counts.get('opened_ordinary_first_entry', {}).get('extensions', 'n/a')} of {counts.get('opened_ordinary_first_entry', {}).get('n', 'n/a')} "
            f"({_pct(counts.get('opened_ordinary_first_entry', {}).get('extension_rate'))}). "
            f"Population B, the first snapshot within 3 days: {b['n']} engagements, {b['extensions']} extended ({_pct(b['extension_rate'])}). "
            f"Population C, change points (entering the window, entering 3 days, or the listed date moving): {c['n']} rows, {c['extensions']} extended ({_pct(c['extension_rate'])}).</p>"
            f"<p>Model comparisons use population A. {html.escape(result['primary_reason'])} "
            f"Holdout: {hold['n']} engagements, {hold['extensions']} extensions ({_pct(hold['extension_rate'])}). "
            f"Train {counts['train']['n']} ({counts['train']['extensions']} extensions). "
            f"Validation {counts['validation']['n']} ({counts['validation']['extensions']} extensions).</p>",
        ),
        section(
            2,
            "How often are near-term listed ends extended?",
            figure("days", "Extension rate when the listing still says the end is this close")
            + "<p>The chart is the first day the current listing sits in each bucket, so a run can appear in more than one row. Wilson intervals are 95%. "
            "The last table is a different cut: how far out the date was the first time it entered the 7-day window.</p>"
            + rate_table(result.get("descriptive_current_horizon") or [], "days_to_known_last", "Days still listed")
            + "<h3>Ordinary films only, listing still this close</h3>"
            + rate_table(result.get("descriptive_ordinary_horizon") or [], "days_to_known_last", "Days still listed")
            + "<h3>Ordinary films that have already opened</h3>"
            + rate_table(result.get("descriptive_opened_ordinary_horizon") or [], "days_to_known_last", "Days still listed")
            + "<h3>First entry into the 7-day window</h3>"
            + rate_table(descriptive["by_days"], "days_to_known_last", "Days at first entry")
            + figure("segment", "Extension rate by segment")
            + rate_table(descriptive["by_segment"], "segment", "Segment")
            + figure("theater", "Extension rate by theater")
            + rate_table(descriptive["by_theater"], "theater", "Theater")
            + "<h3>Listed-end weekday</h3>"
            + rate_table(descriptive["by_listed_weekday"], "listed_end_weekday", "Listed end")
            + "<h3>Observation weekday</h3>"
            + rate_table(descriptive["by_observation_weekday"], "observation_weekday", "Observed on"),
        ),
        section(
            3,
            "Does extension risk change as the listed end gets closer?",
            "<p>Read the days chart as the operational curve: the listing still names an end this many days away, and the rate is how often that date later moves. "
            "A film can contribute to more than one bucket, once each, on the first day it sits in that bucket. "
            "The first-entry table answers a different question: how far out the date was the first time it entered the week.</p>"
            + figure("days", "Extension rate given the listing still ends this soon")
        ),
        section(
            4,
            "Does run maturity matter?",
            figure("week", "Extension rate by how far the run has progressed")
            + rate_table(descriptive["by_week"], "theatrical_week", "Week"),
        ),
        section(
            5,
            "Do other AMC theaters tell us whether one theater will extend?",
            "<p>The hypothesis: a theater-level ending is less trustworthy when other Seattle AMC locations already list this film past that date. "
            "The opposite claim: when every location currently ends on the same date, that shared ending is more often real.</p>"
            + figure("cross", "Extension rate by how many other theaters already continue past D")
            + rate_table(descriptive["by_other_theaters_beyond"], "other_theaters_beyond", "Other theaters beyond D")
            + figure("shared", "Extension rate by whether the market shares one final date")
            + rate_table(descriptive["by_shared_market_end"], "market_end_state", "Market state")
            + "<p>Those pooled rates mix specials, which rarely extend, with ordinary runs. "
            f"Ordinary films already open, and no other theater lists past this date: {slice_bits(lambda row: row.get('segment')=='ordinary' and float(row.get('days_since_opening') or 0)>=0 and float(row.get('other_theaters_beyond_listed_end') or 0)==0)}. "
            f"Ordinary films already open, and two or more theaters already continue: {slice_bits(lambda row: row.get('segment')=='ordinary' and float(row.get('days_since_opening') or 0)>=0 and float(row.get('other_theaters_beyond_listed_end') or 0)>=2)}. "
            "Once an ordinary film is open, other theaters continuing is a weaker distinction than the pooled chart suggests.</p>"
            + "<h3>Examples where other theaters already continued, and this theater was extended</h3>"
            + mini(examples)
            + "<h3>Examples where every listed theater shared the date, and this theater was not extended</h3>"
            + mini(shared_examples),
        ),
        section(
            6,
            "When do extensions usually get published?",
            f"<p>Day 0 is the listed final date D. A negative day means AMC published the extra showtime before that date arrived. "
            f"For ordinary films, {_pct(cumulative('ordinary', -2))} of extensions are already on the schedule by D-2, "
            f"{_pct(cumulative('ordinary', -1))} by D-1, and {_pct(cumulative('ordinary', 0))} by the end of D. "
            "The largest single day is D-1, and a further share land on D itself. Reaching D-1 with the date unchanged does not mean the extension has already been published.</p>"
            + figure("timing", "Publication timing of the extra showtime, ordinary versus rerelease"),
        ),
        section(
            7,
            "Which simple rules work?",
            "<p>Each rule below flags an ending as genuine. Precision is the share of flagged endings that really ended. "
            "False-trust is the share that were extended anyway. Coverage is the share of holdout population A the rule is willing to call genuine. "
            "A rule that flags only a handful of rows can look precise without being useful; the N column is the check.</p>"
            + _table_html(
                rule_rows,
                (
                    ("rule", "Rule"),
                    ("n_flagged", "Flagged"),
                    ("coverage", "Coverage"),
                    ("genuine_precision", "Genuine precision"),
                    ("genuine_recall", "Genuine recall"),
                    ("false_trust_rate", "False-trust"),
                ),
            )
            + "<p>Those rules are scored on holdout population A, the first snapshot inside 7 days. Most of those snapshots are still 6 or 7 days out, so a rule that requires 2 days left barely fires. "
            f"The same rules on the first holdout snapshot that is already within 2 days "
            f"(n={counts.get('within_2_holdout', {}).get('n', 'n/a')}, extensions {counts.get('within_2_holdout', {}).get('extensions', 'n/a')}) are below.</p>"
            + _table_html(
                [{"rule": name, **values} for name, values in result.get("rules_within_2_holdout", {}).items()],
                (
                    ("rule", "Rule at 2 days"),
                    ("n_flagged", "Flagged"),
                    ("coverage", "Coverage"),
                    ("genuine_precision", "Genuine precision"),
                    ("genuine_recall", "Genuine recall"),
                    ("false_trust_rate", "False-trust"),
                ),
            )
            + figure("final", "Whether a thin final day predicts an extension")
            + rate_table(descriptive["by_final_day_screenings"], "final_day_screenings", "Final-day showtimes"),
        ),
        section(
            8,
            "Does an extension-risk model beat the simple rules?",
            "<p>The model predicts P(extension). Trusting the date means that probability is below a threshold chosen on the validation window "
            "so that, where possible, false-trust stays at or under 20% while genuine endings are still covered. "
            f"Logistic threshold: {_num(logistic.get('threshold'), 3)}. "
            f"Tree status is in the rules below. Boosting status: {boosted_note}.</p>"
            + _table_html(
                model_rows,
                (
                    ("model", "Model"),
                    ("n", "N"),
                    ("pr_auc", "PR-AUC"),
                    ("roc_auc", "ROC-AUC"),
                    ("brier", "Brier"),
                    ("precision", "Extension precision"),
                    ("recall", "Extension recall"),
                    ("genuine_precision", "Genuine precision"),
                    ("genuine_recall", "Genuine recall"),
                    ("false_trust_rate", "False-trust"),
                ),
            )
            + "<h3>Largest logistic coefficients</h3>"
            + _table_html(coefficients, (("feature", "Feature"), ("coefficient", "Coefficient")))
            + "<p>A positive coefficient raises predicted extension risk. Days-to-end and the duplicate horizon from the earlier audit are not both in this model; only days to the listed end is.</p>"
            + "<pre>" + tree_rules + "</pre>"
            + figure("pr", "Holdout precision-recall for the extension model")
            + figure("cal", "Whether predicted extension probabilities match observed rates"),
        ),
        section(
            9,
            "Does extension-risk improve simulated Leaving Soon?",
            "<p>This is a research score only. Candidates treat a listed end inside 7 days as the candidate set, then multiply or gate it by extension risk. "
            "A short extension can still leave inside 7 days of the observation, so blocking every extension is not the same as predicting departure. "
            f"Near-term holdout rows with no extension score, which fall back to trusting the listing: {sim.get('near_term_rows_without_extension_score', 'n/a')}.</p>"
            + figure("sim", "Leave-within-7 precision, recall, and PR-AUC")
            + _table_html(
                sim_rows,
                (
                    ("approach", "Approach"),
                    ("n", "N"),
                    ("positives", "Positives"),
                    ("precision", "Precision"),
                    ("recall", "Recall"),
                    ("f1", "F1"),
                    ("pr_auc", "PR-AUC"),
                    ("false_positives", "False positives"),
                    ("false_negatives", "False negatives"),
                    ("precision_at_recall_50", "Precision at 50% recall"),
                ),
            ),
        ),
        section(
            10,
            "Error review",
            "<p>Holdout population A, at the validation-chosen threshold: "
            f"{len(errors.get('anticipated', []))} extensions anticipated in the exported sample, "
            f"{len(errors.get('unexpected', []))} unexpected extensions, "
            f"{len(errors.get('genuine_called_extension', []))} genuine endings called risky, "
            f"{len(errors.get('genuine_trusted', []))} genuine endings trusted. "
            "The CSVs hold the rows. The table here is the earlier false-positive set, scored if the film qualified.</p>"
            + _table_html(
                spotlight,
                (
                    ("title", "Title"),
                    ("theater", "Theater"),
                    ("observation_date", "Observed"),
                    ("listed_final_date", "Listed end"),
                    ("days_to_known_last", "Days"),
                    ("extended", "Extended"),
                    ("extension_magnitude_days", "Days added"),
                    ("extension_probability", "P(extension)"),
                    ("production_p7", "Production p7"),
                    ("other_theaters_beyond_listed_end", "Others beyond"),
                    ("kind", "Call"),
                ),
            ),
        ),
        section(
            11,
            "Candidate production implications",
            "<p>These are labels on the evidence. None of them are implemented.</p>"
            + "".join(
                f"<h3>{html.escape(item['id'])}. {html.escape(item['claim'])} <span class='label'>{html.escape(item['label'])}</span></h3><p>{html.escape(item['why'])}</p>"
                for item in implications
            ),
        ),
        "</body></html>",
    ]
    (out_dir / "index.html").write_text("".join(parts), encoding="utf-8")


def write_outputs(result: dict[str, Any], out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    render_charts(result, out_dir)
    observations = list(result.get("observations") or [])
    _write_csv(out_dir / "extension_observations.csv", observations, OBS_FIELDS)
    _write_csv(out_dir / "extension_feature_dictionary.csv", feature_dictionary())
    errors = result.get("errors", {})
    error_rows = []
    for kind in ("anticipated", "unexpected", "genuine_called_extension", "genuine_trusted"):
        error_rows.extend(errors.get(kind, []))
    error_rows.extend(result.get("spotlight", []))
    _write_csv(out_dir / "extension_errors.csv", error_rows)
    _write_csv(out_dir / "unexpected_extensions.csv", errors.get("unexpected", []))
    genuine = list(errors.get("genuine_trusted", [])) + list(errors.get("genuine_called_extension", []))
    _write_csv(out_dir / "genuine_ends.csv", genuine)
    _write_csv(
        out_dir / "cross_theater_end_state.csv",
        observations,
        (
            "title",
            "theater_name",
            "observation_date",
            "known_last_show_date",
            "segment",
            "extended",
            "market_theater_count",
            "other_theaters_beyond_listed_end",
            "other_theaters_on_same_end",
            "share_other_theaters_on_same_end",
            "all_theaters_share_listed_end",
            "this_theater_is_earliest_exit",
            "this_theater_is_latest_exit",
            "solo_theater",
            "extension_magnitude_days",
            "extension_first_observed",
        ),
    )
    render_html(result, out_dir)
    summary = _jsonable(result)
    (out_dir / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
