"""Discover and load AMC snapshots from Git history for footprint reconstruction."""

from __future__ import annotations

import json
import re
import subprocess
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Callable, Mapping, Sequence

from reel_seattle.adapters.scrape_log import load_scrape_daily_log_payload
from reel_seattle.analysis.amc_footprint import ParsedSnapshot, parse_snapshot_timestamp
from reel_seattle.analysis.legacy_amc_csv import parsed_snapshot_from_legacy_csv

ARCHIVE_COMMITS = ("65bada4", "b572c22")
DAILY_MSG_RE = re.compile(r"Daily showtime data update (\d{4}-\d{2}-\d{2})")
ARCHIVE_PATH_RE = re.compile(
    r"public/data/daily_logs/(\d{4}-\d{2}-\d{2})_amc_showtimes\.csv$"
)
JSON_PATH_RE = re.compile(r"data/daily_logs/(\d{4}-\d{2}-\d{2})_amc\.json$")

SOURCE_FORMAT_ARCHIVE = "archive_csv"
SOURCE_FORMAT_DAILY_CSV = "daily_csv"
SOURCE_FORMAT_JSON = "json"

INVENTORY_FIELDNAMES = [
    "snapshot_date",
    "source_format",
    "source_artifact",
    "source_commit",
    "priority_rank",
]

GitRunner = Callable[[str, ...], str]


@dataclass(frozen=True)
class SnapshotSource:
    """One recoverable AMC snapshot artifact in Git history."""

    snapshot_date: date
    git_path: str
    commit: str
    source_format: str
    priority_rank: int


def default_git_runner(repo_root: Path) -> GitRunner:
    """Return a subprocess-backed Git command runner rooted at *repo_root*."""

    def run_git(*args: str) -> str:
        return subprocess.check_output(
            ["git", *args],
            cwd=repo_root,
            text=True,
            errors="replace",
        )

    return run_git


def discover_archive_sources(run_git: GitRunner) -> dict[str, tuple[str, str]]:
    """Return snapshot_date -> (commit, git_path) for legacy archive CSVs."""
    found: dict[str, tuple[str, str]] = {}
    for commit in ARCHIVE_COMMITS:
        listing = run_git("ls-tree", "-r", commit, "--name-only", "public/data/daily_logs")
        for line in listing.splitlines():
            match = ARCHIVE_PATH_RE.search(line)
            if not match:
                continue
            found.setdefault(match.group(1), (commit, line))
    return found


def discover_daily_csv_commits(run_git: GitRunner) -> dict[str, str]:
    """Return snapshot_date -> commit for daily ``public/showtimes.csv`` commits."""
    out: dict[str, str] = {}
    log = run_git("log", "--all", "--format=%H %s", "--", "public/showtimes.csv")
    for line in log.splitlines():
        commit, _, subject = line.partition(" ")
        match = DAILY_MSG_RE.search(subject)
        if match:
            out.setdefault(match.group(1), commit)
    return out


def discover_json_snapshots(run_git: GitRunner) -> dict[str, str]:
    """Return snapshot_date -> commit for normalized ``*_amc.json`` logs."""
    out: dict[str, str] = {}
    log = run_git("log", "--all", "--format=%H", "--", "data/daily_logs")
    for commit in log.splitlines():
        listing = run_git("ls-tree", "-r", commit, "--name-only", "data/daily_logs")
        for line in listing.splitlines():
            match = JSON_PATH_RE.search(line)
            if match:
                out.setdefault(match.group(1), commit)
    return out


def merge_snapshot_sources(
    archive: Mapping[str, tuple[str, str]],
    daily_csv: Mapping[str, str],
    json_logs: Mapping[str, str],
) -> list[SnapshotSource]:
    """Resolve snapshot dates with source precedence: archive > daily_csv > json."""
    dates = sorted(set(archive) | set(daily_csv) | set(json_logs))
    sources: list[SnapshotSource] = []
    for snap_text in dates:
        snap = date.fromisoformat(snap_text)
        if snap_text in archive:
            commit, path = archive[snap_text]
            sources.append(
                SnapshotSource(
                    snapshot_date=snap,
                    git_path=path,
                    commit=commit,
                    source_format=SOURCE_FORMAT_ARCHIVE,
                    priority_rank=1,
                )
            )
        elif snap_text in daily_csv:
            sources.append(
                SnapshotSource(
                    snapshot_date=snap,
                    git_path="public/showtimes.csv",
                    commit=daily_csv[snap_text],
                    source_format=SOURCE_FORMAT_DAILY_CSV,
                    priority_rank=2,
                )
            )
        else:
            path = f"data/daily_logs/{snap_text}_amc.json"
            sources.append(
                SnapshotSource(
                    snapshot_date=snap,
                    git_path=path,
                    commit=json_logs[snap_text],
                    source_format=SOURCE_FORMAT_JSON,
                    priority_rank=3,
                )
            )
    return sources


