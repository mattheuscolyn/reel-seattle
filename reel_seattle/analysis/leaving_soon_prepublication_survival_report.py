"""Charts and the review page for the pre-publication remaining-weeks forecast."""

from __future__ import annotations

import csv
import html
import json
import math
from pathlib import Path
from typing import Any, Mapping, Sequence

import numpy as np

from reel_seattle.analysis.leaving_soon_prepublication_survival import BUCKETS, feature_dictionary

CHARTS = (
    "booking_cycle_transition_weekday.png",
    "booking_cycle_transition_by_theater.png",
    "survival_by_theatrical_week.png",
    "survival_by_current_screenings.png",
    "survival_by_week_over_week_change.png",
    "survival_by_market_theater_count.png",
    "feature_family_ablation.png",
    "remaining_weeks_calibration.png",
    "remaining_weeks_confusion.png",
    "thursday_ranking_accuracy.png",
    "forecast_vs_confirmation_performance.png",
)

OBS_FIELDS = (
    "title",
    "theater_name",
    "segment",
    "observation_date",
    "publication_snapshot",
    "upcoming_friday",
    "thursday",
    "theatrical_week_number",
    "current_week_screenings",
    "wow_pct_change",
    "decline_from_peak",
    "market_theater_count",
    "theater_count_wow",
    "share_of_theater",
    "rank_in_theater",
    "has_next_friday",
    "days_to_known_last",
    "pub_has_next_friday",
    "censored",
    "remaining_weeks",
    "bucket",
    "p0",
    "p1",
    "p2",
    "p3",
    "expected_weeks",
)


def _pct(value: Any) -> str:
    if not isinstance(value, (int, float)) or isinstance(value, bool) or (isinstance(value, float) and math.isnan(value)):
        return "n/a"
    return f"{float(value) * 100:.1f}%"


def _num(value: Any) -> str:
    if not isinstance(value, (int, float)) or isinstance(value, bool) or (isinstance(value, float) and math.isnan(value)):
        return "n/a"
    if isinstance(value, float):
        return f"{value:.3f}"
    return str(value)


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


def _jsonable(value: Any) -> Any:
    if isinstance(value, dict):
        skip = {"observations", "market_observations", "cycles"}
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
    return value


def _table(rows: Sequence[Mapping[str, Any]], columns: Sequence[tuple[str, str]]) -> str:
    head = "".join(f"<th>{html.escape(label)}</th>" for _key, label in columns)
    body = []
    for row in rows:
        cells = []
        for key, _label in columns:
            value = row.get(key, "")
            if isinstance(value, float) and ("share" in key or "predicted" in key or key.startswith("survive") or key.startswith("pr_") or key.endswith("accuracy") or key.endswith("ndcg")):
                text = _pct(value) if value <= 1.5 else _num(value)
            elif isinstance(value, float):
                text = _num(value) if abs(value) < 20 else f"{value:.1f}"
            else:
                text = "" if value is None else str(value)
            cells.append(f"<td>{html.escape(text)}</td>")
        body.append("<tr>" + "".join(cells) + "</tr>")
    return f"<table><thead><tr>{head}</tr></thead><tbody>{''.join(body)}</tbody></table>"


