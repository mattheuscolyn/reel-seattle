"""Charts, CSV tables, and the HTML review page for the scheduling audit."""

from __future__ import annotations

import csv
import html
import json
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Mapping, Sequence

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.dates import DateFormatter, date2num

from reel_seattle.analysis.amc_run_lifecycle import json_ready
from reel_seattle.analysis.leaving_soon_scheduling_assumptions import (
    WEEKDAY_NAMES,
    Engagement,
    _contraction_series,
    time_block,
    weekday_name,
)

ORD = "#1f4e79"
RER = "#c47b2b"
SPE = "#2f6f4e"
AMB = "#6b4c7a"
FRN = "#8c3a3a"
INK = "#243040"


def _style() -> None:
    plt.rcParams.update(
        {
            "figure.facecolor": "white",
            "axes.facecolor": "white",
            "axes.grid": True,
            "grid.alpha": 0.28,
            "grid.linestyle": "-",
            "axes.axisbelow": True,
            "font.size": 11,
            "axes.titlesize": 13,
            "axes.titleweight": "semibold",
            "figure.dpi": 120,
        }
    )


def _save(fig: plt.Figure, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(path, bbox_inches="tight")
    plt.close(fig)


def _note(ax: plt.Axes, title: str, subtitle: str) -> None:
    ax.set_title(f"{title}\n{subtitle}", loc="left", fontsize=12, color=INK, pad=12)


def _pct(value: float | None, digits: int = 1) -> str:
    if value is None:
        return "n/a"
    return f"{value * 100:.{digits}f}%"


def _num(value: float | None, digits: int = 1) -> str:
    if value is None:
        return "n/a"
    return f"{value:.{digits}f}"


def write_csv(path: Path, rows: Sequence[Mapping[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not rows:
        path.write_text("", encoding="utf-8")
        return
    fields: list[str] = []
    seen = set()
    for row in rows:
        for key in row:
            if key not in seen:
                seen.add(key)
                fields.append(key)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow({key: row.get(key, "") for key in fields})


def _bar_weekdays(dist: Mapping[str, Any], path: Path, title: str, subtitle: str, color: str = ORD) -> None:
    rows = dist["by_weekday"]
    fig, ax = plt.subplots(figsize=(9.2, 5.2))
    shares = [(row["share"] or 0) * 100 for row in rows]
    bars = ax.bar([row["weekday"] for row in rows], shares, color=color, width=0.72)
    for bar, row in zip(bars, rows):
        share = row["share"] or 0
        ax.text(
            bar.get_x() + bar.get_width() / 2,
            bar.get_height() + 0.8,
            f"{share * 100:.0f}%\n{row['count']}",
            ha="center",
            va="bottom",
            fontsize=8,
            color=INK,
        )
    ax.set_ylabel("Share of runs")
    ax.set_ylim(0, max(shares + [10]) * 1.28)
    ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda value, _pos: f"{value:.0f}%"))
    _note(ax, title, subtitle)
    fig.tight_layout()
    _save(fig, path)


def _grouped_weekdays(series: Sequence[tuple[str, Mapping[str, Any], str]], path: Path, title: str, subtitle: str) -> None:
    fig, ax = plt.subplots(figsize=(11.2, 5.6))
    import numpy as np

    x = np.arange(len(WEEKDAY_NAMES))
    width = 0.8 / max(1, len(series))
    for index, (label, dist, color) in enumerate(series):
        shares = [((row["share"] or 0) * 100) for row in dist["by_weekday"]]
        offset = (index - (len(series) - 1) / 2) * width
        ax.bar(x + offset, shares, width=width * 0.92, label=f"{label} (n={dist['n']})", color=color)
    ax.set_xticks(x, WEEKDAY_NAMES)
    ax.set_ylabel("Share of runs")
    ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda value, _pos: f"{value:.0f}%"))
    ax.legend(frameon=False, fontsize=8)
    _note(ax, title, subtitle)
    fig.tight_layout()
    _save(fig, path)


def _theater_thursday(rows: Sequence[Mapping[str, Any]], path: Path) -> None:
    ordered = sorted(rows, key=lambda row: (row["thursday_share"] is None, -(row["thursday_share"] or 0)))
    fig, ax = plt.subplots(figsize=(10, 5.4))
    labels = [f"{row['theater_name'].replace('AMC ', '')} (n={row['n']})" for row in ordered]
    shares = [(row["thursday_share"] or 0) * 100 for row in ordered]
    lows = []
    highs = []
    for row, share in zip(ordered, shares):
        low = 0 if row["thursday_wilson_low"] is None else row["thursday_wilson_low"] * 100
        high = 0 if row["thursday_wilson_high"] is None else row["thursday_wilson_high"] * 100
        lows.append(share - low)
        highs.append(high - share)
    y = range(len(ordered))
    ax.barh(list(y), shares, color=ORD, xerr=[lows, highs], capsize=3, ecolor="#7d8b99")
    ax.set_yticks(list(y), labels)
    ax.set_xlabel("Thursday share of confirmed ordinary week-plus exits")
    ax.xaxis.set_major_formatter(plt.FuncFormatter(lambda value, _pos: f"{value:.0f}%"))
    ax.set_xlim(0, 100)
    _note(
        ax,
        "Thursday-ending rate by Seattle-area AMC",
        "Error bars are 95% Wilson intervals. Ordinary catalog releases, span ≥ 7 days, confirmed ends only.",
    )
    fig.tight_layout()
    _save(fig, path)


def _histogram_compare(
    groups: Sequence[tuple[str, Sequence[float], str]],
    path: Path,
    *,
    title: str,
    subtitle: str,
    xlabel: str,
    bins: Sequence[float],
) -> None:
    fig, ax = plt.subplots(figsize=(9.4, 5.2))
    for label, values, color in groups:
        if not values:
            continue
        weights = [100.0 / len(values)] * len(values)
        ax.hist(values, bins=bins, weights=weights, label=f"{label} (n={len(values)})", color=color, alpha=0.55, edgecolor="white")
    ax.set_xlabel(xlabel)
    ax.set_ylabel("Percent of engagements")
    ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda value, _pos: f"{value:.0f}%"))
    ax.legend(frameon=False)
    _note(ax, title, subtitle)
    fig.tight_layout()
    _save(fig, path)


def _extension_rate(summary_q2: Mapping[str, Any], path: Path) -> None:
    from reel_seattle.analysis.leaving_soon_scheduling_assumptions import wilson_interval

    labels = []
    rates = []
    errors = []
    colors = []
    palette = [RER, ORD, SPE, AMB]
    keys = (
        ("Catalog rereleases", "rerelease", RER),
        ("Ordinary releases", "ordinary", ORD),
        ("Catalog specials", "special_event", SPE),
        ("Ambiguous rereleases", "ambiguous_rerelease", AMB),
    )
    for label, key, color in keys:
        block = summary_q2[key]
        n = block["n"]
        if not n:
            continue
        rate = block["extension_rate"] or 0
        interval = wilson_interval(block["extension_count"], n)
        low, high = interval if interval else (rate, rate)
        labels.append(f"{label}\n(n={n})")
        rates.append(rate * 100)
        errors.append(((rate - low) * 100, (high - rate) * 100))
        colors.append(color)
    fig, ax = plt.subplots(figsize=(9.2, 5.2))
    if rates:
        yerr = [[item[0] for item in errors], [item[1] for item in errors]]
        ax.bar(labels, rates, color=colors, yerr=yerr, capsize=4, ecolor="#7d8b99")
    ax.set_ylabel("Engagements extended past the initially observed final date")
    ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda value, _pos: f"{value:.0f}%"))
    ax.set_ylim(0, 100)
    _note(
        ax,
        "Extension rate after the first observed schedule",
        "Confirmed ends with an initial announcement seen before opening. Bars are 95% Wilson intervals.",
    )
    fig.tight_layout()
    _save(fig, path)


