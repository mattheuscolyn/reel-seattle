import csv
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

from reel_seattle.history_keys import enrich_history_row_keys, load_theater_index
from reel_seattle.history_nulls import normalize_history_optional_fields
from reel_seattle.history_times import enrich_history_row_time
from reel_seattle.normalize import resolve_theater
from reel_seattle.adapters.scrape_log import (
    DEFAULT_DAILY_LOGS_DIR,
    ScrapeLogError,
    daily_log_path,
    load_scrape_daily_log,
    raw_showtimes_to_legacy_rows,
)

INDIE_RESTATE_SOURCES = ("siff", "beacon")

HISTORY_FIELDNAMES = [
    "Date",
    "Time",
    "Theater",
    "Film",
    "Runtime",
    "isAlmostSoldOut",
    "posterDynamic",
    "isCanceled",
    "premiumFormat",
    "hasTrailers",
    "maximumIntendedAttendance",
    "first_seen_date",
    "last_updated",
    "source",
    "theater_id",
    "showtime_film_key",
    "time_24h",
]

HISTORY_PATH = Path("data/history/showtimes_history.csv")


def parse_history_date(date_str: str):
    try:
        month, day, year = map(int, date_str.split("/"))
        return datetime(year, month, day).date()
    except (ValueError, AttributeError):
        return None


def normalize_history_row(row: dict) -> dict:
    normalized = {key: row.get(key, "") for key in HISTORY_FIELDNAMES}
    normalize_history_optional_fields(normalized)
    return normalized


def is_amc_history_row(row: dict) -> bool:
    if row.get("source", "").strip().lower() == "amc":
        return True
    return row.get("Theater", "").strip().startswith("AMC ")


def count_future_amc_history_rows(history_data, today_date) -> int:
    """Count AMC history rows on or after *today_date*."""
    return sum(
        1
        for row in history_data
        if is_amc_history_row(row)
        and (show_date := parse_history_date(row.get("Date", ""))) is not None
        and show_date >= today_date
    )


def count_future_scrape_rows(scrape_rows, today_date) -> int:
    """Count scrape rows on or after *today_date*."""
    return sum(
        1
        for row in scrape_rows
        if (show_date := parse_history_date(row.get("Date", ""))) is not None
        and show_date >= today_date
    )


def resolve_indie_row_source(row: dict, theater_index) -> str | None:
    """Map a row to ``siff`` or ``beacon`` via the theater registry."""
    resolution = resolve_theater(row.get("Theater", ""), theater_index)
    if resolution is not None:
        entry = theater_index.theaters_by_id.get(resolution.theater_id)
        if entry is not None:
            source = entry.get("source")
            if source in INDIE_RESTATE_SOURCES:
                return str(source)

    raw_source = str(row.get("source", "")).strip().casefold()
    if raw_source in INDIE_RESTATE_SOURCES:
        return raw_source
    return None


def is_indie_source_history_row(row: dict, source: str, theater_index) -> bool:
    return resolve_indie_row_source(row, theater_index) == source


def count_future_indie_source_history_rows(
    history_data, source: str, theater_index, today_date
) -> int:
    return sum(
        1
        for row in history_data
        if is_indie_source_history_row(row, source, theater_index)
        and (show_date := parse_history_date(row.get("Date", ""))) is not None
        and show_date >= today_date
    )


def count_future_indie_source_scrape_rows(
    scrape_rows, source: str, theater_index, today_date
) -> int:
    return sum(
        1
        for row in scrape_rows
        if (show_date := parse_history_date(row.get("Date", ""))) is not None
        and show_date >= today_date
        and resolve_indie_row_source(row, theater_index) == source
    )


def read_csv(filename):
    """Read CSV file and return list of dictionaries"""
    if not os.path.exists(filename):
        return []
    
    with open(filename, 'r', encoding='utf-8') as file:
        reader = csv.DictReader(file)
        return list(reader)

def save_csv(filename, data, fieldnames=None):
    """Save data to CSV file"""
    if not data:
        return

    path = Path(filename)
    if path.parent != Path("."):
        path.parent.mkdir(parents=True, exist_ok=True)

    columns = fieldnames or list(data[0].keys())
    with path.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(data)