def render_charts(result: Mapping[str, Any], out_dir: Path) -> None:
    import matplotlib.pyplot as plt

    plt.rcParams.update({"figure.facecolor": "white", "axes.facecolor": "white", "axes.grid": True, "grid.alpha": 0.25, "font.size": 10, "figure.dpi": 120})

    def save(fig: Any, name: str) -> None:
        fig.tight_layout()
        fig.savefig(out_dir / name, bbox_inches="tight")
        plt.close(fig)

    booking = result["booking"]
    order = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    counts = [booking["weekday_80_counts"].get(day, 0) for day in order]
    fig, ax = plt.subplots(figsize=(8, 4.2))
    ax.bar(order, counts, color="#1f4e79")
    ax.set_ylabel("Theater-weeks")
    ax.set_title("Weekday when next Friday reaches 80% of a typical Friday")
    for index, count in enumerate(counts):
        ax.text(index, count + 0.3, str(count), ha="center", fontsize=8)
    save(fig, "booking_cycle_transition_weekday.png")

    theaters = sorted(booking["by_theater"])
    fig, ax = plt.subplots(figsize=(9, 4.6))
    x = np.arange(len(theaters))
    width = 0.18
    for index, day in enumerate(("Tuesday", "Wednesday", "Thursday", "Friday")):
        vals = [booking["by_theater"][name].get(day, 0) for name in theaters]
        ax.bar(x + (index - 1.5) * width, vals, width=width, label=day)
    ax.set_xticks(x, [name.replace("AMC ", "") for name in theaters], rotation=25, ha="right")
    ax.set_title("80% publication weekday by theater")
    ax.legend(ncol=4, fontsize=8)
    save(fig, "booking_cycle_transition_by_theater.png")

    def survival_chart(table: Sequence[Mapping[str, Any]], key: str, order_labels: Sequence[str], title: str, name: str) -> None:
        chosen = []
        for label in order_labels:
            for row in table:
                if str(row.get(key)) == label:
                    chosen.append(row)
        if not chosen:
            chosen = list(table)
        labels = [str(row.get(key)) for row in chosen]
        fig, ax = plt.subplots(figsize=(8.2, 4.4))
        x = np.arange(len(labels))
        width = 0.2
        for index, weeks in enumerate((1, 2, 3)):
            vals = [float(row.get(f"survive_at_least_{weeks}") or 0) * 100 for row in chosen]
            ax.bar(x + (index - 1) * width, vals, width=width, label=f"at least {weeks} more")
        ax.set_xticks(x, labels, rotation=20, ha="right")
        ax.set_ylim(0, 105)
        ax.set_ylabel("Share still playing (%)")
        ax.set_title(title)
        ax.legend(fontsize=8)
        save(fig, name)

    survival = result["survival"]
    survival_chart(survival["by_week"], "theatrical_week", ("week 1", "week 2", "week 3", "week 4+"), "Survival from the pre-publication snapshot, by theatrical week", "survival_by_theatrical_week.png")
    survival_chart(survival["by_screenings"], "screenings", ("1-4", "5-12", "13-24", "25+"), "Survival by visible-week screening count", "survival_by_current_screenings.png")
    survival_chart(survival["by_wow"], "wow", ("no prior week", "flat or up", "down 5-30%", "down 30-60%", "down >60%"), "Survival by week-over-week change", "survival_by_week_over_week_change.png")
    survival_chart(survival["by_theaters"], "theaters", ("1", "2", "3", "4+"), "Survival by how many Seattle AMCs are still listing the film", "survival_by_market_theater_count.png")

    ablation = [row for row in result["ablation"] if row["model"] != "all_valid"]
    fig, ax = plt.subplots(figsize=(8.4, 4.4))
    labels = [row["model"] for row in ablation]
    vals = [float((row.get("holdout") or {}).get("pr_auc_final_week") or 0) for row in ablation]
    ax.bar(np.arange(len(labels)), vals, color="#0f6e56")
    ax.set_xticks(np.arange(len(labels)), labels, rotation=25, ha="right")
    ax.set_ylim(0, 1.05)
    ax.set_ylabel("Holdout PR-AUC for final week")
    ax.set_title("Cumulative feature families, before the next week is published")
    save(fig, "feature_family_ablation.png")

    calibration = (result["models"].get("hazard") or {}).get("calibration") or []
    fig, ax = plt.subplots(figsize=(7.2, 4.4))
    if calibration:
        x = np.arange(len(calibration))
        ax.bar(x - 0.15, [row["observed_share"] for row in calibration], width=0.3, label="Observed share")
        ax.bar(x + 0.15, [row["mean_predicted"] for row in calibration], width=0.3, label="Mean predicted")
        ax.set_xticks(x, [row["bucket"] for row in calibration])
    ax.set_ylim(0, 1.05)
    ax.set_title("Are the remaining-week probabilities calibrated?")
    ax.legend()
    save(fig, "remaining_weeks_calibration.png")

    confusion = np.array((result["models"].get("hazard") or {}).get("confusion") or np.zeros((4, 4)))
    fig, ax = plt.subplots(figsize=(6.2, 5))
    image = ax.imshow(confusion, cmap="Blues")
    ax.set_xticks(range(4), BUCKETS, rotation=20, ha="right")
    ax.set_yticks(range(4), BUCKETS)
    ax.set_xlabel("Predicted")
    ax.set_ylabel("Actual")
    ax.set_title("Holdout remaining-week confusion")
    for i in range(confusion.shape[0]):
        for j in range(confusion.shape[1]):
            ax.text(j, i, str(int(confusion[i, j])), ha="center", va="center", color="black", fontsize=9)
    fig.colorbar(image, ax=ax, fraction=0.046)
    save(fig, "remaining_weeks_confusion.png")

    ranking = result["ranking"]["market"]
    fig, ax = plt.subplots(figsize=(7, 4.2))
    labels = ["Pairwise order", "Top 3 in soonest group", "NDCG"]
    vals = [ranking.get("pairwise_accuracy") or 0, ranking.get("top3_share_in_soonest_group") or 0, ranking.get("mean_ndcg") or 0]
    ax.bar(labels, vals, color="#9b2335")
    ax.set_ylim(0, 1.05)
    ax.set_title("Market ranking on holdout forecast dates")
    save(fig, "thursday_ranking_accuracy.png")

    hazard = result["models"].get("hazard") or {}
    confirmation = result.get("confirmation") or {}
    production = result.get("production") or {}
    labels = ["Forecast hazard", "Naive before publication", "Naive after publication", "Listed-end confirmation", "Production p7"]
    vals = [
        hazard.get("pr_auc_final_week") or 0,
        confirmation.get("naive_no_next_friday_at_prepublication_pr_auc") or 0,
        confirmation.get("naive_no_next_friday_after_publication_pr_auc") or 0,
        confirmation.get("listed_end_after_publication_pr_auc") or 0,
        production.get("pr_auc_final_week") or 0,
    ]
    fig, ax = plt.subplots(figsize=(8.6, 4.4))
    ax.bar(np.arange(len(labels)), vals, color=["#1f4e79", "#8aa0b4", "#c47b2b", "#9b2335", "#5c3d8a"])
    ax.set_xticks(np.arange(len(labels)), labels, rotation=20, ha="right")
    ax.set_ylim(0, 1.05)
    ax.set_ylabel("PR-AUC for final week")
    ax.set_title("Forecast before publication versus confirmation after it")
    save(fig, "forecast_vs_confirmation_performance.png")