def _timelines(engagements: Sequence[Engagement], path: Path) -> None:
    if not engagements:
        return
    fig, ax = plt.subplots(figsize=(11.5, 6.2))
    for index, item in enumerate(engagements):
        y = len(engagements) - index - 1
        if item.initial_first_show and item.initial_last_show:
            start = date2num(item.initial_first_show)
            end = date2num(item.initial_last_show) + 1
            ax.barh(y, end - start, left=start, height=0.35, color=ORD, label="Initially observed span" if index == 0 else None)
        if item.initial_last_show and item.end_date > item.initial_last_show:
            start = date2num(item.initial_last_show) + 1
            end = date2num(item.end_date) + 1
            ax.barh(y, end - start, left=start, height=0.35, color=RER, label="Added after first observation" if index == 0 else None)
        ax.plot(date2num(item.first_observation), y, marker="o", color=SPE, markersize=7, label="First observed" if index == 0 else None)
        end_day = item.last_occurred or item.end_date
        ax.plot(date2num(end_day), y, marker="D", color=FRN, markersize=6, label="Actual last show" if index == 0 else None)
    labels = []
    for item in engagements:
        theater = item.theater_id.replace("amc-", "").replace("-", " ")
        labels.append(f"{item.title[:42]} · {theater}")
    ax.set_yticks(range(len(engagements) - 1, -1, -1), labels, fontsize=8)
    ax.xaxis.set_major_formatter(DateFormatter("%b %d"))
    ax.set_xlabel("Date")
    ax.legend(frameon=False, fontsize=8, loc="lower right")
    _note(
        ax,
        "Representative engagement timelines",
        "Retrospective. Blue is the span visible on the first snapshot. Orange dates were added later.",
    )
    fig.tight_layout()
    _save(fig, path)


def _theater_series(rows: Sequence[Mapping[str, Any]], value_key: str, path: Path, title: str, ylabel: str) -> None:
    if not rows:
        return
    fig, ax = plt.subplots(figsize=(11.2, 4.8))
    days = [date.fromisoformat(row["show_date"]) for row in rows]
    values = [row[value_key] for row in rows]
    ax.plot(days, values, color=ORD, linewidth=1.4)
    dense = [date.fromisoformat(row["show_date"]) for row in rows if row["dense"]]
    if dense:
        ax.axvline(max(dense), color=FRN, linestyle="--", linewidth=1, label="Dense horizon")
    lows = [date.fromisoformat(row["show_date"]) for row in rows if row.get("direction") == "low"]
    # outliers are a different table; mark holidays
    for row in rows:
        if row.get("holiday_note"):
            ax.axvline(date.fromisoformat(row["show_date"]), color="#d8c07a", alpha=0.35, linewidth=4)
    ax.set_ylabel(ylabel)
    ax.xaxis.set_major_formatter(DateFormatter("%b %d"))
    ax.legend(frameon=False, fontsize=8)
    name = rows[0]["theater_name"]
    _note(ax, f"{title}: {name}", "Dashed line is the continuous dense-publication horizon. Gold bands are holiday-adjacent dates.")
    fig.tight_layout()
    _save(fig, path)
    del lows


def _box_by_weekday(rows: Sequence[Mapping[str, Any]], path: Path, value_key: str, title: str, ylabel: str) -> None:
    theaters = []
    for row in rows:
        if row["theater_id"] not in theaters:
            theaters.append(row["theater_id"])
    fig, axes = plt.subplots(4, 2, figsize=(12.5, 12), sharex=True)
    flat = list(axes.ravel())
    for ax in flat[len(theaters) :]:
        ax.axis("off")
    for ax, theater_id in zip(flat, theaters):
        subset = [row for row in rows if row["theater_id"] == theater_id and row["dense"]]
        data = [[row[value_key] for row in subset if row["weekday"] == name] for name in WEEKDAY_NAMES]
        if any(data):
            ax.boxplot(data, tick_labels=[name[:3] for name in WEEKDAY_NAMES], showfliers=False)
        name = subset[0]["theater_name"].replace("AMC ", "") if subset else theater_id
        n = len(subset)
        ax.set_title(f"{name} (n={n} dense days)", fontsize=10, loc="left", color=INK)
        ax.set_ylabel(ylabel, fontsize=8)
    fig.suptitle(title, fontsize=13, fontweight="semibold", color=INK, x=0.02, ha="left")
    fig.tight_layout(rect=(0, 0, 1, 0.97))
    _save(fig, path)


def _scatter(rows: Sequence[Mapping[str, Any]], xkey: str, ykey: str, path: Path, title: str, xlabel: str, ylabel: str, subtitle: str) -> None:
    fig, ax = plt.subplots(figsize=(8.6, 6.2))
    theaters = []
    for row in rows:
        if row["theater_id"] not in theaters:
            theaters.append(row["theater_id"])
    cmap = plt.get_cmap("tab10")
    for index, theater_id in enumerate(theaters):
        subset = [row for row in rows if row["theater_id"] == theater_id]
        ax.scatter(
            [row[xkey] for row in subset],
            [row[ykey] for row in subset],
            label=subset[0]["theater_name"].replace("AMC ", ""),
            color=cmap(index % 10),
            s=36,
            alpha=0.85,
        )
    limit = 0
    for row in rows:
        limit = max(limit, row[xkey], row[ykey])
    if limit:
        ax.plot([0, limit], [0, limit], color="#99a", linewidth=1, linestyle="--", label="y = x")
    ax.set_xlabel(xlabel)
    ax.set_ylabel(ylabel)
    ax.legend(frameon=False, fontsize=8)
    _note(ax, title, subtitle)
    fig.tight_layout()
    _save(fig, path)


def _hist_values(values: Sequence[float], path: Path, title: str, xlabel: str, subtitle: str) -> None:
    fig, ax = plt.subplots(figsize=(8.8, 5))
    if values:
        bins = range(int(min(values)) - 1, int(max(values)) + 2)
        ax.hist(values, bins=bins, color=ORD, edgecolor="white")
    ax.set_xlabel(xlabel)
    ax.set_ylabel("Theater-weeks")
    _note(ax, title, subtitle)
    fig.tight_layout()
    _save(fig, path)


def _stacked_means(rows: Sequence[Mapping[str, Any]], path: Path) -> None:
    if not rows:
        return
    n = len(rows)
    departed = sum(row["screenings_lost_departed_films"] for row in rows) / n
    reduced = sum(row["screenings_lost_reduced_continuing"] for row in rows) / n
    increased = sum(max(0, row["net_screening_change"]) for row in rows) / n
    kept = sum(row["continuing_screenings_kept"] for row in rows) / n
    added = sum(row["continuing_screenings_added"] for row in rows) / n
    incoming = sum(row["incoming_friday_screenings"] for row in rows) / n
    fig, axes = plt.subplots(1, 2, figsize=(11, 5.2))
    axes[0].bar(["Mean week"], [departed], color=FRN, label="Departed films' Thursday screenings")
    axes[0].bar(["Mean week"], [reduced], bottom=[departed], color=RER, label="Reduced continuing films")
    axes[0].bar(["Mean week"], [increased], bottom=[departed + reduced], color=SPE, label="Net increase in theater volume")
    axes[0].set_ylabel("Screenings")
    axes[0].legend(frameon=False, fontsize=8)
    axes[0].set_title("Thursday capacity that freed up, plus new volume", loc="left", fontsize=11, color=INK)
    axes[1].bar(["Mean Friday"], [kept], color=ORD, label="Continuing films, unchanged count")
    axes[1].bar(["Mean Friday"], [added], bottom=[kept], color="#7ea0c4", label="Extra shows on continuing films")
    axes[1].bar(["Mean Friday"], [incoming], bottom=[kept + added], color=RER, label="Films not playing Thursday")
    axes[1].legend(frameon=False, fontsize=8)
    axes[1].set_title("Where Friday screenings were relative to Thursday", loc="left", fontsize=11, color=INK)
    fig.suptitle(
        f"Friday schedule composition (mean of {n} theater-weeks)\nNot a causal split. The right panel sums to the mean Friday screening count.",
        fontsize=12,
        fontweight="semibold",
        color=INK,
        x=0.02,
        ha="left",
    )
    fig.tight_layout(rect=(0, 0, 1, 0.86))
    _save(fig, path)


