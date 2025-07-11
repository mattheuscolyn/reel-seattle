import requests
import re
import csv
import time
import math
from bs4 import BeautifulSoup
from datetime import datetime, timedelta

# Headers to mimic a real browser
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36"
}

CURRENT_YEAR = datetime.now().year
showtimes_data = []

# Session for efficient requests
session = requests.Session()
session.headers.update(HEADERS)


def format_date(date_str, year):
    """Convert a date string into mm/dd/yyyy format, assuming a given year."""
    try:
        return datetime.strptime(f"{date_str} {year}", "%B %d %Y").strftime("%m/%d/%Y")
    except ValueError:
        return None


### --- Scraping The Beacon --- ###
def scrape_beacon():
    url = "https://thebeacon.film/calendar"
    response = session.get(url)
    if response.status_code != 200:
        print(f"Failed to fetch {url}")
        return

    beacon_links = set(re.findall(r"'(https://thebeacon\.film/calendar/movie/[^\']+)'", response.text))

    for link in beacon_links:
        soup = BeautifulSoup(session.get(link).text, "html.parser")
        movie_title = soup.title.string.split(" | ")[0].title() if soup.title else "Unknown Movie"

        # Extract runtime
        runtime = next(
            (div.find("p").get_text(strip=True).replace(" minutes", "")
             for div in soup.find_all("div", class_="w-8")
             if div.find("h4") and "Runtime" in div.find("h4").text),
            "Unknown"
        )

        # Extract showtimes
        for div in soup.find_all("div", class_="showtime_item transformer showtime_exists"):
            if not div.get("data-value"):
                continue
            date, showtime_time = div.get_text(strip=True, separator=" ").rsplit(" ", 1)
            formatted_date = format_date(date.split(",")[-1].strip(), CURRENT_YEAR)
            if formatted_date:
                showtimes_data.append([formatted_date, showtime_time, "The Beacon", movie_title, runtime, "None", "None"])


### --- Scraping SIFF Cinema --- ###
def scrape_siff():
    base_url = "https://www.siff.net"
    main_url = f"{base_url}/cinema/in-theaters"
    
    response = session.get(main_url)
    if response.status_code != 200:
        print(f"Failed to fetch {main_url}")
        return

    soup = BeautifulSoup(response.text, "html.parser")
    movie_links = {base_url + a["href"] for a in soup.find_all("a", href=True) if a["href"].startswith("/cinema/in-theaters/") or a["href"].startswith("/programs-and-events/")}

    for movie_url in movie_links:
        soup = BeautifulSoup(session.get(movie_url).text, "html.parser")
        movie_title = soup.title.string if soup.title else "Unknown Movie"
        movie_year = next((int(m.group(1)) for m in re.finditer(r"(\d{4})", soup.text)), CURRENT_YEAR)

        # Extract runtime
        runtime = "Unknown"
        runtime_p = soup.find("p", class_="small")
        if runtime_p:
            spans = runtime_p.find_all("span")
            for span in spans:
                text = span.get_text(strip=True)
                if "min." in text:
                    runtime = text.replace(" min.", "")
                    break

        # Extract poster image
        poster_image = "None"
        img_wrap = soup.find("p", class_="img-wrap")
        if img_wrap:
            img = img_wrap.find("img")
            if img and img.get("src"):
                poster_image = base_url + img["src"]

        for day_div in soup.find_all("div", class_="day"):
            date_tag = day_div.find("p", class_="h3")
            if not date_tag:
                continue
                
            # Extract date from format like "Friday, July 11, 2025"
            date_text = date_tag.get_text(strip=True)
            # Remove day of week and extract month/day/year
            date_parts = date_text.split(", ")
            if len(date_parts) >= 2:
                month_day = date_parts[1]  # "July 11"
                year = date_parts[2] if len(date_parts) > 2 else str(movie_year)
                formatted_date = format_date(month_day, int(year))
            else:
                continue

            if not formatted_date:
                continue

            for showtime_item in day_div.find_all("div", class_="item small-copy"):
                # Extract venue from nested structure
                venue_h4 = showtime_item.find("h4")
                if venue_h4:
                    venue_link = venue_h4.find("a")
                    if venue_link:
                        venue_span = venue_link.find("span", class_="dark-gray-text")
                        venue = venue_span.get_text(strip=True) if venue_span else "Unknown Venue"
                    else:
                        venue = venue_h4.get_text(strip=True)
                else:
                    venue = "Unknown Venue"
                
                # Extract showtimes from buttons with screening IDs
                times = []
                for a in showtime_item.find_all("a"):
                    if a.get("id") and a.get("id").startswith("screening-"):
                        time_text = a.get_text(strip=True)
                        if time_text:
                            times.append(time_text)

                for showtime_time in times:
                    showtimes_data.append([formatted_date, showtime_time, venue, movie_title, runtime, "None", poster_image, "", "", ""])

### --- Run Scrapers & Save Data --- ###
scrape_beacon()
scrape_siff()

csv_filename = "public/indieshowtimes.csv"
with open(csv_filename, "w", newline="", encoding="utf-8") as csv_file:
    csv.writer(csv_file).writerows([["Date", "Time", "Theater", "Film", "Runtime", "isAlmostSoldOut", "posterDynamic", "first_seen_date", "last_updated", "source"]] + showtimes_data)

print(f"Saved {len(showtimes_data)} showtimes to {csv_filename}.")