def render_html(result: Mapping[str, Any], out_dir: Path) -> None:
    booking = result["booking"]
    counts = result["counts"]
    models = result["models"]
    hazard = models.get("hazard") or {}
    empirical = models.get("empirical") or {}
    ranking = result["ranking"]
    confirmation = result.get("confirmation") or {}
    dominant = booking.get("dominant_weekday") or "n/a"
    share = (booking.get("weekday_80_share") or {}).get(dominant)

    def section(number: int, title: str, body: str) -> str:
        return f"<section><h2>{number}. {html.escape(title)}</h2>{body}</section>"

    def figure(name: str, caption: str) -> str:
        return f"<figure><img src='{name}' alt='{html.escape(caption)}'><figcaption>{html.escape(caption)}</figcaption></figure>"

    survival_columns = (
        ("n", "N"),
        ("survive_at_least_1", "At least 1 more week"),
        ("n_1", "N for 1"),
        ("survive_at_least_2", "At least 2"),
        ("survive_at_least_3", "At least 3"),
    )
    parts = [
        "<!DOCTYPE html><html lang='en'><head><meta charset='utf-8'><title>Pre-publication remaining run</title>",
        "<style>body{font-family:Georgia,serif;max-width:980px;margin:2rem auto;padding:0 1.2rem;color:#1c1c1c;line-height:1.45}",
        "h1{font-size:1.7rem} h2{margin-top:2rem;font-size:1.22rem} table{border-collapse:collapse;width:100%;font-family:ui-sans-serif,sans-serif;font-size:.84rem;margin:.8rem 0}",
        "th,td{border-bottom:1px solid #ddd;text-align:left;padding:.35rem .4rem;vertical-align:top} th{background:#f6f4ef}",
        "img{max-width:100%;height:auto;border:1px solid #eee} figcaption{font-family:ui-sans-serif,sans-serif;font-size:.84rem;color:#444}</style></head><body>",
        "<h1>Before AMC publishes next week, how many weeks does a film have left?</h1>",
        f"<p>Snapshots {html.escape(result['dataset_start'])} through {html.escape(result['as_of'])}. "
        f"Train through {html.escape(result['train_end'])}, validation through {html.escape(result['validation_end'])}, holdout after that. "
        "The live Leaving Soon score is unchanged.</p>",
        section(
            1,
            "Product question",
            "<p>The question is not only whether a film leaves within 7 days. It is the distribution of additional Fri–Thu programming weeks "
            "a currently playing film has left, estimated before AMC publishes the next week. "
            "That is the information a person would need in order to decide which films can wait.</p>"
            "<p>Final week means the visible Fri–Thu week is the last. One more week means showtimes in the next week and not the week after that. "
            "Three or more is the open-ended tail. Runs whose end is not yet confirmed, and that have not already reached three further weeks, stay unlabeled.</p>",
        ),
        section(
            2,
            "When does AMC actually publish the next week?",
            f"<p>For each theater and upcoming Friday, the publication snapshot is the first day that Friday's listings reach 80% of that theater's other Friday volumes. "
            f"{booking['reached_80']} of {booking['theater_weeks']} theater-weeks reach that bar. "
            f"The most common snapshot weekday is <strong>{html.escape(str(dominant))}</strong> "
            f"({booking['weekday_80_counts'].get(dominant, 0)} of {booking['reached_80']}, {_pct(share)}). "
            f"Wednesday is the other day that reaches the bar "
            f"({booking['weekday_80_counts'].get('Wednesday', 0)} of {booking['reached_80']}). "
            f"No theater-week first crosses 80% on Thursday, Friday, or the weekend. Wednesday is not the universal publication day, and the mix differs by theater: "
            f"Alderwood is Wednesday in every reached week, while Factoria, Kent, and Woodinville are usually Tuesday.</p>"
            f"<p>Friday volume usually arrives in one jump. The 50% and 80% bars fall on the same snapshot in "
            f"{booking.get('friday_50_and_80_same_day')} of {booking['reached_80']} weeks. "
            f"{booking.get('never_reached_95')} weeks never reach 95% of a typical Friday before that Friday. "
            f"On the 80% snapshot, at least six of the seven Fri–Thu days are already listed in {_pct(booking.get('full_week_same_snapshot_share'))} of weeks. "
            f"Some showtime somewhere in the upcoming week is listed earlier in {_pct(booking.get('incremental_share'))} of weeks. "
            f"That earlier trace is an advance listing, not a gradual fill of Friday.</p>"
            + figure("booking_cycle_transition_weekday.png", "Publication weekday at the 80% Friday bar")
            + figure("booking_cycle_transition_by_theater.png", "The same weekday, split by theater")
            + "<p>The daily scrape runs near 06:00 UTC, about 23:00 Pacific the previous evening. A snapshot dated Tuesday therefore reflects listings that were already up late Monday night, and a Wednesday snapshot reflects late Tuesday night. "
            "Under that clock, the next Friday is usually substantially listed by Monday or Tuesday night. "
            "The earlier footprint audit, which watched when a film's maximum listed date moved, is a different event and is not the publication rule used here.</p>"
            + "<p>The forecast snapshot is the last daily snapshot before that 80% day. When the 80% day is Tuesday, the forecast is Monday. When it is Wednesday, the forecast is Tuesday. "
            "That prior snapshot exists for every week that reaches the bar.</p>",
        ),
        section(
            3,
            "How was the pre-publication snapshot selected?",
            f"<p>{html.escape(result['primary_reason'])}</p>"
            f"<p>Film by theater rows: {counts['film_theater']['n']}, of which {counts['film_theater']['uncensored']} have a confirmed remaining-week bucket and {counts['film_theater']['censored']} are censored. "
            f"Market rows, one per film and upcoming Friday: {counts['market']['n']}, uncensored {counts['market']['uncensored']}. "
            f"Holdout film-by-theater: {counts['holdout']['n']} ({counts['holdout']['uncensored']} uncensored). "
            f"Monday benchmark rows: {counts['monday']['n']}. Tuesday: {counts['tuesday']['n']}.</p>"
            f"<p>Holdout bucket counts: {html.escape(str(counts['holdout'].get('buckets')))}. "
            f"Train: {html.escape(str(counts['train'].get('buckets')))}.</p>",
        ),
        section(
            4,
            "How long do films typically survive from that point?",
            figure("survival_by_theatrical_week.png", "Share still playing one, two, and three more weeks, by theatrical week")
            + _table(result["survival"]["by_week"], (("theatrical_week", "Week"),) + survival_columns)
            + figure("survival_by_current_screenings.png", "Survival by how full the visible week is")
            + _table(result["survival"]["by_screenings"], (("screenings", "Screenings this week"),) + survival_columns)
            + figure("survival_by_week_over_week_change.png", "Survival by the change from the prior week")
            + _table(result["survival"]["by_wow"], (("wow", "Week over week"),) + survival_columns)
            + figure("survival_by_market_theater_count.png", "Survival by Seattle AMC footprint")
            + _table(result["survival"]["by_theaters"], (("theaters", "Theaters still listing the film"),) + survival_columns)
            + _table(result["survival"]["by_segment"], (("segment", "Segment"),) + survival_columns)
            + _table(result["survival"]["by_theater"], (("theater", "Theater"),) + survival_columns),
        ),
        section(
            5,
            "Which signals predict another week?",
            "<p>Another week is the complement of a final-week call. A positive coefficient raises the weekly exit hazard. "
            "The largest protective coefficient is the visible week's screening count. Days since the first show raises the exit hazard. "
            "Market screening volume and theater count also point toward a longer run.</p>"
            + _table((result.get("coefficients") or [])[:12], (("feature", "Feature"), ("coefficient", "Log-hazard coefficient")))
            + figure("feature_family_ablation.png", "Final-week PR-AUC as families are added")
            + "<p>Read the ablation as cumulative, on the same holdout. Maturity alone is close to the base rate. "
            "Adding this week's screening counts is the large step. Adding week-over-week contraction after that does not improve holdout log loss or final-week PR-AUC: "
            "a steep drop is mostly the same fact as a thin current week, which the screening count already has. "
            "Market footprint then helps, especially the chance of three or more further weeks. "
            "Theater commitment helps the distribution again. Segment flags and the advance-title count do not; "
            "the best holdout log loss in this ladder is the model that stops at theater commitment.</p>",
        ),
        section(
            6,
            "Which signals predict multiple additional weeks?",
            "<p>The same model converts three weekly hazards into P(final), P(exactly one more), P(exactly two more), and P(three or more). "
            f"Holdout PR-AUC is {_num(hazard.get('pr_auc_exactly_1'))} for exactly one more week, "
            f"{_num(hazard.get('pr_auc_exactly_2'))} for exactly two, and {_num(hazard.get('pr_auc_3_plus'))} for three or more. "
            "Exact middle buckets are harder than the final-week call because many runs are either done or still wide open.</p>",
        ),
        section(
            7,
            "Model comparison",
            "<p>The production Leaving Soon hazard is a daily model whose covariates include the announced horizon. "
            "Using it here would put the listed end back into the forecast, so the weekly hazard below follows the same person-period idea with a one-week bin and only pre-publication features.</p>"
            + _table(
                [
                    {"model": "Weekly logistic hazard", **hazard},
                    {"model": "Empirical week and screening rate", **empirical},
                    {"model": "Multinomial logistic", **(models.get("multiclass") or {})},
                    {"model": "Monday snapshot hazard", **(models.get("monday") or {})},
                    {"model": "Tuesday snapshot hazard", **(models.get("tuesday") or {})},
                    {"model": "Ordinary films only", **(models.get("ordinary_hazard") or {})},
                    {"model": "Direct market hazard", **(models.get("market_hazard") or {})},
                    {"model": "Independence combination of theaters", **(models.get("independence_combination") or {})},
                ],
                (
                    ("model", "Model"),
                    ("n", "N"),
                    ("log_loss", "Log loss"),
                    ("brier", "Brier"),
                    ("accuracy", "Argmax accuracy"),
                    ("pr_auc_final_week", "PR-AUC final week"),
                    ("pr_auc_gone_within_2_weeks", "PR-AUC gone within 2 weeks"),
                    ("median_abs_error_capped", "Median week error"),
                ),
            ),
        ),
        section(
            8,
            "Probability calibration",
            "<p>Mean predicted probability against the actual share of each bucket. A useful planning distribution has to match these shares, not only pick the largest bucket.</p>"
            + figure("remaining_weeks_calibration.png", "Observed share versus mean predicted probability")
            + _table(hazard.get("calibration") or [], (("bucket", "Bucket"), ("n", "N"), ("observed_share", "Observed"), ("mean_predicted", "Mean predicted")))
            + figure("remaining_weeks_confusion.png", "Argmax bucket versus the actual bucket"),
        ),
        section(
            9,
            "Thursday planning examples",
            "<p>Each Thursday is the day before an upcoming Friday. The probabilities come from the last snapshot before that Friday's schedule reached the 80% bar, not from Thursday's own scrape. "
            "If publication is already on the Thursday snapshot, a person looking that evening can see the new week directly. These rows are the forecast from the day before that happened.</p>"
            + _table(
                result.get("thursday_examples") or [],
                (
                    ("thursday", "Thursday"),
                    ("title", "Film"),
                    ("final_week", "Final week"),
                    ("plus_1", "+1"),
                    ("plus_2", "+2"),
                    ("plus_3", "3+"),
                    ("expected_weeks", "Expected"),
                    ("actual", "Actual"),
                    ("urgency_rank", "Urgency"),
                ),
            ),
        ),
        section(
            10,
            "Urgency-ranking performance",
            f"<p>On holdout market forecast dates, pairwise accuracy is {_pct(ranking['market'].get('pairwise_accuracy'))} "
            f"over {ranking['market'].get('pairwise_n')} pairs with different outcomes. "
            f"Of the three films called most urgent, {_pct(ranking['market'].get('top3_share_in_soonest_group'))} were in the soonest actual group. "
            f"Mean NDCG is {_num(ranking['market'].get('mean_ndcg'))}. "
            f"Ordinary films only: pairwise {_pct(ranking['market_ordinary'].get('pairwise_accuracy'))}, "
            f"top-3 {_pct(ranking['market_ordinary'].get('top3_share_in_soonest_group'))}.</p>"
            + figure("thursday_ranking_accuracy.png", "Ranking metrics for the market forecast"),
        ),
        section(
            11,
            "Forecast versus confirmation",
            f"<p>At the pre-publication snapshot, {_pct(confirmation.get('share_prepublication_already_lists_next_week'))} of holdout rows already list a show in the next week. "
            f"On the publication snapshot, that share is {_pct(confirmation.get('share_publication_lists_next_week'))}. "
            f"A rule that calls the week final when next Friday is absent has PR-AUC {_num(confirmation.get('naive_no_next_friday_at_prepublication_pr_auc'))} before publication and "
            f"{_num(confirmation.get('naive_no_next_friday_after_publication_pr_auc'))} after it. "
            f"A three-feature listed-end model fit on the publication snapshot reaches {_num(confirmation.get('listed_end_after_publication_pr_auc'))}. "
            f"Production P(end within 7 days), which still receives days-to-known-last, scores {_num((result.get('production') or {}).get('pr_auc_final_week'))} on this final-week label. "
            f"The pre-publication hazard's final-week PR-AUC is {_num(hazard.get('pr_auc_final_week'))}.</p>"
            + figure("forecast_vs_confirmation_performance.png", "Final-week PR-AUC before and after the next week is visible"),
        ),
        section(
            12,
            "Remaining failure modes",
            "<p>The history is only June through September, so a three-week tail has little room to be observed and many recent runs stay censored. "
            "Exact one-week and two-week calls are much weaker than the final-week call. "
            "Specials are often one-week events, so an all-films ranking can look orderly by putting specials first. The ordinary-only ranking is the harder test. "
            "Expected weeks treat three or more as three, so long runs are compressed. "
            "A Thursday evening user in this scrape calendar often already has the new week on the schedule. The forecast is the snapshot before that, not a replacement for reading a published week.</p>",
        ),
        section(
            13,
            "Candidate production implications",
            "<p>These are not implemented.</p>"
            "<p>Use the listed end once AMC has published the next week, and treat anything scored before that publication as a forecast with a wider error. "
            "The confirmation numbers above are the published-week task. The hazard numbers are the forecast task.</p>"
            "<p>If the product speaks on Thursday after the schedule drop, it can confirm next week from the listing and reserve the model for the weeks after the published one. "
            "That second horizon is where contraction, theatrical week, and theater count have to do the work, because the listed end no longer reaches past the published week.</p>",
        ),
        "</body></html>",
    ]
    (out_dir / "index.html").write_text("".join(parts), encoding="utf-8")