def _examples_bars(rows: Sequence[Mapping[str, Any]], path: Path) -> None:
    if not rows:
        return
    fig, ax = plt.subplots(figsize=(10.5, 5.2))
    import numpy as np

    x = np.arange(len(rows))
    thu = [row["thursday_screenings"] for row in rows]
    fri = [row["friday_screenings"] for row in rows]
    ax.bar(x - 0.18, thu, width=0.36, color="#8aa0b8", label="Thursday screenings")
    ax.bar(x + 0.18, fri, width=0.36, color=ORD, label="Friday screenings")
    labels = [
        f"{row['theater_name'].replace('AMC ', '')}\n{row['friday'][5:]}\nin {row['films_incoming']} / out {row['films_departing']}"
        for row in rows
    ]
    ax.set_xticks(x, labels, fontsize=8)
    ax.set_ylabel("Screenings")
    ax.legend(frameon=False)
    _note(ax, "Example Thursday → Friday weeks", "Labels show incoming films / departing films. Occurred dates inside the dense horizon.")
    fig.tight_layout()
    _save(fig, path)


def _trajectory(groups: Sequence[tuple[str, Mapping[str, Any], str]], path: Path, title: str, subtitle: str, ylabel: str) -> None:
    fig, ax = plt.subplots(figsize=(9.6, 5.4))
    for label, block, color in groups:
        medians = block.get("median_by_offset") or {}
        xs = []
        ys = []
        for offset in range(14, -1, -1):
            key = "D0" if offset == 0 else f"D-{offset}"
            value = medians.get(key)
            if value is None:
                continue
            xs.append(-offset)
            ys.append(value)
        if xs:
            ax.plot(xs, ys, marker="o", color=color, label=f"{label} (n={block.get('n', 0)})")
    ax.set_xlabel("Days relative to the confirmed final show date")
    ax.set_ylabel(ylabel)
    ax.legend(frameon=False, fontsize=8)
    _note(ax, title, subtitle)
    fig.tight_layout()
    _save(fig, path)


def _distribution_box(engagements: Sequence[Engagement], as_of: date, path: Path) -> None:
    offsets = (14, 7, 3, 1, 0)
    data = []
    labels = []
    for offset in offsets:
        values = []
        for item in engagements:
            series = _contraction_series(item, as_of=as_of)
            value = series.get(-offset)
            if value is not None:
                values.append(value)
        data.append(values)
        labels.append("D0" if offset == 0 else f"D-{offset}\n(n={len(values)})")
    fig, ax = plt.subplots(figsize=(8.8, 5.2))
    if any(data):
        ax.boxplot(data, tick_labels=labels, showfliers=False)
    ax.set_ylabel("Screenings that day at the theater")
    _note(
        ax,
        "Screenings on selected days before a confirmed exit",
        "Ordinary catalog releases, span ≥ 7 days. Days before the run started are omitted. Fliers hidden.",
    )
    fig.tight_layout()
    _save(fig, path)


def _individual_lines(picks: Sequence[tuple[str, Engagement]], as_of: date, path: Path) -> None:
    if not picks:
        return
    fig, ax = plt.subplots(figsize=(10.5, 5.6))
    cmap = plt.get_cmap("tab10")
    for index, (label, item) in enumerate(picks):
        series = _contraction_series(item, as_of=as_of)
        xs = []
        ys = []
        for offset in range(14, -1, -1):
            value = series.get(-offset)
            if value is None:
                continue
            xs.append(-offset)
            ys.append(value)
        ax.plot(xs, ys, marker="o", color=cmap(index % 10), label=label[:70])
    ax.set_xlabel("Days relative to that run's final show")
    ax.set_ylabel("Screenings at the theater")
    ax.legend(frameon=False, fontsize=8)
    _note(ax, "Individual film × theater trajectories", "Retrospective alignment. Each line is one confirmed run, not an average.")
    fig.tight_layout()
    _save(fig, path)


def _completeness_bars(rows: Sequence[Mapping[str, Any]], path: Path, title: str, subtitle: str) -> None:
    fig, ax = plt.subplots(figsize=(9.2, 5.2))
    labels = []
    shares = []
    for row in rows:
        if not row.get("n_screenings"):
            continue
        labels.append(f"{row['weekday'][:3]}\nn={row['n_screenings']}")
        shares.append((row["completeness"] or 0) * 100)
    ax.bar(labels, shares, color=ORD)
    for index, share in enumerate(shares):
        ax.text(index, share + 1.2, f"{share:.0f}%", ha="center", fontsize=8)
    ax.set_ylabel("Eventual upcoming-Friday screenings already known")
    ax.set_ylim(0, 110)
    ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda value, _pos: f"{value:.0f}%"))
    _note(ax, title, subtitle)
    fig.tight_layout()
    _save(fig, path)


def _completeness_lines(series: Sequence[tuple[str, Sequence[Mapping[str, Any]], str]], path: Path, title: str, subtitle: str) -> None:
    fig, ax = plt.subplots(figsize=(9.6, 5.4))
    for label, rows, color in series:
        xs = [row["days_before_showtime"] for row in rows if row.get("n")]
        ys = [(row["completeness"] or 0) * 100 for row in rows if row.get("n")]
        if xs:
            n = rows[7]["n"] if len(rows) > 7 else rows[0]["n"]
            ax.plot(xs, ys, color=color, marker="o", markersize=3.5, label=f"{label} (n at 7 days={n})")
    ax.set_xlabel("Days before the showtime")
    ax.set_ylabel("Share already observed")
    ax.set_ylim(0, 105)
    ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda value, _pos: f"{value:.0f}%"))
    ax.legend(frameon=False, fontsize=8)
    _note(ax, title, subtitle)
    fig.tight_layout()
    _save(fig, path)


def _theater_completeness(rows: Sequence[Mapping[str, Any]], path: Path) -> None:
    theaters = []
    for row in rows:
        if row["theater_id"] not in theaters:
            theaters.append(row["theater_id"])
    fig, axes = plt.subplots(4, 2, figsize=(12, 11), sharey=True)
    flat = list(axes.ravel())
    for ax in flat[len(theaters) :]:
        ax.axis("off")
    for ax, theater_id in zip(flat, theaters):
        subset = [row for row in rows if row["theater_id"] == theater_id]
        shares = [(row["completeness"] or 0) * 100 if row["n_screenings"] else 0 for row in subset]
        ax.plot(range(7), shares, marker="o", color=ORD)
        ax.set_xticks(range(7), [name[:3] for name in WEEKDAY_NAMES])
        ax.set_ylim(0, 105)
        name = subset[0]["theater_name"].replace("AMC ", "") if subset else theater_id
        ax.set_title(name, loc="left", fontsize=10, color=INK)
    fig.suptitle(
        "Upcoming-Friday completeness by observation weekday and theater\nShare of that Friday's eventual screenings already present in the snapshot.",
        fontsize=12,
        fontweight="semibold",
        color=INK,
        x=0.02,
        ha="left",
    )
    fig.tight_layout(rect=(0, 0, 1, 0.93))
    _save(fig, path)


