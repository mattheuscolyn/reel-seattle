#!/usr/bin/env python3
"""
Export AMC showtimes from showtimes_current.json for the marathon planner UI.
The browser computes marathon options for the selected date and theater.

Edit BLACKLIST and PREFERRED_MOVIES below, then run after daily processing (or npm run marathon).
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = ROOT.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from reel_seattle.normalize import format_date_csv, parse_iso_date, parse_time

# ---------------------------------------------------------------------------
# Hardcode titles exactly as they appear in showtimes_current film_title (case-sensitive).
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

PUBLIC_DIR = PROJECT_ROOT / "public"
STATIC_DIR = ROOT / "static"
SHOWTIMES_CURRENT_JSON = PROJECT_ROOT / "public" / "data" / "showtimes_current.json"
# Preferred export metadata key; source_csv kept for marathon UI backward compatibility.
MARATHON_SOURCE_BASENAME = SHOWTIMES_CURRENT_JSON.name
MARATHON_SOURCE_RELATIVE = "public/data/showtimes_current.json"
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


def load_showtimes_current_artifact(path: Path) -> dict:
    """Load and parse the current-window showtimes artifact."""
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"Malformed showtimes current artifact: {path} ({exc})") from exc


def build_theater_name_index(artifact: dict) -> dict[str, str]:
    index: dict[str, str] = {}
    for entry in artifact.get("theaters", []):
        if not isinstance(entry, dict):
            continue
        theater_id = str(entry.get("id", "")).strip()
        theater_name = str(entry.get("name", "")).strip()
        if theater_id and theater_name:
            index[theater_id] = theater_name
    return index


def marathon_date_from_iso(iso_date: str) -> str | None:
    parsed = parse_iso_date(iso_date)
    if parsed is None:
        return None
    return format_date_csv(parsed)


def load_amc_showtimes_from_current(
    artifact: dict,
    *,
    skip_stats: dict[str, int] | None = None,
) -> list[Showtime]:
    """Build marathon showtimes from showtimes_current.json AMC rows."""
    theater_names = build_theater_name_index(artifact)
    stats = skip_stats if skip_stats is not None else {}
    rows: list[Showtime] = []

    for i, row in enumerate(artifact.get("showtimes", [])):
        if not isinstance(row, dict):
            stats["invalid_row"] = stats.get("invalid_row", 0) + 1
            continue

        if row.get("source") != "amc":
            stats["non_amc"] = stats.get("non_amc", 0) + 1
            continue

        if str(row.get("status", "")).strip().lower() == "canceled":
            stats["canceled"] = stats.get("canceled", 0) + 1
            continue

        runtime_raw = row.get("runtime_min")
        if runtime_raw is None:
            stats["missing_runtime"] = stats.get("missing_runtime", 0) + 1
            continue
        try:
            runtime = int(runtime_raw)
        except (TypeError, ValueError):
            stats["missing_runtime"] = stats.get("missing_runtime", 0) + 1
            continue
        if runtime <= 0:
            stats["missing_runtime"] = stats.get("missing_runtime", 0) + 1
            continue

        parsed_time = parse_time(row.get("time")) or parse_time(row.get("time_display"))
        if parsed_time is None:
            stats["missing_time"] = stats.get("missing_time", 0) + 1
            continue

        marathon_date = marathon_date_from_iso(str(row.get("date", "")))
        if marathon_date is None:
            stats["missing_date"] = stats.get("missing_date", 0) + 1
            continue

        theater_id = str(row.get("theater_id", "")).strip()
        theater_name = theater_names.get(theater_id, "")
        if not theater_name:
            stats["missing_theater"] = stats.get("missing_theater", 0) + 1
            continue

        film = str(row.get("film_title", "")).strip()
        if not film:
            stats["missing_film"] = stats.get("missing_film", 0) + 1
            continue

        time_display = str(row.get("time_display", "")).strip() or parsed_time.time_display
        poster = str(row.get("poster_url") or "").strip()
        start_min = parsed_time.minutes_since_midnight

        rows.append(
            Showtime(
                id=i,
                date=marathon_date,
                time=time_display,
                theater=theater_name,
                film=film,
                runtime=runtime,
                poster=poster,
                start_min=start_min,
                end_min=start_min + runtime,
            )
        )

    return rows


def build_showtimes_export(showtimes: list[Showtime], *, source_name: str) -> dict:
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
        # Legacy key — marathon UI may read source_csv; prefer source_file for new code.
        "source_csv": source_name,
        "source_file": MARATHON_SOURCE_RELATIVE,
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


def export_marathon_planner(
    base: Path | None = None,
    *,
    current_path: Path | None = None,
) -> dict[str, Path]:
    """Build marathon_showtimes.json and copy static UI into public/marathon."""
    path = current_path or SHOWTIMES_CURRENT_JSON
    if not path.exists():
        raise FileNotFoundError(
            f"Showtimes current artifact not found: {path}. Run daily_processor.py first."
        )

    artifact = load_showtimes_current_artifact(path)
    skip_stats: dict[str, int] = {}
    showtimes = load_amc_showtimes_from_current(artifact, skip_stats=skip_stats)
    payload = build_showtimes_export(showtimes, source_name=path.name)
    target_base = base if base is not None else PUBLIC_DIR
    paths = write_deploy_bundle(payload, target_base)
    return paths, skip_stats


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
        "source_csv": MARATHON_SOURCE_BASENAME,
        "source_file": MARATHON_SOURCE_RELATIVE,
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

    paths, skip_stats = export_marathon_planner()
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

    exported_count = len(payload["showtimes"])
    if exported_count == 0:
        print("Loaded 0 AMC showtimes from showtimes_current.json")
    else:
        print(f"Loaded {exported_count} AMC showtimes from showtimes_current.json")
    if skip_stats:
        parts = ", ".join(f"{key}={value}" for key, value in sorted(skip_stats.items()))
        print(f"  Skipped rows: {parts}")
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