def add_new_showtime(showtime, history_data, today, source, theater_index):
    """Add new showtime with first_seen_date"""
    new_showtime = normalize_history_row(showtime)
    new_showtime["first_seen_date"] = today
    new_showtime["last_updated"] = today
    new_showtime["source"] = source
    enrich_history_row_keys(new_showtime, theater_index, log_warnings=True)
    enrich_history_row_time(new_showtime, log_warnings=True)
    history_data.append(new_showtime)


def _track_movie_announcement(showtime, today, announcements_data):
    if not movie_exists_in_announcements(
        showtime["Film"], showtime["Theater"], announcements_data
    ):
        add_new_movie_announcement(
            showtime["Film"], showtime["Theater"], today, announcements_data
        )
    else:
        update_movie_last_seen(
            showtime["Film"], showtime["Theater"], today, announcements_data
        )


def _log_scrape_json_messages(result, *, source: str) -> None:
    for message in result.warnings:
        print(f"  Warning ({source} JSON): {message}")
    for message in result.errors:
        print(f"  Error ({source} JSON): {message}")


def resolve_amc_scrape_rows(
    run_date_iso: str,
    csv_path: str | Path,
    *,
    logs_dir: Path | str = DEFAULT_DAILY_LOGS_DIR,
) -> tuple[list[dict], str, str]:
    """Return AMC scrape rows, input label, and input kind (``json`` or ``csv``)."""
    json_path = daily_log_path(run_date_iso, "amc", logs_dir=logs_dir)
    if json_path.exists():
        result = load_scrape_daily_log(json_path)
        _log_scrape_json_messages(result, source="amc")
        rows = raw_showtimes_to_legacy_rows("amc", result.records)
        return rows, str(json_path), "json"

    csv_file = str(csv_path)
    if not Path(csv_file).exists():
        return [], csv_file, "csv"
    return read_csv(csv_file), csv_file, "csv"


def resolve_indie_source_scrape_rows(
    source: str,
    run_date_iso: str,
    csv_path: str | Path,
    theater_index,
    *,
    logs_dir: Path | str = DEFAULT_DAILY_LOGS_DIR,
) -> tuple[list[dict], str, str]:
    """Return indie source scrape rows, input label, and input kind."""
    if source not in INDIE_RESTATE_SOURCES:
        raise ValueError(f"unsupported indie source: {source}")

    json_path = daily_log_path(run_date_iso, source, logs_dir=logs_dir)
    if json_path.exists():
        result = load_scrape_daily_log(json_path)
        _log_scrape_json_messages(result, source=source)
        rows = raw_showtimes_to_legacy_rows(source, result.records)
        return rows, str(json_path), "json"

    csv_file = str(csv_path)
    if not Path(csv_file).exists():
        return [], csv_file, "csv"

    filtered = [
        row
        for row in read_csv(csv_file)
        if resolve_indie_row_source(row, theater_index) == source
    ]
    return filtered, f"{csv_file} ({source} filter)", "csv"


def process_indie_csv_data(
    csv_file,
    history_data,
    announcements_data,
    today,
    theater_index,
    *,
    today_date=None,
    run_date_iso: str | None = None,
    logs_dir: Path | str = DEFAULT_DAILY_LOGS_DIR,
):
    """
    Restate SIFF and Beacon showtimes for today and future from the latest scrape.
    Each indie source is restated independently with its own safety guard.
    Past rows are never removed.
    """
    today_date = today_date or datetime.now().date()
    run_date_iso = run_date_iso or today

    for source in INDIE_RESTATE_SOURCES:
        current_data, input_label, input_kind = resolve_indie_source_scrape_rows(
            source,
            run_date_iso,
            csv_file,
            theater_index,
            logs_dir=logs_dir,
        )
        if input_kind == "json":
            print(f"  Using JSON scrape input for {source}: {input_label}")
        else:
            print(f"  Using CSV scrape input for {source}: {input_label}")

        existing_future = count_future_indie_source_history_rows(
            history_data, source, theater_index, today_date
        )
        incoming_future = count_future_indie_source_scrape_rows(
            current_data, source, theater_index, today_date
        )

        if existing_future > 0 and incoming_future == 0:
            print(
                f"ERROR: {source} restate skipped — incoming scrape has 0 future rows, "
                f"but history has {existing_future} {source} future rows. "
                f"Existing future {source} history preserved."
            )
            continue

        before_count = len(history_data)
        history_data[:] = [
            row
            for row in history_data
            if not (
                is_indie_source_history_row(row, source, theater_index)
                and (show_date := parse_history_date(row.get("Date", ""))) is not None
                and show_date >= today_date
            )
        ]
        removed = before_count - len(history_data)
        print(f"  Removed {removed} {source} rows for today and future before restate")

        added = 0
        for showtime in current_data:
            show_date = parse_history_date(showtime.get("Date", ""))
            if show_date is None or show_date < today_date:
                continue
            if resolve_indie_row_source(showtime, theater_index) != source:
                continue

            add_new_showtime(showtime, history_data, today, source, theater_index)
            added += 1
            _track_movie_announcement(showtime, today, announcements_data)

        print(f"  Added {added} {source} rows (today and future) from {input_label}")