def _prime_share(engagements: Sequence[Engagement], as_of: date) -> dict[int, float | None]:
    buckets: dict[int, list[float]] = defaultdict(list)
    for item in engagements:
        if item.last_occurred is None:
            continue
        by_day: dict[date, list] = defaultdict(list)
        for screening in item.screenings:
            if screening.show_date < as_of:
                by_day[screening.show_date].append(screening)
        for offset in range(0, 15):
            day = item.last_occurred - timedelta(days=offset)
            rows = by_day.get(day) or []
            if not rows or day < item.start_date:
                continue
            prime = sum(1 for screening in rows if time_block(screening.minutes) == "prime")
            buckets[offset].append(prime / len(rows))
    medians: dict[int, float | None] = {}
    for offset, values in buckets.items():
        medians[offset] = float(sorted(values)[len(values) // 2]) if values else None
    return medians


def _pick_timelines(result: Mapping[str, Any]) -> list[Engagement]:
    picks: list[Engagement] = []
    rereleases = list(result["rerelease_ann"])
    ordinary = list(result["ordinary_ann"])
    specials = list(result["special_ann"])

    def add(rows: Sequence[Engagement], key, reverse: bool = False) -> None:
        ordered = sorted(rows, key=key, reverse=reverse)
        for item in ordered:
            if item not in picks:
                picks.append(item)
                return

    if rereleases:
        add(rereleases, lambda item: item.share_visible_at_first_observation or 0, reverse=True)
        add(rereleases, lambda item: item.days_added or 0, reverse=True)
        add(rereleases, lambda item: item.days_added if item.days_added is not None else 99)
    if ordinary:
        add(ordinary, lambda item: item.share_visible_at_first_observation or 0)
        add(ordinary, lambda item: item.share_visible_at_first_observation or 0, reverse=True)
    if specials:
        add(specials, lambda item: item.span_days, reverse=True)
    return picks[:6]


def _pick_individuals(result: Mapping[str, Any], as_of: date) -> list[tuple[str, Engagement]]:
    rows = list(result["ordinary_week_plus"])
    picks: list[tuple[str, Engagement]] = []
    if not rows:
        return picks
    longest = max(rows, key=lambda item: (item.span_days, item.screening_count))
    picks.append((f"Long ordinary: {longest.title}", longest))

    def drop(item: Engagement) -> float:
        series = _contraction_series(item, as_of=as_of)
        d7 = series.get(-7)
        d0 = series.get(0)
        if d7 is None or d0 is None:
            return -1
        return d7 - d0

    declining = max(rows, key=drop)
    if all(declining is not item for _label, item in picks):
        picks.append((f"Steeper drop: {declining.title}", declining))
    flat_pool = []
    for item in rows:
        series = _contraction_series(item, as_of=as_of)
        d7 = series.get(-7)
        d0 = series.get(0)
        if d7 is None or d0 is None or d7 < 3:
            continue
        flat_pool.append((abs(d7 - d0), item))
    if flat_pool:
        _gap, flat = min(flat_pool, key=lambda pair: pair[0])
        picks.append((f"Little change D-7 to D0: {flat.title}", flat))
    for item in rows:
        series = _contraction_series(item, as_of=as_of)
        last = [series.get(0), series.get(-1), series.get(-2)]
        if all(value is not None and value <= 1 for value in last):
            picks.append((f"Late 1-show days: {item.title}", item))
            break
    rereleases = [item for item in result["film_theater"] if item.confirmed and item.segment == "rerelease"]
    if rereleases:
        sample = max(rereleases, key=lambda item: item.screening_count)
        picks.append((f"Rerelease: {sample.title}", sample))
    return picks[:6]


def _pick_weeks(rows: Sequence[Mapping[str, Any]]) -> list[Mapping[str, Any]]:
    if not rows:
        return []
    chosen = []
    chosen.append(max(rows, key=lambda row: row["incoming_friday_screenings"]))
    chosen.append(max(rows, key=lambda row: row["incumbent_screenings_lost"]))
    chosen.append(max(rows, key=lambda row: row["net_screening_change"]))
    chosen.append(min(rows, key=lambda row: row["net_screening_change"]))
    unique = []
    seen = set()
    for row in chosen:
        key = (row["theater_id"], row["friday"])
        if key in seen:
            continue
        seen.add(key)
        unique.append(row)
    return unique[:4]


def render_charts(result: Mapping[str, Any], out_dir: Path) -> list[str]:
    _style()
    out_dir.mkdir(parents=True, exist_ok=True)
    q1 = result["q1_plot"]
    summary = result["summary"]["questions"]
    written: list[str] = []

    def keep(path: Path) -> None:
        written.append(path.name)

    path = out_dir / "end_weekday_ordinary.png"
    _bar_weekdays(
        q1["film_theater_ordinary_week_plus"],
        path,
        "Final-showtime weekday, ordinary theatrical runs",
        f"Film × theater. Catalog ordinary, span ≥ 7 days, confirmed ends. n={q1['film_theater_ordinary_week_plus']['n']}.",
    )
    keep(path)
    path = out_dir / "end_weekday_by_segment.png"
    _grouped_weekdays(
        (
            ("Ordinary ≥7d", q1["film_theater_ordinary_week_plus"], ORD),
            ("Catalog rerelease", q1["film_theater_rerelease"], RER),
            ("Catalog special", q1["film_theater_special"], SPE),
            ("Ambiguous rerelease", q1["film_theater_ambiguous_rerelease"], AMB),
        ),
        path,
        "Final-showtime weekday by segment",
        "Confirmed film × theater ends. Ambiguous rows disagree between catalog category and title patterns.",
    )
    keep(path)
    path = out_dir / "end_weekday_market_ordinary.png"
    _bar_weekdays(
        q1["market_ordinary_week_plus"],
        path,
        "Final-showtime weekday, market-level ordinary runs",
        f"Last Seattle AMC showtime anywhere. n={q1['market_ordinary_week_plus']['n']}. Confirmed ends, span ≥ 7 days.",
        color="#355c7d",
    )
    keep(path)
    path = out_dir / "end_weekday_thursday_rate_by_theater.png"
    _theater_thursday(q1["by_theater"], path)
    keep(path)
    path = out_dir / "end_weekday_frontier_vs_confirmed.png"
    _grouped_weekdays(
        (
            ("Confirmed ends", q1["film_theater_ordinary_week_plus"], ORD),
            ("Publication frontier", q1["thursday_among_publication_frontier"], FRN),
            ("Still scheduled (farthest date)", q1["weekday_among_still_scheduled"], "#8899aa"),
        ),
        path,
        "Confirmed endings versus the publication edge",
        "Frontier bars use the last scheduled date of runs that stop where the dense horizon stops. Still-scheduled bars are not endings.",
    )
    keep(path)

    q2 = summary["predetermined_engagements"]
    ordinary_shares = [item.share_visible_at_first_observation for item in result["ordinary_ann"] if item.share_visible_at_first_observation is not None]
    rerelease_shares = [item.share_visible_at_first_observation for item in result["rerelease_ann"] if item.share_visible_at_first_observation is not None]
    path = out_dir / "rerelease_initial_schedule_completeness.png"
    _histogram_compare(
        (
            ("Ordinary", [value * 100 for value in ordinary_shares], ORD),
            ("Catalog rerelease", [value * 100 for value in rerelease_shares], RER),
        ),
        path,
        title="Share of the eventual engagement visible at first observation",
        subtitle="Confirmed film × theater runs whose announcement was seen before opening. 100% means every remaining screening was already listed.",
        xlabel="Percent of eventual screenings visible on the first snapshot",
        bins=list(range(0, 110, 10)),
    )
    keep(path)
    ordinary_added = [float(item.days_added) for item in result["ordinary_ann"] if item.days_added is not None]
    rerelease_added = [float(item.days_added) for item in result["rerelease_ann"] if item.days_added is not None]
    path = out_dir / "rerelease_extension_days.png"
    _histogram_compare(
        (
            ("Ordinary", ordinary_added, ORD),
            ("Catalog rerelease", rerelease_added, RER),
        ),
        path,
        title="Days added beyond the initially observed final date",
        subtitle="Negative values mean the eventual last show was earlier than the first snapshot's last show. Confirmed, announcement-observed runs.",
        xlabel="Days added (eventual last date − initially observed last date)",
        bins=list(range(-14, 49, 2)) if (ordinary_added or rerelease_added) else [0, 1],
    )
    keep(path)
    path = out_dir / "rerelease_extension_rate.png"
    _extension_rate(q2, path)
    keep(path)
    timelines = _pick_timelines(result)
    path = out_dir / "rerelease_engagement_timelines.png"
    _timelines(timelines, path)
    if path.exists():
        keep(path)

    capacity = result["tables"]["theater_day_capacity"]
    by_theater: dict[str, list] = defaultdict(list)
    for row in capacity:
        by_theater[row["theater_id"]].append(row)
    for theater_id, rows in by_theater.items():
        slug = theater_id.replace("-", "_")
        path = out_dir / f"theater_daily_screenings_{slug}.png"
        _theater_series(rows, "screenings", path, "Daily scheduled screenings", "Screenings")
        keep(path)
        path = out_dir / f"theater_distinct_films_{slug}.png"
        _theater_series(rows, "distinct_films", path, "Distinct films per day", "Films")
        keep(path)
    path = out_dir / "theater_screenings_by_weekday.png"
    _box_by_weekday(
        capacity,
        path,
        "screenings",
        "Screenings per day by weekday, dense-horizon days only",
        "Screenings",
    )
    keep(path)
    path = out_dir / "theater_distinct_films_by_weekday.png"
    _box_by_weekday(
        capacity,
        path,
        "distinct_films",
        "Distinct films per day by weekday, dense-horizon days only",
        "Films",
    )
    keep(path)

    transitions = result["tables"]["thursday_friday_transitions"]
    path = out_dir / "thursday_friday_displacement.png"
    _scatter(
        transitions,
        "incoming_friday_screenings",
        "incumbent_screenings_lost",
        path,
        "Incoming Friday screenings and incumbent screenings lost",
        "Friday screenings of films that were not playing Thursday",
        "Thursday screenings lost from departed or reduced films",
        f"One point per theater-week. n={len(transitions)}. The dashed line is equality, not a fitted model.",
    )
    keep(path)
    path = out_dir / "thursday_friday_films_in_vs_out.png"
    _scatter(
        transitions,
        "films_incoming",
        "films_departing",
        path,
        "Incoming films and films departing",
        "Films present Friday but not Thursday",
        "Films present Thursday but not Friday",
        f"One point per theater-week. n={len(transitions)}.",
    )
    keep(path)
    path = out_dir / "thursday_friday_net_volume_change.png"
    _hist_values(
        [float(row["net_screening_change"]) for row in transitions],
        path,
        "Net change in theater screening count, Thursday to Friday",
        "Friday screenings − Thursday screenings",
        f"n={len(transitions)} dense, occurred theater-weeks. Positive means Friday had more screenings.",
    )
    keep(path)
    path = out_dir / "thursday_friday_capacity_sources.png"
    _stacked_means(transitions, path)
    keep(path)
    examples = _pick_weeks(transitions)
    path = out_dir / "thursday_friday_examples.png"
    _examples_bars(examples, path)
    keep(path)

    groups = summary["contraction"]["groups"]
    path = out_dir / "final_14_days_showtime_trajectory.png"
    _trajectory(
        (("Ordinary ≥7 days", groups["ordinary_week_plus"], ORD),),
        path,
        "Median screenings per day before a confirmed theater exit",
        "Aligned on the actual final date. Days before the engagement started are left out of the median.",
        "Median screenings",
    )
    keep(path)
    path = out_dir / "final_14_days_by_segment.png"
    _trajectory(
        (
            ("Ordinary ≥7d", groups["ordinary_week_plus"], ORD),
            ("Ordinary <14d", groups["ordinary_short_under_14"], "#7ea0c4"),
            ("Ordinary ≥28d", groups["ordinary_long_at_least_28"], "#0d2c4a"),
            ("Catalog rerelease", groups["rerelease"], RER),
            ("Catalog special", groups["special_event"], SPE),
        ),
        path,
        "Median screenings before exit, by segment",
        "Same alignment. Short ordinary runs are under 14 days; long runs are at least 28.",
        "Median screenings",
    )
    keep(path)
    path = out_dir / "final_days_showtime_distribution.png"
    _distribution_box(result["ordinary_week_plus"], result["as_of"], path)
    keep(path)
    path = out_dir / "final_14_days_theater_count.png"
    _trajectory(
        (("Market ordinary ≥7d", summary["contraction"]["market_theater_count"], ORD),),
        path,
        "Median theater count before a market-level exit",
        "Ordinary catalog releases, span ≥ 7 days, confirmed market ends. Count of Seattle AMC theaters with a show that day.",
        "Median theaters",
    )
    keep(path)
    individuals = _pick_individuals(result, result["as_of"])
    path = out_dir / "final_14_days_individual_films.png"
    _individual_lines(individuals, result["as_of"], path)
    keep(path)
    prime = _prime_share(result["ordinary_week_plus"], result["as_of"])
    fig, ax = plt.subplots(figsize=(9.2, 5))
    xs = sorted(prime)
    ax.plot([-offset for offset in xs], [((prime[offset] or 0) * 100) for offset in xs], marker="o", color=ORD)
    ax.set_xlabel("Days relative to the confirmed final show")
    ax.set_ylabel("Median share of that day's screenings in prime time")
    ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda value, _pos: f"{value:.0f}%"))
    _note(
        ax,
        "Prime-time share before a confirmed ordinary exit",
        "Prime time is 5:00pm–9:59pm. Ordinary week-plus film × theater runs. Retrospective.",
    )
    fig.tight_layout()
    path = out_dir / "final_14_days_prime_share.png"
    _save(fig, path)
    keep(path)

    q6 = result["q6"]
    path = out_dir / "schedule_completeness_by_observation_weekday.png"
    _completeness_bars(
        q6["by_observation_weekday"],
        path,
        "How complete is the upcoming Friday by the day we look?",
        "Pooled across snapshots. On Friday, the target is that same Friday. Denominator is screenings that remained and have already occurred.",
    )
    keep(path)
    path = out_dir / "schedule_completeness_by_days_before.png"
    _completeness_lines(
        (("All occurred screenings", q6["by_days_before"], INK),),
        path,
        "Schedule completeness by days before the showtime",
        "Share of occurred, non-removed screenings whose first snapshot was at least this many days earlier.",
    )
    keep(path)
    path = out_dir / "schedule_completeness_new_vs_continuing.png"
    _completeness_lines(
        (
            ("Ordinary opening week", q6["ordinary_new_by_days_before"], RER),
            ("Ordinary later weeks", q6["ordinary_continuing_by_days_before"], ORD),
            ("Catalog rereleases", q6["rerelease_by_days_before"], SPE),
        ),
        path,
        "Completeness for new ordinary weeks, later ordinary weeks, and rereleases",
        "Opening week means the screening falls in the first Fri–Thu week of that market engagement. Retrospective.",
    )
    keep(path)
    path = out_dir / "schedule_completeness_by_theater.png"
    _theater_completeness(q6["by_theater_weekday"], path)
    keep(path)
    return written


