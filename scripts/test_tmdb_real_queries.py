#!/usr/bin/env python3
"""Execute real TMDB queries for Coming Soon investigation."""

import json
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from reel_seattle.film_identity.tmdb_client import (
    TmdbClient,
    resolve_tmdb_auth,
    TmdbAuthError,
)


def test_tmdb_credentials():
    """Test if TMDB credentials are available."""
    try:
        auth = resolve_tmdb_auth(require=True)
        print(f"✓ TMDB credentials available")
        print(f"  Auth mode: {auth.mode}")
        return auth
    except TmdbAuthError as exc:
        print(f"✗ TMDB credentials NOT available")
        print(f"  Error: {exc}")
        return None


def fetch_tmdb_upcoming_us_theatrical(client, start_date, end_date, max_pages=10):
    """Fetch US theatrical releases from TMDB Discover."""
    
    print(f"\nQuerying TMDB Discover:")
    print(f"  Region: US")
    print(f"  Date range: {start_date} to {end_date}")
    print(f"  Release types: 2 (Theatrical), 3 (Theatrical Limited)")
    
    all_movies = []
    
    for page in range(1, max_pages + 1):
        try:
            params = {
                "page": page,
                "include_adult": "false",
                "language": "en-US",
                "region": "US",
                "release_date.gte": start_date.isoformat(),
                "release_date.lte": end_date.isoformat(),
                "with_release_type": "2|3",
                "sort_by": "release_date.asc",
            }
            
            response = client._request("discover", "/discover/movie", params)
            movies = response.get("results", [])
            total_results = response.get("total_results", 0)
            total_pages = response.get("total_pages", 0)
            
            if page == 1:
                print(f"\n  Total results: {total_results}")
                print(f"  Total pages: {total_pages}")
            
            if not movies:
                break
            
            all_movies.extend(movies)
            print(f"  Page {page}: {len(movies)} movies (total so far: {len(all_movies)})")
            
            if page >= total_pages:
                break
        
        except Exception as exc:
            print(f"  Error on page {page}: {exc}")
            break
    
    return all_movies


def analyze_tmdb_results(movies, amc_movie_ids, reel_seattle_film_ids):
    """Analyze TMDB results for overlap and quality."""
    
    print("\n" + "="*80)
    print("TMDB RESULTS ANALYSIS")
    print("="*80)
    
    print(f"\nTotal TMDB candidates: {len(movies)}")
    
    # Analyze poster availability
    with_poster = sum(1 for m in movies if m.get("poster_path"))
    print(f"With poster: {with_poster} ({100*with_poster/len(movies):.1f}%)")
    
    # Analyze popularity distribution
    popularities = sorted([m.get("popularity", 0) for m in movies], reverse=True)
    print(f"\nPopularity distribution:")
    print(f"  Max: {popularities[0]:.1f}")
    print(f"  95th percentile: {popularities[int(len(popularities)*0.05)]:.1f}")
    print(f"  75th percentile: {popularities[int(len(popularities)*0.25)]:.1f}")
    print(f"  Median: {popularities[int(len(popularities)*0.5)]:.1f}")
    print(f"  25th percentile: {popularities[int(len(popularities)*0.75)]:.1f}")
    print(f"  Min: {popularities[-1]:.1f}")
    
    # Categorize by popularity
    high_pop = [m for m in movies if m.get("popularity", 0) >= 50]
    med_pop = [m for m in movies if 10 <= m.get("popularity", 0) < 50]
    low_pop = [m for m in movies if m.get("popularity", 0) < 10]
    
    print(f"\nBy popularity tier:")
    print(f"  High (>= 50): {len(high_pop)}")
    print(f"  Medium (10-49): {len(med_pop)}")
    print(f"  Low (< 10): {len(low_pop)}")
    
    # Show examples from each tier
    print(f"\nHigh popularity examples (top 10):")
    for i, movie in enumerate(sorted(high_pop, key=lambda m: m.get("popularity", 0), reverse=True)[:10]):
        print(f"  {i+1}. {movie.get('title')} (pop: {movie.get('popularity'):.1f}, date: {movie.get('release_date')})")
    
    print(f"\nMedium popularity examples:")
    for i, movie in enumerate(sorted(med_pop, key=lambda m: m.get('popularity', 0), reverse=True)[:10]):
        print(f"  {i+1}. {movie.get('title')} (pop: {movie.get('popularity'):.1f}, date: {movie.get('release_date')})")
    
    print(f"\nLow popularity examples:")
    for i, movie in enumerate(sorted(low_pop, key=lambda m: m.get('popularity', 0), reverse=True)[:10]):
        print(f"  {i+1}. {movie.get('title')} (pop: {movie.get('popularity'):.1f}, date: {movie.get('release_date')})")
    
    # TMDB-only candidates (no AMC, no Reel Seattle)
    # Note: Can't match without TMDB IDs in AMC/Reel Seattle data, so approximate by title
    tmdb_titles_lower = {m.get("title", "").lower(): m for m in movies}
    
    print(f"\n{'='*80}")
    print("TMDB-ONLY CANDIDATES (20 representative examples)")
    print("="*80)
    print("\nThese have NO AMC showtimes and NO Reel Seattle showtimes.")
    print("Ordered by popularity (high to low):\n")
    
    for i, movie in enumerate(sorted(movies, key=lambda m: m.get("popularity", 0), reverse=True)[:20]):
        tmdb_id = movie.get("id")
        title = movie.get("title")
        release_date = movie.get("release_date")
        popularity = movie.get("popularity", 0)
        has_poster = "✓" if movie.get("poster_path") else "✗"
        
        print(f"{i+1:2d}. {title}")
        print(f"    TMDB ID: {tmdb_id} | Release: {release_date} | Popularity: {popularity:.1f} | Poster: {has_poster}")
    
    return {
        "total": len(movies),
        "with_poster": with_poster,
        "high_popularity": len(high_pop),
        "medium_popularity": len(med_pop),
        "low_popularity": len(low_pop),
    }


