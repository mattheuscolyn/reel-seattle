import requests
import csv
import time
import math
import os
from datetime import datetime, timedelta

# ------------------ Configuration ------------------ #
AMC_API_KEY = os.environ.get("AMC_API_KEY")
AMC_BASE_URL = "https://api.amctheatres.com/v2"
HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "X-AMC-Vendor-Key": AMC_API_KEY,
}
CSV_FILENAME = "public/showtimes.csv"

# Geolocation and search radius
SEATTLE_LAT, SEATTLE_LON = 47.6062, -122.3321
RADIUS_MILES = 300
DAYS_AHEAD = 14

# ------------------ Initialization ------------------ #
session = requests.Session()
session.headers.update(HEADERS)
TODAY = datetime.today().date()

# ------------------ Helper Functions ------------------ #
def haversine(lat1, lon1, lat2, lon2):
    """Calculate distance between two lat/lon coordinates in miles."""
    R = 3958.8  # Earth radius in miles
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    a = math.sin(dlat/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin(dlon/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

def get_all_theaters():
    """Fetch all AMC theaters using paginated API calls."""
    theaters = []
    url = f"{AMC_BASE_URL}/theatres?page-number=1&page-size=100"
    while url:
        response = session.get(url)
        if response.status_code != 200:
            break
        data = response.json()
        theaters.extend(data["_embedded"].get("theatres", []))
        url = data["_links"].get("next", {}).get("href")
    return theaters

def get_showtimes(theater_id, date):
    """Fetch all showtimes for a given theater and date."""
    formatted_date = date.strftime("%m-%d-%y").lstrip("0").replace("-0", "-")
    base_url = f"{AMC_BASE_URL}/theatres/{theater_id}/showtimes/{formatted_date}"

    initial_response = session.get(base_url)
    if initial_response.status_code != 200:
        return []

    data = initial_response.json()
    page_size = data.get("pageSize", 10)
    total_count = data.get("count", 0)
    total_pages = (total_count + page_size - 1) // page_size

    all_showtimes = []
    for page_number in range(1, total_pages + 1):
        paged_url = f"{base_url}?pageNumber={page_number}&pageSize={page_size}"
        response = session.get(paged_url)
        if response.status_code != 200:
            continue
        page_data = response.json()
        showtimes = page_data.get("_embedded", {}).get("showtimes", [])
        all_showtimes.extend(showtimes)

    return all_showtimes

def scrape_amc():
    """Scrape AMC showtimes for nearby theaters over a range of future dates."""
    results = []
    all_theaters = get_all_theaters()
    nearby_theaters = {
        t["id"]: t["longName"]
        for t in all_theaters
        if haversine(SEATTLE_LAT, SEATTLE_LON, t["location"]["latitude"], t["location"]["longitude"]) <= RADIUS_MILES
    }

    for day_offset in range(DAYS_AHEAD + 1):
        show_date = TODAY + timedelta(days=day_offset)
        for theater_id, theater_name in nearby_theaters.items():
            showtimes = get_showtimes(theater_id, show_date)
            for showtime in showtimes:
                dt = datetime.fromisoformat(showtime["showDateTimeLocal"])
                results.append([
                    dt.strftime("%m/%d/%Y"),
                    dt.strftime("%I:%M%p").lstrip("0"),
                    theater_name,
                    showtime["movieName"],
                    showtime.get("runTime", "Unknown"),
                    showtime.get("isAlmostSoldOut"),
                    showtime.get("media", {}).get("posterDynamic"),
                    "",  # first_seen_date
                    "",  # last_updated
                    ""   # source
                ])
        time.sleep(1)  # Avoid hitting API rate limits
    return results

def load_existing_data():
    """Load showtimes from CSV for today or earlier to preserve past data."""
    existing = []
    if os.path.exists(CSV_FILENAME):
        with open(CSV_FILENAME, "r", encoding="utf-8") as f:
            reader = csv.reader(f)
            next(reader, None)  # Skip header
            for row in reader:
                try:
                    row_date = datetime.strptime(row[0], "%m/%d/%Y").date()
                    if row_date < TODAY:
                        existing.append(row)
                except ValueError:
                    continue
    return existing

# ------------------ Main Execution ------------------ #
def main():
    print("Loading saved showtimes...")
    past_rows = load_existing_data()

    print("Scraping future AMC showtimes...")
    future_rows = scrape_amc()

    all_rows = past_rows + future_rows
    with open(CSV_FILENAME, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["Date", "Time", "Theater", "Film", "Runtime", "isAlmostSoldOut", "posterDynamic", "first_seen_date", "last_updated", "source"])
        writer.writerows(all_rows)

    print(f"Updated {CSV_FILENAME} with {len(future_rows)} new/future showtimes. Total rows: {len(all_rows)}")

if __name__ == "__main__":
    main()
