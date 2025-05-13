import requests
import csv
import time
import math
import os
from datetime import datetime, timedelta

HEADERS = {
    "User-Agent": "Mozilla/5.0"
}
AMC_BASE_URL = "https://api.amctheatres.com/v2"
AMC_API_KEY = os.environ.get("AMC_API_KEY")
AMC_HEADERS = {"X-AMC-Vendor-Key": AMC_API_KEY}
SEATTLE_LAT, SEATTLE_LON, RADIUS_MILES, DAYS_AHEAD = 47.6062, -122.3321, 300, 14
CSV_FILENAME = "showtimes.csv"

session = requests.Session()
session.headers.update(HEADERS)
TODAY = datetime.today().date()

def haversine(lat1, lon1, lat2, lon2):
    R = 3958.8  # Earth radius in miles
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    a = math.sin(dlat/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin(dlon/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

def get_all_theaters():
    theaters = []
    url = f"{AMC_BASE_URL}/theatres?page-number=1&page-size=50"
    while url:
        response = session.get(url, headers=AMC_HEADERS)
        if response.status_code != 200:
            print("Error fetching theaters:", response.text)
            break
        data = response.json()
        theaters.extend(data["_embedded"].get("theatres", []))
        url = data["_links"].get("next", {}).get("href")
    return theaters

def get_showtimes(theater_id, date):
    formatted_date = date.strftime("%m-%d-%y").lstrip("0").replace("-0", "-")
    url = f"{AMC_BASE_URL}/theatres/{theater_id}/showtimes/{formatted_date}"
    response = session.get(url, headers=AMC_HEADERS)
    if response.status_code == 200:
        return response.json()
    return None

def scrape_amc():
    results = []
    all_theaters = get_all_theaters()
    nearby_theaters = {
        t["id"]: t["longName"]
        for t in all_theaters
        if haversine(SEATTLE_LAT, SEATTLE_LON, t["location"]["latitude"], t["location"]["longitude"]) <= RADIUS_MILES
    }

    for day_offset in range(DAYS_AHEAD + 1):
        show_date = TODAY + timedelta(days=day_offset)
        print(f"Fetching AMC showtimes for {show_date.strftime('%m/%d/%Y')}...")
        for theater_id, theater_name in nearby_theaters.items():
            showtimes = get_showtimes(theater_id, show_date)
            if showtimes and "_embedded" in showtimes:
                for showtime in showtimes["_embedded"].get("showtimes", []):
                    dt = datetime.fromisoformat(showtime["showDateTimeLocal"])
                    date_str = dt.strftime("%m/%d/%Y")
                    time_str = dt.strftime("%I:%M%p").lstrip("0")
                    results.append([
                        date_str,
                        time_str,
                        theater_name,
                        showtime["movieName"],
                        showtime.get("runTime", "Unknown"),
                        showtime.get("isAlmostSoldOut"),
                        showtime.get("media", {}).get("posterDynamic")
                    ])
        time.sleep(1)
    return results

def load_existing_data():
    old_rows = []
    if os.path.exists(CSV_FILENAME):
        with open(CSV_FILENAME, "r", encoding="utf-8") as f:
            reader = csv.reader(f)
            headers = next(reader, None)
            for row in reader:
                try:
                    row_date = datetime.strptime(row[0], "%m/%d/%Y").date()
                    if row_date <= TODAY:
                        old_rows.append(row)
                except ValueError:
                    continue
    return old_rows

def main():
    print("Loading saved showtimes...")
    preserved_rows = load_existing_data()
    
    print("Scraping AMC showtimes...")
    future_rows = scrape_amc()

    all_rows = preserved_rows + future_rows
    with open(CSV_FILENAME, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["Date", "Time", "Theater", "Film", "Runtime", "isAlmostSoldOut", "posterDynamic"])
        writer.writerows(all_rows)

    print(f"Updated {CSV_FILENAME} with {len(future_rows)} new/future showtimes. Total rows: {len(all_rows)}")

if __name__ == "__main__":
    main()