def movie_exists_in_announcements(film, theater, announcements_data):
    """Check if movie already exists in announcements"""
    for row in announcements_data:
        if row['Film'] == film and row['Theater'] == theater:
            return True
    return False


def add_new_movie_announcement(film, theater, today, announcements_data):
    """Add new movie announcement"""
    new_movie = {
        'Film': film,
        'Theater': theater,
        'first_announced_date': today,
        'last_seen_date': today
    }
    announcements_data.append(new_movie)


def update_movie_last_seen(film, theater, today, announcements_data):
    """Update last_seen_date for existing movie"""
    for row in announcements_data:
        if row['Film'] == film and row['Theater'] == theater:
            row['last_seen_date'] = today
            break


def process_amc_csv_data(
    csv_file,
    history_data,
    announcements_data,
    today,
    theater_index,
    *,
    today_date=None,
    run_date_iso: str | None = None,
    logs_dir: Path | str = DEFAULT_DAILY_LOGS_DIR,
):
    """
    Restate AMC showtimes for today and future from the latest scrape.
    Past AMC rows in history are kept for exploration.
    """
    today_date = today_date or datetime.now().date()
    run_date_iso = run_date_iso or today
    current_data, input_label, input_kind = resolve_amc_scrape_rows(
        run_date_iso,
        csv_file,
        logs_dir=logs_dir,
    )
    if input_kind == "json":
        print(f"  Using JSON scrape input for amc: {input_label}")
    elif not current_data and not Path(str(csv_file)).exists():
        print(f"Warning: {csv_file} not found")
        return
    else:
        print(f"  Using CSV scrape input for amc: {input_label}")

    incoming_future_count = count_future_scrape_rows(current_data, today_date)
    existing_future_amc = count_future_amc_history_rows(history_data, today_date)

    if existing_future_amc > 0 and incoming_future_count == 0:
        print(
            "ERROR: AMC restate skipped — incoming AMC scrape has 0 future rows, "
            f"but history has {existing_future_amc} AMC future rows. "
            "Existing future AMC history preserved."
        )
        return

    before_count = len(history_data)
    history_data[:] = [
        row
        for row in history_data
        if not (
            is_amc_history_row(row)
            and (show_date := parse_history_date(row.get("Date", ""))) is not None
            and show_date >= today_date
        )
    ]
    removed = before_count - len(history_data)
    print(f"  Removed {removed} AMC rows for today and future before restate")

    added = 0

    for showtime in current_data:
        show_date = parse_history_date(showtime.get("Date", ""))
        if show_date is None or show_date < today_date:
            continue

        add_new_showtime(showtime, history_data, today, "amc", theater_index)
        added += 1
        _track_movie_announcement(showtime, today, announcements_data)

    print(f"  Added {added} AMC rows (today and future) from {input_label}")


