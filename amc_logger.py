import csv
import json
import math
import os
import time
from datetime import datetime, timedelta

import requests

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

AMC_FIELDNAMES = [
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
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def parse_row_date(date_str: str):
    try:
        return datetime.strptime(date_str, "%m/%d/%Y").date()
    except ValueError:
        return None


def normalize_amc_row(row: dict) -> dict:
    return {key: row.get(key, "") for key in AMC_FIELDNAMES}


def serialize_bool(value) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "True" if value else "False"
    if isinstance(value, str):
        return "True" if value.strip().lower() in ("true", "1", "yes") else "False"
    return "True" if value else "False"


def format_premium_format(value) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, list):
        parts = [format_premium_format(item) for item in value]
        return ", ".join(part for part in parts if part)
    if isinstance(value, dict):
        for key in ("name", "type", "code", "description"):
            if value.get(key):
                return str(value[key]).strip()
        return json.dumps(value, separators=(",", ":"))
    return str(value).strip()


def format_optional_number(value) -> str:
    if value is None or value == "":
        return ""
    return str(value)


def showtime_to_row(showtime: dict, theater_name: str) -> dict:
    dt = datetime.fromisoformat(showtime["showDateTimeLocal"])
    return normalize_amc_row(
        {
            "Date": dt.strftime("%m/%d/%Y"),
            "Time": dt.strftime("%I:%M%p").lstrip("0"),
            "Theater": theater_name,
            "Film": showtime.get("movieName", ""),
            "Runtime": showtime.get("runTime", "Unknown"),
            "isAlmostSoldOut": serialize_bool(showtime.get("isAlmostSoldOut")),
            "posterDynamic": showtime.get("media", {}).get("posterDynamic", ""),
            "isCanceled": serialize_bool(showtime.get("isCanceled")),
            "premiumFormat": format_premium_format(showtime.get("premiumFormat")),
            "hasTrailers": serialize_bool(showtime.get("hasTrailers")),
            "maximumIntendedAttendance": format_optional_number(
                showtime.get("maximumIntendedAttendance")
            ),
            "first_seen_date": "",
            "last_updated": "",
            "source": "",
        }
    )


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
        if haversine(SEATTLE_LAT, SEATTLE_LON, t["location"]["latitude"], t["location"]["longitude"])
        <= RADIUS_MILES
    }

    for day_offset in range(DAYS_AHEAD + 1):
        show_date = TODAY + timedelta(days=day_offset)
        for theater_id, theater_name in nearby_theaters.items():
            showtimes = get_showtimes(theater_id, show_date)
            for showtime in showtimes:
                results.append(showtime_to_row(showtime, theater_name))
        time.sleep(1)  # Avoid hitting API rate limits
    return results


def load_past_showtimes():
    """Keep AMC showtimes strictly before today (API no longer returns them)."""
    existing = []
    if not os.path.exists(CSV_FILENAME):
        return existing

    with open(CSV_FILENAME, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            row_date = parse_row_date(row.get("Date", ""))
            if row_date is not None and row_date < TODAY:
                existing.append(normalize_amc_row(row))
    return existing


# ------------------ Main Execution ------------------ #
def main():
    print("Loading past AMC showtimes...")
    past_rows = load_past_showtimes()

    print("Scraping current and future AMC showtimes (full restate)...")
    future_rows = scrape_amc()

    all_rows = past_rows + future_rows
    with open(CSV_FILENAME, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=AMC_FIELDNAMES)
        writer.writeheader()
        writer.writerows(all_rows)

    print(
        f"Updated {CSV_FILENAME}: {len(past_rows)} past rows retained, "
        f"{len(future_rows)} current/future rows from API. Total: {len(all_rows)}"
    )


if __name__ == "__main__":
    main()