def discover_snapshot_sources(run_git: GitRunner) -> list[SnapshotSource]:
    """Inventory recoverable AMC snapshots from Git history."""
    return merge_snapshot_sources(
        discover_archive_sources(run_git),
        discover_daily_csv_commits(run_git),
        discover_json_snapshots(run_git),
    )


def filter_snapshot_sources(
    sources: Sequence[SnapshotSource],
    *,
    start_date: date | None = None,
    end_date: date | None = None,
    every_n: int = 1,
    limit: int = 0,
) -> list[SnapshotSource]:
    """Apply date bounds and optional sampling to discovered sources."""
    selected = list(sources)
    if start_date is not None:
        selected = [src for src in selected if src.snapshot_date >= start_date]
    if end_date is not None:
        selected = [src for src in selected if src.snapshot_date <= end_date]
    if every_n > 1:
        selected = selected[::every_n]
    if limit > 0:
        selected = selected[:limit]
    return selected


def missing_snapshot_dates(sources: Sequence[SnapshotSource]) -> list[date]:
    """Return calendar dates with no recoverable snapshot between earliest and latest."""
    if not sources:
        return []
    ordered = sorted(src.snapshot_date for src in sources)
    start, end = ordered[0], ordered[-1]
    present = set(ordered)
    missing: list[date] = []
    current = start
    while current <= end:
        if current not in present:
            missing.append(current)
        current += timedelta(days=1)
    return missing


def inventory_rows(sources: Sequence[SnapshotSource]) -> list[dict[str, str]]:
    """Build deterministic inventory rows for discovered snapshot sources."""
    rows = [
        {
            "snapshot_date": src.snapshot_date.isoformat(),
            "source_format": src.source_format,
            "source_artifact": src.git_path,
            "source_commit": src.commit,
            "priority_rank": str(src.priority_rank),
        }
        for src in sources
    ]
    rows.sort(key=lambda row: row["snapshot_date"])
    return rows


def source_format_counts(sources: Sequence[SnapshotSource]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for src in sources:
        counts[src.source_format] = counts.get(src.source_format, 0) + 1
    return counts


def load_snapshot_from_git(
    source: SnapshotSource,
    run_git: GitRunner,
) -> ParsedSnapshot:
    """Extract and parse one snapshot via ``git show`` without touching the worktree."""
    text = run_git("show", f"{source.commit}:{source.git_path}")
    if source.source_format == SOURCE_FORMAT_JSON:
        envelope = json.loads(text)
        snapshot_date, snapshot_timestamp = parse_snapshot_timestamp(
            envelope.get("generated_at")
        )
        if snapshot_date is None:
            snapshot_date = source.snapshot_date
        result = load_scrape_daily_log_payload(
            envelope,
            label=f"{source.commit}:{source.git_path}",
        )
        return ParsedSnapshot(
            path=Path(source.git_path),
            snapshot_date=snapshot_date,
            snapshot_timestamp=snapshot_timestamp,
            records=list(result.records),
        )
    return parsed_snapshot_from_legacy_csv(
        text,
        snapshot_date=source.snapshot_date,
        source_path=source.git_path,
    )


def load_snapshots_from_git(
    sources: Sequence[SnapshotSource],
    run_git: GitRunner,
) -> tuple[list[ParsedSnapshot], list[str]]:
    """Load all sources; return parsed snapshots and per-source error messages."""
    parsed: list[ParsedSnapshot] = []
    errors: list[str] = []
    for source in sources:
        try:
            parsed.append(load_snapshot_from_git(source, run_git))
        except (subprocess.CalledProcessError, json.JSONDecodeError, OSError) as exc:
            errors.append(
                f"{source.snapshot_date.isoformat()} ({source.git_path}@{source.commit[:7]}): {exc}"
            )
    parsed.sort(key=lambda item: (item.snapshot_date, item.path.name))
    return parsed, errors


def inventory_summary(sources: Sequence[SnapshotSource]) -> dict[str, object]:
    """Summarize discovered snapshot inventory for CLI reporting."""
    if not sources:
        return {
            "snapshot_count": 0,
            "earliest": "",
            "latest": "",
            "missing_dates": [],
            "missing_count": 0,
            "source_breakdown": {},
        }
    missing = missing_snapshot_dates(sources)
    ordered = sorted(src.snapshot_date for src in sources)
    return {
        "snapshot_count": len(sources),
        "earliest": ordered[0].isoformat(),
        "latest": ordered[-1].isoformat(),
        "missing_dates": [day.isoformat() for day in missing],
        "missing_count": len(missing),
        "source_breakdown": source_format_counts(sources),
    }


def extracted_at_timestamp() -> str:
    """Return a stable ISO timestamp string for inventory metadata."""
    return datetime.now().astimezone().isoformat(timespec="seconds")