def process_daily_core(
    history_data,
    announcements_data,
    *,
    indie_csv_path,
    amc_csv_path,
    today,
    theater_index,
    today_date=None,
    run_date_iso: str | None = None,
    logs_dir: Path | str = DEFAULT_DAILY_LOGS_DIR,
):
    """Run indie and AMC restate steps against in-memory history rows."""
    today_date = today_date or datetime.now().date()
    run_date_iso = run_date_iso or today
    for row in history_data:
        enrich_history_row_keys(row, theater_index)
    process_indie_csv_data(
        indie_csv_path,
        history_data,
        announcements_data,
        today,
        theater_index,
        today_date=today_date,
        run_date_iso=run_date_iso,
        logs_dir=logs_dir,
    )
    process_amc_csv_data(
        amc_csv_path,
        history_data,
        announcements_data,
        today,
        theater_index,
        today_date=today_date,
        run_date_iso=run_date_iso,
        logs_dir=logs_dir,
    )
    return history_data


def get_newly_announced_movies(days_back=7, announcements_data=None, reference_date=None):
    """Get movies announced in last N days."""
    if announcements_data is None:
        announcements_file = "public/data/movies_announcements.csv"
        if not os.path.exists(announcements_file):
            return []
        announcements_data = read_csv(announcements_file)

    ref = reference_date
    if ref is None:
        ref = datetime.now().date()
    elif isinstance(ref, datetime):
        ref = ref.date()

    cutoff_date = (ref - timedelta(days=days_back)).strftime("%Y-%m-%d")

    new_movies = []
    for row in announcements_data:
        if row['first_announced_date'] >= cutoff_date:
            new_movies.append(row)

    return new_movies

def main():
    today = datetime.now().strftime("%Y-%m-%d")
    print(f"Starting daily data processing for {today}")
    
    # Create data directories if they do not exist
    os.makedirs("public/data", exist_ok=True)
    os.makedirs(DEFAULT_DAILY_LOGS_DIR, exist_ok=True)
    HISTORY_PATH.parent.mkdir(parents=True, exist_ok=True)

    # Read existing history and announcements
    history_file = str(HISTORY_PATH)
    announcements_file = "public/data/movies_announcements.csv"
    
    history_data = [normalize_history_row(row) for row in read_csv(history_file)]
    announcements_data = read_csv(announcements_file)

    theater_index = load_theater_index()
    for row in history_data:
        enrich_history_row_keys(row, theater_index)

    # Process indie showtimes (restate today + future per source)
    print("Processing indie showtimes (restate today and future per source)...")
    process_indie_csv_data(
        "public/indieshowtimes.csv", history_data, announcements_data, today, theater_index
    )

    # Process AMC showtimes (restate today + future)
    print("Processing AMC showtimes (restate today and future)...")
    process_amc_csv_data("public/showtimes.csv", history_data, announcements_data, today, theater_index)

    # Save updated data
    print("Saving updated data...")
    save_csv(history_file, history_data, fieldnames=HISTORY_FIELDNAMES)

    print("Emitting showtimes_current.json...")
    from reel_seattle.emit.current import write_showtimes_current
    from reel_seattle.pipeline_report import write_pipeline_report

    current_artifact = write_showtimes_current(history_rows=history_data)

    print("Emitting pipeline_report.json...")
    write_pipeline_report(current_artifact)

    print("Syncing public theater registry...")
    from reel_seattle.registry_sync import sync_public_theaters_registry

    registry_sync = sync_public_theaters_registry()
    if registry_sync.action == "updated":
        print(f"  Updated {registry_sync.public_path}")
    else:
        print(f"  {registry_sync.public_path} already current")

    save_csv(announcements_file, announcements_data)
    
    # Generate newly announced report
    print("Generating newly announced report...")
    from reel_seattle.emit.newly_added import NEWLY_ADDED_DAYS_BACK, write_newly_added_current

    reference_date = datetime.strptime(
        current_artifact["window"]["start_date"], "%Y-%m-%d"
    ).date()
    new_movies = get_newly_announced_movies(
        NEWLY_ADDED_DAYS_BACK,
        announcements_data=announcements_data,
        reference_date=reference_date,
    )
    save_csv("public/data/newly_announced.csv", new_movies)

    print("Emitting newly_added_current.json...")
    newly_added_artifact = write_newly_added_current(
        announcements_data,
        current_artifact,
        reference_date=reference_date,
    )
    print(f"  {len(newly_added_artifact['entries'])} entries in current window")

    print(f"Daily processing complete. Processed {len(history_data)} total showtimes, {len(new_movies)} newly announced movies")

if __name__ == "__main__":
    main() 