import csv
import os
import shutil
from datetime import datetime, timedelta
import subprocess

def read_csv(filename):
    """Read CSV file and return list of dictionaries"""
    if not os.path.exists(filename):
        return []
    
    with open(filename, 'r', encoding='utf-8') as file:
        reader = csv.DictReader(file)
        return list(reader)

def save_csv(filename, data):
    """Save data to CSV file"""
    if not data:
        return
    
    os.makedirs(os.path.dirname(filename), exist_ok=True)
    
    with open(filename, 'w', newline='', encoding='utf-8') as file:
        fieldnames = data[0].keys()
        writer = csv.DictWriter(file, fieldnames=fieldnames)
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
    new_showtime = showtime.copy()
    new_showtime['first_seen_date'] = today
    new_showtime['last_updated'] = today
    new_showtime['source'] = source
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
    
    history_data = read_csv(history_file)
    announcements_data = read_csv(announcements_file)
    
    # Process indie showtimes
    print("Processing indie showtimes...")
    process_csv_data("public/indieshowtimes.csv", "indie", history_data, announcements_data, today)
    
    # Process AMC showtimes
    print("Processing AMC showtimes...")
    process_csv_data("public/showtimes.csv", "amc", history_data, announcements_data, today)
    
    # Save updated data
    print("Saving updated data...")
    save_csv(history_file, history_data)
    save_csv(announcements_file, announcements_data)
    
    # Archive daily data
    print("Archiving daily data...")
    archive_daily_data(today)
    
    # Generate newly announced report
    print("Generating newly announced report...")
    new_movies = get_newly_announced_movies(7)
    save_csv("public/data/newly_announced.csv", new_movies)
    
    print(f"Daily processing complete. Processed {len(history_data)} total showtimes, {len(new_movies)} newly announced movies")

if __name__ == "__main__":
    main() 