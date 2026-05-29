#!/usr/bin/env python3
"""
Export AMC showtimes from showtimes_history.csv for the marathon planner UI.
The browser computes marathon options for the selected date and theater.

Edit BLACKLIST and PREFERRED_MOVIES below, then run after scraping (or npm run marathon).
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import shutil
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

# ---------------------------------------------------------------------------
# Hardcode titles exactly as they appear in the CSV "Film" column (case-sensitive).
# ---------------------------------------------------------------------------

BLACKLIST: list[str] = [
    "The Devil Wears Prada 2",
    "Project Hail Mary",
    "Obsession",
    "Michael"
]

PREFERRED_MOVIES: list[str] = [
    # "Project Hail Mary",
    # "Godzilla Minus One",
]

# ---------------------------------------------------------------------------
# GitHub Pages: leave "" for a dedicated repo root, or e.g. "marathon" to publish
# at https://YOUR_USER.github.io/YOUR_SITE/marathon/ on an existing site repo.
# ---------------------------------------------------------------------------

# Deploy bundle under public/marathon (copied to dist/ on Vite build).
DEPLOY_SUBDIR: str = "marathon"

# ---------------------------------------------------------------------------

ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = ROOT.parent.parent
PUBLIC_DIR = PROJECT_ROOT / "public"
STATIC_DIR = ROOT / "static"
SHOWTIMES_HISTORY_CSV = PUBLIC_DIR / "data" / "showtimes_history.csv"
DEFAULT_THEATER = "AMC Pacific Place 11"
JSON_ALL_OUT = ROOT / "marathon_options_all.json"


def deploy_dir(base: Path | None = None) -> Path:
    root = base if base is not None else ROOT
    if not DEPLOY_SUBDIR or DEPLOY_SUBDIR.strip() in (".", "/"):
        return root
    return root / DEPLOY_SUBDIR.strip().strip("/\\")


def deploy_paths(base: Path | None = None) -> dict[str, Path]:
    d = deploy_dir(base)
    return {
        "showtimes": d / "marathon_showtimes.json",
        "html": d / "marathon_planner.html",
        "index": d / "index.html",
        "js": d / "marathon.js",
        "nojekyll": d / ".nojekyll",
    }


def write_deploy_bundle(showtimes_payload: dict, base: Path) -> dict[str, Path]:
    paths = deploy_paths(base)
    paths["showtimes"].parent.mkdir(parents=True, exist_ok=True)
    paths["showtimes"].write_text(
        json.dumps(showtimes_payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    for name in ("index.html", "marathon.js"):
        src = STATIC_DIR / name
        if not src.exists():
            raise FileNotFoundError(f"Missing static asset: {src}")
        shutil.copy2(src, paths["showtimes"].parent / name)
    shutil.copy2(STATIC_DIR / "index.html", paths["html"])
    paths["nojekyll"].touch(exist_ok=True)
    return paths


DAY_START_MIN = 10 * 60  # 10:00 AM — left edge of timeline bar
DAY_END_MIN = 24 * 60  # midnight


@dataclass(frozen=True)
class Showtime:
    id: int
    date: str
    time: str
    theater: str
    film: str
    runtime: int
    poster: str
    start_min: int
    end_min: int

    @property
    def start_label(self) -> str:
        return minutes_to_label(self.start_min)

    @property
    def end_label(self) -> str:
        return minutes_to_label(self.end_min)


def parse_time_to_minutes(time_str: str) -> int:
    normalized = re.sub(r"\s+", "", time_str.strip())
    m = re.match(r"^(\d{1,2}):(\d{2})(AM|PM)$", normalized, re.IGNORECASE)
    if not m:
        raise ValueError(f"Unrecognized time format: {time_str!r}")
    hour, minute, meridiem = int(m.group(1)), int(m.group(2)), m.group(3).upper()
    if meridiem == "AM":
        if hour == 12:
            hour = 0
    else:
        if hour != 12:
            hour += 12
    return hour * 60 + minute


def minutes_to_label(total_min: int) -> str:
    h, m = divmod(total_min, 60)
    h = h % 24
    meridiem = "AM" if h < 12 else "PM"
    display = h % 12
    if display == 0:
        display = 12
    return f"{display}:{m:02d} {meridiem}"


def format_duration(minutes: int) -> str:
    h, m = divmod(minutes, 60)
    if h and m:
        return f"{h}h {m}m"
    if h:
        return f"{h}h"
    return f"{m}m"


def parse_showtime_date(date_str: str) -> datetime.date:
    month, day, year = map(int, date_str.split("/"))
    return datetime(year, month, day).date()


def is_amc_row(row: dict[str, str]) -> bool:
    if row.get("source", "").strip().lower() == "amc":
        return True
    return row.get("Theater", "").strip().startswith("AMC ")


def is_truthy_flag(value: str) -> bool:
    return str(value).strip().lower() in ("true", "1", "yes")


def load_amc_showtimes_from_history(
    path: Path,
    *,
    future_only: bool = True,
) -> list[Showtime]:
    today = datetime.now().date()
    rows: list[Showtime] = []
    with path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for i, row in enumerate(reader):
            if not is_amc_row(row):
                continue
            if is_truthy_flag(row.get("isCanceled", "")):
                continue
            date_str = row.get("Date", "").strip()
            if not date_str:
                continue
            try:
                show_date = parse_showtime_date(date_str)
            except ValueError:
                continue
            if future_only and show_date < today:
                continue
            runtime_raw = row.get("Runtime", "").strip()
            if not runtime_raw or runtime_raw == "Unknown":
                continue
            try:
                runtime = int(runtime_raw)
            except ValueError:
                continue
            time_str = row.get("Time", "").strip()
            if not time_str:
                continue
            try:
                start = parse_time_to_minutes(time_str)
            except ValueError:
                continue
            poster = (row.get("posterDynamic") or "").strip()
            rows.append(
                Showtime(
                    id=i,
                    date=date_str,
                    time=time_str,
                    theater=row["Theater"].strip(),
                    film=row["Film"].strip(),
                    runtime=runtime,
                    poster=poster,
                    start_min=start,
                    end_min=start + runtime,
                )
            )
    return rows


def build_showtimes_export(showtimes: list[Showtime]) -> dict:
    dates = sorted({s.date for s in showtimes}, key=lambda d: parse_showtime_date(d))
    theaters = sorted({s.theater for s in showtimes})
    default_date = dates[0] if dates else ""
    default_theater = (
        DEFAULT_THEATER
        if DEFAULT_THEATER in theaters
        else (theaters[0] if theaters else "")
    )
    return {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "source_csv": SHOWTIMES_HISTORY_CSV.name,
        "blacklist": BLACKLIST,
        "preferred_movies": PREFERRED_MOVIES,
        "day_window": {"start_min": DAY_START_MIN, "end_min": DAY_END_MIN},
        "default_date": default_date,
        "default_theater": default_theater,
        "dates": dates,
        "theaters": theaters,
        "showtimes": [
            {
                "id": s.id,
                "date": s.date,
                "time": s.time,
                "theater": s.theater,
                "film": s.film,
                "runtime": s.runtime,
                "poster": s.poster,
                "start_min": s.start_min,
                "end_min": s.end_min,
            }
            for s in showtimes
        ],
    }


def export_marathon_planner(base: Path | None = None) -> dict[str, Path]:
    """Build marathon_showtimes.json and copy static UI into public/marathon."""
    if not SHOWTIMES_HISTORY_CSV.exists():
        raise FileNotFoundError(f"Showtimes history not found: {SHOWTIMES_HISTORY_CSV}")
    showtimes = load_amc_showtimes_from_history(SHOWTIMES_HISTORY_CSV)
    payload = build_showtimes_export(showtimes)
    target_base = base if base is not None else PUBLIC_DIR
    return write_deploy_bundle(payload, target_base)


def can_follow(prev: Showtime, nxt: Showtime, films_seen: set[str]) -> bool:
    return nxt.start_min >= prev.end_min and nxt.film not in films_seen


def find_all_marathons(showtimes: list[Showtime]) -> list[list[Showtime]]:
    chains: list[list[Showtime]] = []

    def dfs(path: list[Showtime], films_seen: set[str], start_idx: int) -> None:
        last = path[-1]
        for j in range(start_idx, len(showtimes)):
            cand = showtimes[j]
            if can_follow(last, cand, films_seen):
                dfs(path + [cand], films_seen | {cand.film}, j + 1)
        if len(path) >= 2:
            chains.append(path)

    for i, st in enumerate(showtimes):
        dfs([st], {st.film}, i + 1)

    return chains


def chain_key(chain: list[Showtime]) -> tuple:
    return tuple(s.id for s in chain)


def films_key(chain: list[Showtime]) -> tuple:
    return tuple(s.film for s in chain)


def filter_chains(chains: list[list[Showtime]]) -> list[list[Showtime]]:
    if not PREFERRED_MOVIES:
        return chains
    preferred = set(PREFERRED_MOVIES)
    return [c for c in chains if any(s.film in preferred for s in c)]


def dedupe_by_film_lineup(
    chains: list[list[Showtime]],
) -> tuple[list[list[Showtime]], dict[tuple, int]]:
    """
    For each unique film order, keep the schedule with the shortest total day span.
    Returns deduped chains and alternate-count per film lineup.
    """
    best: dict[tuple, tuple[int, list[Showtime]]] = {}
    counts: dict[tuple, int] = defaultdict(int)

    for chain in chains:
        key = films_key(chain)
        counts[key] += 1
        span = chain[-1].end_min - chain[0].start_min
        if key not in best or span < best[key][0]:
            best[key] = (span, chain)

    deduped = [pair[1] for pair in sorted(best.values(), key=lambda p: p[0])]
    return deduped, dict(counts)


def summarize_chain(chain: list[Showtime], alternates: int = 1) -> dict:
    first, last = chain[0], chain[-1]
    total_span = last.end_min - first.start_min
    film_runtime = sum(s.runtime for s in chain)
    gap_time = total_span - film_runtime
    return {
        "movie_count": len(chain),
        "total_span_min": total_span,
        "total_span_label": format_duration(total_span),
        "film_runtime_min": film_runtime,
        "film_runtime_label": format_duration(film_runtime),
        "gap_time_min": gap_time,
        "gap_time_label": format_duration(gap_time),
        "alternate_count": alternates,
        "start": first.start_label,
        "end": last.end_label,
        "start_min": first.start_min,
        "end_min": last.end_min,
        "films": [s.film for s in chain],
        "movies": [
            {
                "film": s.film,
                "time": s.time,
                "start": s.start_label,
                "end": s.end_label,
                "start_min": s.start_min,
                "end_min": s.end_min,
                "runtime": s.runtime,
                "runtime_label": format_duration(s.runtime),
                "theater": s.theater,
            }
            for s in chain
        ],
    }


def build_poster_lookup(showtimes: list[Showtime]) -> dict[str, str]:
    posters: dict[str, str] = {}
    for s in showtimes:
        posters.setdefault(s.film, s.poster)
    return posters


def build_payload(
    display_chains: list[list[Showtime]],
    alternate_counts: dict[tuple, int],
    all_chain_count: int,
    posters: dict[str, str],
    date: str,
) -> dict:
    options = [
        summarize_chain(c, alternates=alternate_counts.get(films_key(c), 1))
        for c in display_chains
    ]
    max_movies = max((o["movie_count"] for o in options), default=0)
    return {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "source_csv": SHOWTIMES_HISTORY_CSV.name,
        "date": date,
        "blacklist": BLACKLIST,
        "preferred_movies": PREFERRED_MOVIES,
        "day_window": {"start_min": DAY_START_MIN, "end_min": DAY_END_MIN},
        "posters": posters,
        "all_combinations_count": all_chain_count,
        "display_options_count": len(options),
        "max_movies_in_one_day": max_movies,
        "note": (
            "Each card is a unique film lineup using the tightest same-day schedule. "
            "'alternate_count' is how many distinct showtime combinations exist for that lineup."
        ),
        "options": options,
    }



def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--all",
        action="store_true",
        help="Also write marathon_options_all.json (legacy precomputed export; slow)",
    )
    args = parser.parse_args()

    paths = export_marathon_planner()
    payload_path = paths["showtimes"]
    payload = json.loads(payload_path.read_text(encoding="utf-8"))

    if args.all:
        blacklist_set = set(BLACKLIST)
        showtimes = [
            Showtime(
                id=s["id"],
                date=s["date"],
                time=s["time"],
                theater=s["theater"],
                film=s["film"],
                runtime=s["runtime"],
                poster=s.get("poster", ""),
                start_min=s["start_min"],
                end_min=s["end_min"],
            )
            for s in payload["showtimes"]
            if s["film"] not in blacklist_set
        ]
        posters = build_poster_lookup(showtimes)
        chains = find_all_marathons(showtimes)
        chains = filter_chains(chains)
        seen_ids: set[tuple] = set()
        unique_chains: list[list[Showtime]] = []
        for chain in chains:
            key = chain_key(chain)
            if key not in seen_ids:
                seen_ids.add(key)
                unique_chains.append(chain)
        display_chains, alternate_counts = dedupe_by_film_lineup(unique_chains)
        date = display_chains[0][0].date if display_chains else ""
        all_payload = build_payload(
            display_chains,
            alternate_counts,
            all_chain_count=len(unique_chains),
            posters=posters,
            date=date,
        )
        all_payload["note"] = "Full export: every distinct showtime-id combination."
        all_payload["options"] = [
            summarize_chain(c, alternates=1)
            for c in sorted(
                unique_chains,
                key=lambda c: (c[-1].end_min - c[0].start_min, -len(c)),
            )
        ]
        all_payload["display_options_count"] = len(unique_chains)
        JSON_ALL_OUT.write_text(json.dumps(all_payload), encoding="utf-8")
        print(f"Wrote {JSON_ALL_OUT.name} ({len(unique_chains)} combos)")

    print(f"Loaded {len(payload['showtimes'])} future AMC showtimes")
    print(f"  {len(payload['dates'])} dates, {len(payload['theaters'])} theaters")
    rel = paths["index"].relative_to(PROJECT_ROOT)
    print(f"Wrote deploy files to {rel.parent}/")
    if DEPLOY_SUBDIR:
        print(f"  Site path: /{DEPLOY_SUBDIR.strip('/')}/  (e.g. www.reelseattle.com/marathon/)")
    print(
        f"  {paths['index'].name}, {paths['html'].name}, "
        f"{paths['showtimes'].name}, {paths['js'].name}"
    )


if __name__ == "__main__":
    main()