def _li(items: Sequence[str]) -> str:
    return "".join(f"<li>{html.escape(item)}</li>" for item in items)


def _table(rows: Sequence[Mapping[str, Any]], columns: Sequence[tuple[str, str]], limit: int = 8) -> str:
    head = "".join(f"<th>{html.escape(label)}</th>" for _key, label in columns)
    body = []
    for row in list(rows)[:limit]:
        cells = []
        for key, _label in columns:
            value = row.get(key, "")
            cells.append(f"<td>{html.escape(str(value))}</td>")
        body.append("<tr>" + "".join(cells) + "</tr>")
    return f"<table><thead><tr>{head}</tr></thead><tbody>{''.join(body)}</tbody></table>"


def _img(name: str) -> str:
    return f'<figure><img src="{html.escape(name)}" alt="{html.escape(name)}"><figcaption>{html.escape(name)}</figcaption></figure>'


def _csv_link(name: str) -> str:
    return f'<a href="{html.escape(name)}">{html.escape(name)}</a>'


def render_html(result: Mapping[str, Any], out_dir: Path) -> None:
    summary = result["summary"]
    window = summary["window"]
    counts = summary["counts"]
    q = summary["questions"]
    q1 = q["end_weekday"]
    ordinary = q1["film_theater_ordinary_week_plus"]
    market = q1["market_ordinary_week_plus"]
    q2 = q["predetermined_engagements"]
    q4 = q["displacement"]
    q5 = q["contraction"]["ordinary_week_plus"]
    q6 = q["completeness"]["by_observation_weekday"]
    by_day = {row["weekday"]: row for row in q6}

    def fact_end() -> list[str]:
        return [
            f"Observed: {_pct(ordinary['thursday_share'])} of confirmed ordinary film×theater runs with span ≥ 7 days end on Thursday (n={ordinary['n']}). Wilson interval {_pct(ordinary['thursday_wilson_low'])}–{_pct(ordinary['thursday_wilson_high'])}.",
            f"Observed Wednesday share in that same population: {_pct(next((row['share'] for row in ordinary['by_weekday'] if row['weekday']=='Wednesday'), None))} ({next((row['count'] for row in ordinary['by_weekday'] if row['weekday']=='Wednesday'), 0)} runs). Friday / Saturday / Sunday: {_pct(ordinary['friday_share'])} / {_pct(ordinary['saturday_share'])} / {_pct(ordinary['sunday_share'])}.",
            "Observed theater Thursday shares differ. See end_weekday_thursday_rate_by_theater.png. The non-Thursday remainder at the low-Thursday theaters is mostly Wednesday.",
            f"Observed market-level ordinary week-plus Thursday share: {_pct(market['thursday_share'])} (n={market['n']}).",
            f"Observed catalog-rerelease Thursday share: {_pct(q1['film_theater_rerelease']['thursday_share'])} (n={q1['film_theater_rerelease']['n']}). Catalog specials: {_pct(q1['film_theater_special']['thursday_share'])} (n={q1['film_theater_special']['n']}).",
            f"Among publication-frontier cases, n={q1['thursday_among_publication_frontier']['n']}. The dense horizon in this window sits after as-of, so historical endings are not censored for an unpublished next week. Still-scheduled runs, weekday of the farthest booked date: Thursday {_pct(q1['weekday_among_still_scheduled']['thursday_share'])} (n={q1['weekday_among_still_scheduled']['n']}).",
            f"Of the confirmed ordinary week-plus exits, {_pct(ordinary['next_friday_published_share'])} have the next programming Friday already published at the theater (n={ordinary['next_friday_published_n']} of {ordinary['n']}).",
        ]

    non_thu = result["tables"]["end_weekday_non_thursday_examples"]
    weekday_order = {"Friday": 0, "Saturday": 1, "Sunday": 2, "Monday": 3, "Tuesday": 4, "Wednesday": 5}
    non_thu_view = sorted(
        non_thu,
        key=lambda row: (weekday_order.get(row["end_weekday"], 9), row["end_date"], row["title"]),
    )
    tuesday_rows = [row for row in non_thu if row["end_weekday"] == "Tuesday"]
    end_facts = fact_end()
    if tuesday_rows:
        from collections import Counter

        top_date, top_count = Counter(row["end_date"] for row in tuesday_rows).most_common(1)[0]
        note = (
            f"The {len(tuesday_rows)} Tuesday endings in the ordinary week-plus set "
            f"concentrate on {top_date} ({top_count} of them)."
        )
        if top_date == "2026-09-08":
            note += " That date is the day after Labor Day 2026."
        end_facts.append(note)
    announcements = result["tables"]["rerelease_engagements"]
    ambiguous = [row for row in result["tables"]["ambiguous_segments"] if "rerelease" in row["segment"] or "special" in row["segment"]]
    outliers = sorted(result["tables"]["capacity_outlier_days"], key=lambda row: row["screenings"])[:8]
    weeks = _pick_weeks(result["tables"]["thursday_friday_transitions"])
    individuals = _pick_individuals(result, result["as_of"])

    def section(number: str, question: str, facts: Sequence[str], images: Sequence[str], caveats: Sequence[str], csvs: Sequence[str], examples_html: str) -> str:
        imgs = "".join(_img(name) for name in images)
        links = ", ".join(_csv_link(name) for name in csvs)
        return f"""
        <section id="q{number}">
          <h2>{number}. {html.escape(question)}</h2>
          <h3>Observed figures</h3>
          <ul>{_li(facts)}</ul>
          {imgs}
          <h3>Examples</h3>
          {examples_html}
          <h3>Caveats</h3>
          <ul>{_li(caveats)}</ul>
          <p class="files">Inspection tables: {links}</p>
        </section>
        """

    implication_rows = "".join(
        "<tr>"
        f"<td>{html.escape(item['pattern'])}</td>"
        f"<td><code>{html.escape(item['provisional_label'])}</code></td>"
        f"<td>{html.escape(item['evidence'])}</td>"
        f"<td>{html.escape(str(item['n']))}</td>"
        "</tr>"
        for item in summary["candidate_implications"]
    )
    horizon_bits = ", ".join(
        f"{name.replace('AMC ', '')}: {window['dense_horizons'].get(tid) or 'n/a'}"
        for tid, name in result["theater_names"].items()
    )
    page = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Leaving Soon scheduling assumptions audit</title>
  <style>
    body {{ font-family: Georgia, "Iowan Old Style", serif; color: #1c2430; margin: 0; background: #f6f4ef; }}
    main {{ max-width: 1080px; margin: 0 auto; padding: 32px 20px 80px; }}
    h1 {{ font-size: 2rem; line-height: 1.2; margin-bottom: 0.2rem; }}
    h2 {{ font-size: 1.45rem; margin-top: 2.4rem; border-top: 1px solid #d9d3c7; padding-top: 1.2rem; }}
    h3 {{ font-size: 1.05rem; margin-top: 1.3rem; }}
    p, li {{ line-height: 1.45; }}
    .lede {{ font-size: 1.05rem; max-width: 46rem; }}
    .meta {{ color: #5c6770; font-family: "Segoe UI", sans-serif; font-size: 0.92rem; }}
    figure {{ margin: 1.2rem 0; background: white; border: 1px solid #e4ded2; padding: 8px; }}
    img {{ width: 100%; height: auto; }}
    figcaption {{ font-family: "Segoe UI", sans-serif; font-size: 0.82rem; color: #5c6770; }}
    table {{ border-collapse: collapse; width: 100%; background: white; font-family: "Segoe UI", sans-serif; font-size: 0.88rem; }}
    th, td {{ border-bottom: 1px solid #e4ded2; text-align: left; padding: 6px 8px; vertical-align: top; }}
    th {{ background: #efeae1; }}
    code {{ font-family: Consolas, monospace; }}
    a {{ color: #1f4e79; }}
    .files {{ font-family: "Segoe UI", sans-serif; font-size: 0.9rem; }}
  </style>
</head>
<body>
<main>
  <h1>Leaving Soon scheduling assumptions</h1>
  <p class="lede">A visual review of historical Seattle AMC schedules. The charts describe what the ledger shows. They do not change the production Leaving Soon model.</p>
  <p class="meta">Observation window {html.escape(str(window['dataset_start']))} → {html.escape(str(window['dataset_end']))}. As-of {html.escape(str(window['as_of']))}. Base commit {html.escape(str(summary.get('base_commit') or ''))}.</p>
  <p class="meta">Snapshots: {window['snapshot_days']} days, {window['complete_snapshot_days']} complete, {window['unknown_snapshot_days']} unknown (records present, <code>restate_safe</code> missing). Missing calendar days: {len(window['missing_calendar_days'])}. First complete snapshot: {html.escape(str(window['first_complete_snapshot']))}.</p>
  <p class="meta">Film×theater engagements {counts['film_theater_engagements']}. Confirmed film×theater ends {counts['confirmed_film_theater']}. Confirmed market ends {counts['confirmed_market']}. Catalog rerelease engagements {counts['confident_rerelease_engagements']}. Catalog special engagements {counts['confident_special_engagements']}.</p>

  <h2>How to read this</h2>
  <ul>
    <li>A confirmed end means the run has no later scheduled showtime and its last occurred show is strictly before that theater's dense publication horizon. Runs still on the schedule, and runs that stop where the published calendar stops, stay censored.</li>
    <li>Film×theater is one booking at one AMC. Market-level is the last Seattle AMC showtime for that source film id, across theaters.</li>
    <li>Catalog <code>presentation.category</code> identifies confident rereleases and specials. Title patterns that disagree with a standard catalog category are in the ambiguous tables, not in the primary percentages.</li>
    <li>Charts that line runs up by their eventual final date, or that compare an initial announcement with the eventual schedule, are retrospective. They use information that would not be known on a prediction date.</li>
  </ul>
  <h3>Prior work this audit does not replace</h3>
  <ul>
    <li><code>docs/leaving-soon-lifecycle-audit.md</code> and <code>reel_seattle/analysis/amc_run_lifecycle.py</code> already define source-film run identity, 14-day dark-gap splits, and right-censoring for remaining-days labels.</li>
    <li><code>docs/leaving-soon-model-design.md</code> and <code>reel_seattle/analysis/amc_booking_cycle.py</code> measure which weekday a visible horizon extension is first observed. In that older window, Thursday was about 9.5–10.3% of extension observations. That is not the weekday of a run's final showtime.</li>
    <li><code>docs/leaving-soon-survival-model-v1.md</code> reports segment performance. Rereleases were the weaker slice. It does not reconstruct whether an engagement was published in full on day one.</li>
  </ul>
  <p class="meta">Dense horizons used for censoring: {html.escape(horizon_bits)}.</p>
  <p class="meta">History cross-check, same window and enabled theaters: showtimes_history.csv has {window['history_occurred_showtime_rows']} past non-canceled AMC rows. The lifecycle has {window['lifecycle_occurred_screenings']} occurred screenings. The history file restates the forward window and is not used to decide end dates. Counts can still differ when a history row and a lifecycle screening are not the same grain.</p>

  {section(
      "1",
      "What day of the week do theatrical runs actually end?",
      end_facts,
      [
          "end_weekday_ordinary.png",
          "end_weekday_by_segment.png",
          "end_weekday_market_ordinary.png",
          "end_weekday_thursday_rate_by_theater.png",
          "end_weekday_frontier_vs_confirmed.png",
      ],
      [
          "Primary ordinary bars keep runs that span at least 7 days. All-length ordinary confirmed ends are in completed_film_theater_runs.csv (segment=ordinary).",
          "A Thursday end is counted only when the next dense schedule at that theater continues past it. The frontier chart is the place to see dates that merely sit on the unpublished edge.",
          "Left-truncated runs that were already playing on the first snapshot can still contribute an end date. They are flagged left_truncated in the CSV.",
          "Small theater samples have wide Wilson intervals. The interval is drawn on the per-theater chart.",
      ],
      ["completed_film_theater_runs.csv", "completed_market_runs.csv", "end_weekday_non_thursday_examples.csv", "censored_film_theater_runs.csv"],
      _table(non_thu_view, [("title", "Title"), ("theater_name", "Theater"), ("end_date", "Last show"), ("end_weekday", "Weekday"), ("span_days", "Span (days)"), ("segment", "Segment")])
      + "<p>Non-Thursday ordinary week-plus exits. The CSV has the full list.</p>",
  )}

  {section(
      "2",
      "When a rerelease or special engagement is first announced, is the whole run already on the schedule?",
      [
          f"Observed catalog rereleases with a pre-opening announcement and a confirmed end: n={q2['rerelease']['n']}. Median share of eventual screenings already visible: {_pct(q2['rerelease']['median_share_visible'])}. Extension rate: {_pct(q2['rerelease']['extension_rate'])}. Median days added: {_num(q2['rerelease']['median_days_added'])}.",
          f"Observed ordinary releases in the same filter: n={q2['ordinary']['n']}. Median share visible: {_pct(q2['ordinary']['median_share_visible'])}. Extension rate: {_pct(q2['ordinary']['extension_rate'])}. Median days added: {_num(q2['ordinary']['median_days_added'])}.",
          f"Observed catalog specials: n={q2['special_event']['n']}. Median share visible: {_pct(q2['special_event']['median_share_visible'])}. Extension rate: {_pct(q2['special_event']['extension_rate'])}.",
          f"Ambiguous rerelease engagements (catalog standard, title looks like a rerelease, or the reverse title-only case in the ambiguous file): announcement-confirmed n={q2['ambiguous_rerelease']['n']}. All ambiguous/title-only engagement rows are in ambiguous_segments.csv.",
          "Removal counts in the engagement CSV are lower bounds. The ledger infers a disappearance only from a later complete snapshot, which starts on the first complete day in this window.",
      ],
      [
          "rerelease_initial_schedule_completeness.png",
          "rerelease_extension_days.png",
          "rerelease_extension_rate.png",
          "rerelease_engagement_timelines.png",
      ],
      [
          "Confident rereleases are catalog category anniversary_or_rerelease. Title keywords alone do not enter that bar.",
          "The catalog category is the current product record, not a snapshot of the category on the announcement date.",
          "Engagements already underway on the first collection day are excluded from these percentages.",
          "Share visible ignores screenings that were later removed. Added dates are show dates that appear only on a later snapshot.",
      ],
      ["rerelease_engagements.csv", "engagement_announcements.csv", "ambiguous_segments.csv"],
      _table(
          [row for row in announcements if row["segment"] == "rerelease"],
          [
              ("title", "Title"),
              ("theater_name", "Theater"),
              ("start_date", "First show"),
              ("end_date", "Last show"),
              ("share_visible_at_first_observation", "Share visible"),
              ("days_added", "Days added"),
              ("extended", "Extended"),
              ("end_status", "End status"),
          ],
          limit=12,
      ),
  )}

  {section(
      "3",
      "How fixed is each theater's programming capacity?",
      [
          "Each theater has its own daily-screenings chart and a distinct-films chart. The dashed line is that theater's dense horizon.",
          f"Dense-horizon outlier days (below that theater-weekday p10 or above p90, n≥4): {q['capacity']['outlier_count']}.",
          "Weekday boxplots use dense days only, so the unpublished tail is not in the boxes.",
          "Screenings per inferred auditorium are in theater_day_capacity.csv. The auditorium count is the number at the end of the theater id, not a checked screen list.",
      ],
      ["theater_screenings_by_weekday.png", "theater_distinct_films_by_weekday.png"]
      + [f"theater_daily_screenings_{tid.replace('-', '_')}.png" for tid in result["theater_names"]]
      + [f"theater_distinct_films_{tid.replace('-', '_')}.png" for tid in result["theater_names"]],
      [
          "A low day inside the dense window can be a holiday, a scrape that still had records, or a real programming change. Holiday-adjacent dates are marked on the time series and in the outlier CSV.",
          "Snapshots before the first complete day are completeness=unknown. They still contribute showtimes that were present. They are not treated as outages.",
          "Distinct-film counts move more than screening counts when the booth count is steady and the mix changes.",
      ],
      ["theater_day_capacity.csv", "theater_weekday_capacity_summary.csv", "capacity_outlier_days.csv"],
      _table(outliers, [("show_date", "Date"), ("weekday", "Weekday"), ("theater_name", "Theater"), ("screenings", "Screenings"), ("direction", "Vs p10/p90"), ("holiday_note", "Holiday note"), ("distinct_films", "Films")]),
  )}

  {section(
      "4",
      "Does incoming Friday programming line up with displacement of existing films?",
      [
          f"Observed theater-weeks inside the dense horizon: n={q4['n_weeks']}.",
          f"Spearman rank correlation, incoming Friday screenings vs incumbent screenings lost: {_num(q4['spearman_incoming_vs_incumbent_lost'], 2)}.",
          f"Spearman rank correlation, incoming films vs departing films: {_num(q4['spearman_incoming_films_vs_departing_films'], 2)}.",
          f"Median Friday-minus-Thursday screening change: {_num(q4['median_net_change'])}. Mean incoming screenings {_num(q4['mean_incoming'])}. Mean incumbent screenings lost {_num(q4['mean_incumbent_lost'])}.",
          "The dashed line on the scatter is y = x, drawn so a one-for-one pattern is easy to see. It is not a fitted slope.",
      ],
      [
          "thursday_friday_displacement.png",
          "thursday_friday_films_in_vs_out.png",
          "thursday_friday_net_volume_change.png",
          "thursday_friday_capacity_sources.png",
          "thursday_friday_examples.png",
      ],
      [
          "Association is not a claim that new films cause the Thursday losses. Both sides are pieces of one published schedule.",
          "Incumbent screenings lost combine films that disappear entirely and continuing films that keep fewer showtimes.",
          "Weeks are skipped when Thursday or Friday falls outside that theater's dense horizon.",
      ],
      ["thursday_friday_transitions.csv"],
      _table(weeks, [("theater_name", "Theater"), ("friday", "Friday"), ("thursday_screenings", "Thu shows"), ("friday_screenings", "Fri shows"), ("films_incoming", "Films in"), ("films_departing", "Films out"), ("incoming_friday_screenings", "Incoming shows"), ("incumbent_screenings_lost", "Incumbent shows lost"), ("net_screening_change", "Net")]),
  )}

  {section(
      "5",
      "What contraction patterns show up before a confirmed departure?",
      [
          f"Ordinary week-plus film×theater trajectories: n={q5['n']}. Median screenings D-14={_num(q5['median_d14'])}, D-7={_num(q5['median_d7'])}, D-3={_num(q5['median_d3'])}, D-1={_num(q5['median_d1'])}, D0={_num(q5['median_d0'])}.",
          f"Share with at most one screening on D0: {_pct(q5['share_d0_at_most_one'])}. Share whose last three in-run days are each at most one screening: {_pct(q5['share_last_three_days_at_most_one'])}.",
          f"Share whose final in-run week has screenings only on Friday–Sunday: {_pct(q5['share_weekend_only_final_week'])}.",
          f"Market-level ordinary week-plus theater-count path: n={q['contraction']['market_theater_count']['n']}.",
          f"Premium-format screenings (IMAX, Dolby, RealD/3D, Prime labels) are { _pct(q['contraction']['premium_share_of_screenings']) } of non-removed screenings. The prime-time chart is the within-day mix, not the premium-format mix.",
      ],
      [
          "final_14_days_showtime_trajectory.png",
          "final_14_days_by_segment.png",
          "final_days_showtime_distribution.png",
          "final_14_days_theater_count.png",
          "final_14_days_individual_films.png",
          "final_14_days_prime_share.png",
      ],
      [
          "These paths are aligned on the eventual end date. A model feature would have to be computed without knowing that date.",
          "Days before a short run starts are omitted, so early offsets have smaller n than D0. The distribution chart prints that n.",
          "A flat average can hide a split between runs that drop and runs that hold a steady booth until the last day. The individual chart is there for that.",
      ],
      ["completed_film_theater_runs.csv"],
      "<ul>"
      + _li([f"{label} — {item.theater_id}, {item.start_date.isoformat()} to {item.end_date.isoformat()}, span {item.span_days} days" for label, item in individuals])
      + "</ul>",
  )}

  {section(
      "6",
      "How complete are AMC schedules by the day we observe them?",
      [
          f"Observed pooled completeness of the upcoming Friday: Monday {_pct((by_day.get('Monday') or {}).get('completeness'))} (n={(by_day.get('Monday') or {}).get('n_screenings')}), Tuesday {_pct((by_day.get('Tuesday') or {}).get('completeness'))} (n={(by_day.get('Tuesday') or {}).get('n_screenings')}), Wednesday {_pct((by_day.get('Wednesday') or {}).get('completeness'))} (n={(by_day.get('Wednesday') or {}).get('n_screenings')}), Thursday {_pct((by_day.get('Thursday') or {}).get('completeness'))} (n={(by_day.get('Thursday') or {}).get('n_screenings')}).",
          f"Friday observations in this chart refer to that same Friday: {_pct((by_day.get('Friday') or {}).get('completeness'))} (n={(by_day.get('Friday') or {}).get('n_screenings')}).",
          "The days-before chart is every occurred screening, not only Fridays.",
          "New ordinary weeks, later ordinary weeks, and catalog rereleases are separate lines so a publication pattern is not mixed with a run-type pattern.",
      ],
      [
          "schedule_completeness_by_observation_weekday.png",
          "schedule_completeness_by_days_before.png",
          "schedule_completeness_new_vs_continuing.png",
          "schedule_completeness_by_theater.png",
      ],
      [
          "The denominator is closed: Friday screenings that were not removed and whose date is already before as-of. A future Friday can still gain screenings, so those dates are left out.",
          "Unknown-completeness snapshots still count as observations of what was listed. They do not count as proof that something was removed.",
          "A blank next week on a Monday snapshot is compatible with the Monday completeness figure above. It is not, by itself, an observed exit.",
      ],
      ["schedule_completeness_by_observation.csv"],
      "<p>Theater panels are in schedule_completeness_by_theater.png. A large gap between theaters on the same weekday is visible there as a different line shape.</p>",
  )}

  <h2>Candidate implications to review</h2>
  <p>Each label is a sorting aid for a person reading the charts. It is not a production rule, a threshold change, or a claim that the pattern should be hardcoded.</p>
  <table>
    <thead><tr><th>Pattern</th><th>Provisional label</th><th>Evidence the label used</th><th>n</th></tr></thead>
    <tbody>{implication_rows}</tbody>
  </table>

  <h2>Data-quality notes</h2>
  <ul>
    <li>Daily logs run {html.escape(str(window['dataset_start']))} through {html.escape(str(window['dataset_end']))} with {len(window['missing_calendar_days'])} missing dates. Complete-snapshot removals start {html.escape(str(window['first_complete_snapshot']))}. Before that, absence is not treated as a cancellation.</li>
    <li>Occurred means the show date is strictly before as-of ({html.escape(str(window['as_of']))}). The as-of snapshot is an early-morning scrape, so that calendar day is still future.</li>
    <li>Film identity prefers AMC <code>source_film_id</code>. Title-only rows are a separate low-confidence segment and are not merged into a numeric movie id.</li>
    <li>Enabled Seattle-area AMC theaters only. A film leaving one theater can continue at another; those are different rows.</li>
    <li>{html.escape(window['removal_inference'])}</li>
  </ul>
</main>
</body>
</html>
"""
    (out_dir / "index.html").write_text(page, encoding="utf-8")
    del ambiguous


def write_outputs(result: dict[str, Any], out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    for name, rows in result["tables"].items():
        write_csv(out_dir / f"{name}.csv", rows)
    render_charts(result, out_dir)
    summary_path = out_dir / "summary.json"
    summary_path.write_text(json.dumps(json_ready(result["summary"]), indent=2), encoding="utf-8")
    render_html(result, out_dir)
