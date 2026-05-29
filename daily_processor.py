import csv
import os
import shutil
import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path

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
]


def parse_history_date(date_str: str):
    try:
        month, day, year = map(int, date_str.split("/"))
        return datetime(year, month, day).date()
    except (ValueError, AttributeError):
        return None


def normalize_history_row(row: dict) -> dict:
    return {key: row.get(key, "") for key in HISTORY_FIELDNAMES}


def is_amc_history_row(row: dict) -> bool:
    if row.get("source", "").strip().lower() == "amc":
        return True
    return row.get("Theater", "").strip().startswith("AMC ")


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

    os.makedirs(os.path.dirname(filename), exist_ok=True)

    columns = fieldnames or list(data[0].keys())
    with open(filename, "w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(data)

def showtime_exists_in_history(showtime, history_data):
    """Check if exact showtime already exists in history"""
    for row in history_data:
        if (row['Date'] == showtime['Date'] and 
            row['Time'] == showtime['Time'] and 
            row['Theater'] == showtime['Theater'] and 
            row['Film'] == showtime['Film']):
            return True
    return False

def add_new_showtime(showtime, history_data, today, source):
    """Add new showtime with first_seen_date"""
    new_showtime = normalize_history_row(showtime)
    new_showtime["first_seen_date"] = today
    new_showtime["last_updated"] = today
    new_showtime["source"] = source
    history_data.append(new_showtime)

def update_existing_showtime(showtime, history_data, today):
    """Update last_updated for existing showtime"""
    for row in history_data:
        if (row['Date'] == showtime['Date'] and 
            row['Time'] == showtime['Time'] and 
            row['Theater'] == showtime['Theater'] and 
            row['Film'] == showtime['Film']):
            row['last_updated'] = today
            break

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

def process_csv_data(csv_file, source, history_data, announcements_data, today):
    """Process a single CSV file and update history/announcements"""
    if not os.path.exists(csv_file):
        print(f"Warning: {csv_file} not found")
        return
    
    current_data = read_csv(csv_file)
    
    # Track unique movies for announcements
    movies_seen_today = set()
    
    for showtime in current_data:
        # Check if this exact showtime exists in history
        if showtime_exists_in_history(showtime, history_data):
            # Update existing record
            update_existing_showtime(showtime, history_data, today)
        else:
            # New showtime - add with first_seen_date
            add_new_showtime(showtime, history_data, today, source)
        
        # Track movie announcements
        movie_key = (showtime['Film'], showtime['Theater'])
        movies_seen_today.add(movie_key)
        
        if not movie_exists_in_announcements(showtime['Film'], showtime['Theater'], announcements_data):
            # New movie at this theater
            add_new_movie_announcement(showtime['Film'], showtime['Theater'], today, announcements_data)
        else:
            # Update last seen date
            update_movie_last_seen(showtime['Film'], showtime['Theater'], today, announcements_data)


def process_amc_csv_data(csv_file, history_data, announcements_data, today):
    """
    Restate AMC showtimes for today and future from the latest scrape.
    Past AMC rows in history are kept for exploration.
    """
    if not os.path.exists(csv_file):
        print(f"Warning: {csv_file} not found")
        return

    today_date = datetime.now().date()
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

    current_data = read_csv(csv_file)
    added = 0

    for showtime in current_data:
        show_date = parse_history_date(showtime.get("Date", ""))
        if show_date is None or show_date < today_date:
            continue

        add_new_showtime(showtime, history_data, today, "amc")
        added += 1

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

    print(f"  Added {added} AMC rows (today and future) from {csv_file}")


def archive_daily_data(today):
    """Archive today's raw data files"""
    archive_dir = f"public/data/daily_logs"
    os.makedirs(archive_dir, exist_ok=True)
    
    # Archive indie showtimes
    if os.path.exists("public/indieshowtimes.csv"):
        archive_file = f"{archive_dir}/{today}_indie_showtimes.csv"
        shutil.copy2("public/indieshowtimes.csv", archive_file)
    
    # Archive AMC showtimes
    if os.path.exists("public/showtimes.csv"):
        archive_file = f"{archive_dir}/{today}_amc_showtimes.csv"
        shutil.copy2("public/showtimes.csv", archive_file)

def get_newly_announced_movies(days_back=7):
    """Get movies announced in last N days"""
    announcements_file = "public/data/movies_announcements.csv"
    if not os.path.exists(announcements_file):
        return []
    
    announcements = read_csv(announcements_file)
    cutoff_date = (datetime.now() - timedelta(days=days_back)).strftime("%Y-%m-%d")
    
    new_movies = []
    for row in announcements:
        if row['first_announced_date'] >= cutoff_date:
            new_movies.append(row)
    
    return new_movies

def main():
    today = datetime.now().strftime("%Y-%m-%d")
    print(f"Starting daily data processing for {today}")
    
    # Create data directory if it doesn't exist
    os.makedirs("public/data", exist_ok=True)
    
    # Read existing history and announcements
    history_file = "public/data/showtimes_history.csv"
    announcements_file = "public/data/movies_announcements.csv"
    
    history_data = [normalize_history_row(row) for row in read_csv(history_file)]
    announcements_data = read_csv(announcements_file)

    # Process indie showtimes (merge into history)
    print("Processing indie showtimes...")
    process_csv_data("public/indieshowtimes.csv", "indie", history_data, announcements_data, today)

    # Process AMC showtimes (restate today + future)
    print("Processing AMC showtimes (restate today and future)...")
    process_amc_csv_data("public/showtimes.csv", history_data, announcements_data, today)

    # Save updated data
    print("Saving updated data...")
    save_csv(history_file, history_data, fieldnames=HISTORY_FIELDNAMES)
    save_csv(announcements_file, announcements_data)
    
    # Archive daily data
    print("Archiving daily data...")
    archive_daily_data(today)
    
    # Generate newly announced report
    print("Generating newly announced report...")
    new_movies = get_newly_announced_movies(7)
    save_csv("public/data/newly_announced.csv", new_movies)
    
    print("Updating marathon planner showtimes...")
    try:
        marathon_script = Path(__file__).resolve().parent / "scripts" / "marathon" / "find_marathons.py"
        if marathon_script.exists():
            subprocess.run([sys.executable, str(marathon_script)], check=False)
        else:
            print(f"  Skipped: {marathon_script} not found")
    except OSError as exc:
        print(f"  Marathon export failed: {exc}")

    print(f"Daily processing complete. Processed {len(history_data)} total showtimes, {len(new_movies)} newly announced movies")

if __name__ == "__main__":
    main() 