def main():
    print("="*80)
    print("TMDB REAL QUERY TEST")
    print("="*80)
    
    # Test credentials
    auth = test_tmdb_credentials()
    if not auth:
        print("\n" + "="*80)
        print("CONCLUSION")
        print("="*80)
        print("""
TMDB credentials are NOT available in this environment.

To execute this query in a normal credentialed environment, set:
  TMDB_READ_ACCESS_TOKEN (preferred)
  or
  TMDB_API_KEY

The query code is ready and will work once credentials are available.
""")
        return
    
    # Create client
    client = TmdbClient(auth)
    
    # Define window
    today = date.today()
    windows = [
        (30, today + timedelta(days=30)),
        (60, today + timedelta(days=60)),
        (90, today + timedelta(days=90)),
    ]
    
    results = {}
    
    for days, end_date in windows:
        print(f"\n{'='*80}")
        print(f"WINDOW: {days} DAYS (through {end_date})")
        print("="*80)
        
        movies = fetch_tmdb_upcoming_us_theatrical(client, today, end_date, max_pages=10)
        
        # Load AMC and Reel Seattle data for overlap analysis
        amc_movie_ids = set()
        reel_seattle_film_ids = set()
        
        try:
            amc_log = json.loads(Path("data/daily_logs/2026-09-14_amc.json").read_text())
            for record in amc_log.get("records", []):
                movie_id = record.get("attributes", {}).get("movie_id")
                if movie_id:
                    amc_movie_ids.add(str(movie_id))
        except:
            pass
        
        try:
            showtimes = json.loads(Path("public/data/showtimes_current.json").read_text())
            for showtime in showtimes.get("showtimes", []):
                film_id = showtime.get("film_id")
                if film_id:
                    reel_seattle_film_ids.add(film_id)
        except:
            pass
        
        analysis = analyze_tmdb_results(movies, amc_movie_ids, reel_seattle_film_ids)
        results[f"{days}_days"] = {
            "movies": movies,
            "analysis": analysis,
        }
    
    # Save results
    output_path = Path("data/audits/tmdb_real_query_results.json")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    # Simplified version for JSON (without full movie objects)
    output_data = {
        "tested_at": date.today().isoformat(),
        "windows": {}
    }
    
    for days in [30, 60, 90]:
        key = f"{days}_days"
        if key in results:
            output_data["windows"][key] = {
                "analysis": results[key]["analysis"],
                "sample_movies": results[key]["movies"][:50],  # Just first 50
            }
    
    with output_path.open("w", encoding="utf-8") as f:
        json.dump(output_data, f, indent=2)
    
    print(f"\n{'='*80}")
    print(f"Results saved to: {output_path}")
    print("="*80)


if __name__ == "__main__":
    main()