def _errors(rows: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    mistakes = []
    for row in rows:
        if row.get("censored") or not isinstance(row.get("p0"), float):
            continue
        probs = [row["p0"], row["p1"], row["p2"], row["p3"]]
        predicted = int(np.argmax(probs))
        if predicted == row["bucket"]:
            continue
        mistakes.append(
            {
                "title": row["title"],
                "theater_name": row["theater_name"],
                "observation_date": row["observation_date"],
                "segment": row["segment"],
                "actual_bucket": BUCKETS[int(row["bucket"])],
                "predicted_bucket": BUCKETS[predicted],
                "p0": row["p0"],
                "p1": row["p1"],
                "p2": row["p2"],
                "p3": row["p3"],
                "expected_weeks": row.get("expected_weeks"),
                "theatrical_week_number": row["theatrical_week_number"],
                "current_week_screenings": row["current_week_screenings"],
                "wow_pct_change": row.get("wow_pct_change"),
                "market_theater_count": row.get("market_theater_count"),
                "confidence": max(probs),
            }
        )
    mistakes.sort(key=lambda item: item["confidence"], reverse=True)
    return mistakes[:40]


def write_outputs(result: dict[str, Any], out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    render_charts(result, out_dir)
    observations = list(result.get("observations") or [])
    market = list(result.get("market_observations") or [])
    _write_csv(out_dir / "prepublication_observations.csv", observations, OBS_FIELDS)
    _write_csv(out_dir / "booking_cycle_transitions.csv", result.get("cycles") or [])
    _write_csv(out_dir / "survival_feature_dictionary.csv", feature_dictionary(bool(result.get("incoming_included"))))
    thursday_rows = [row for row in market if row.get("split_date") and row["split_date"] > result["validation_end"]]
    _write_csv(
        out_dir / "thursday_forecast_examples.csv",
        thursday_rows,
        (
            "thursday",
            "observation_date",
            "title",
            "segment",
            "p0",
            "p1",
            "p2",
            "p3",
            "expected_weeks",
            "bucket",
            "remaining_weeks",
            "censored",
            "theatrical_week_number",
            "market_screenings",
            "market_theater_count",
        ),
    )
    holdout = [row for row in observations if row.get("split_date", "") > result["validation_end"]]
    _write_csv(out_dir / "forecast_errors.csv", _errors(holdout))
    ablation_rows = []
    for row in result.get("ablation") or []:
        hold = row.get("holdout") or {}
        ablation_rows.append(
            {
                "model": row["model"],
                "features": row.get("features"),
                "n": hold.get("n"),
                "log_loss": hold.get("log_loss"),
                "brier": hold.get("brier"),
                "pr_auc_final_week": hold.get("pr_auc_final_week"),
                "pr_auc_exactly_1": hold.get("pr_auc_exactly_1"),
                "pr_auc_exactly_2": hold.get("pr_auc_exactly_2"),
                "pr_auc_3_plus": hold.get("pr_auc_3_plus"),
                "pr_auc_gone_within_2_weeks": hold.get("pr_auc_gone_within_2_weeks"),
                "accuracy": hold.get("accuracy"),
                "median_abs_error_capped": hold.get("median_abs_error_capped"),
            }
        )
    _write_csv(out_dir / "feature_family_results.csv", ablation_rows)
    render_html(result, out_dir)
    (out_dir / "summary.json").write_text(json.dumps(_jsonable(result), indent=2), encoding="utf-8")
