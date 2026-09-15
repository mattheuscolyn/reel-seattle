#!/usr/bin/env python3
"""Test AMC Coming Soon and TMDB Upcoming data sources for Reel Seattle."""

import json
import os
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import requests

from reel_seattle.adapters.amc import build_amc_headers, AMC_BASE_URL
from reel_seattle.film_identity.tmdb_client import (
    TmdbClient,
    resolve_tmdb_auth,
)


def test_amc_coming_soon_api():
    """Test AMC API for Coming Soon functionality."""
    
    print("\n" + "=" * 80)
    print("PHASE 2: Testing AMC Coming Soon API")
    print("=" * 80)
    
    # Check if we can build headers (secret check)
    try:
        headers = build_amc_headers()
        has_key = bool(headers.get("X-AMC-Vendor-Key"))
        print(f"\nAMC API Key available: {has_key}")
        
        if not has_key:
            print("  ⚠️  AMC_API_KEY not set - trying with existing session pattern")
            # Try to use the pattern from the codebase
            session = requests.Session()
            session.headers.update(headers)
        else:
            session = requests.Session()
            session.headers.update(headers)
            
    except Exception as exc:
        print(f"ERROR setting up AMC client: {exc}")
        return {"error": str(exc), "tests": []}
    
    results = {
        "tested_at": datetime.now().isoformat(),
        "amc_api_key_available": has_key if 'has_key' in locals() else False,
        "tests": []
    }
    
    # Test various endpoints
    endpoints_to_test = [
        ("/v2/movies?page-number=1&page-size=20", "movies_catalog"),
        ("/v2/movies?filter=coming-soon&page-number=1&page-size=100", "coming_soon_filter"),
        ("/v2/movies?filter=now-playing&page-number=1&page-size=20", "now_playing_filter"),
    ]
    
    for endpoint, name in endpoints_to_test:
        url = f"{AMC_BASE_URL}{endpoint}"
        print(f"\n--- Testing: {name} ---")
        print(f"URL: {url}")
        
        try:
            response = session.get(url, timeout=30)
            status = response.status_code
            print(f"Status: {status}")
            
            test_result = {
                "name": name,
                "endpoint": endpoint,
                "status": status,
                "success": status == 200,
            }
            
            if status == 200:
                data = response.json()
                movies = data.get("_embedded", {}).get("movies", [])
                count_field = data.get("count", 0)
                
                print(f"Movies returned: {len(movies)}")
                print(f"Count field: {count_field}")
                
                if movies:
                    sample = movies[0]
                    print(f"Sample fields: {', '.join(list(sample.keys())[:15])}")
                    
                    # Extract key info from first few movies
                    movie_samples = []
                    for movie in movies[:5]:
                        movie_samples.append({
                            "id": movie.get("id"),
                            "name": movie.get("name"),
                            "releaseDate": movie.get("releaseDate"),
                            "slug": movie.get("slug"),
                        })
                        print(f"  - {movie.get('name')} (ID: {movie.get('id')}, Release: {movie.get('releaseDate')})")
                    
                    test_result.update({
                        "movie_count": len(movies),
                        "count_field": count_field,
                        "sample_fields": list(sample.keys()),
                        "movie_samples": movie_samples,
                    })
                    
                    # Check for pagination
                    links = data.get("_links", {})
                    if links.get("next"):
                        print(f"  Has pagination (next link found)")
                        test_result["has_pagination"] = True
                
            else:
                error_text = response.text[:300]
                print(f"Error: {error_text}")
                test_result["error"] = error_text
            
            results["tests"].append(test_result)
            
        except Exception as exc:
            print(f"Exception: {exc}")
            results["tests"].append({
                "name": name,
                "endpoint": endpoint,
                "success": False,
                "error": str(exc),
            })
    
    return results


def test_tmdb_upcoming_api():
    """Test TMDB API for upcoming theatrical releases."""
    
    print("\n" + "=" * 80)
    print("PHASE 3: Testing TMDB Upcoming API")
    print("=" * 80)
    
    try:
        auth = resolve_tmdb_auth(require=True)
        client = TmdbClient(auth)
        print(f"\nTMDB Auth: {auth.mode}")
    except Exception as exc:
        print(f"ERROR: TMDB credentials not available: {exc}")
        return {"error": str(exc), "tests": []}
    
    results = {
        "tested_at": datetime.now().isoformat(),
        "tmdb_auth_mode": auth.mode,
        "tests": []
    }
    
    today = date.today()
    window_end = today + timedelta(days=90)
    
    # Test 1: TMDB /movie/upcoming endpoint
    print("\n--- Test 1: TMDB Upcoming Movies ---")
    try:
        upcoming = client._request("upcoming", "/movie/upcoming", {"page": 1})
        movies = upcoming.get("results", [])
        print(f"Upcoming movies (page 1): {len(movies)}")
        print(f"Total results: {upcoming.get('total_results')}")
        print(f"Total pages: {upcoming.get('total_pages')}")
        
        # Show samples
        print("\nSample upcoming movies:")
        samples = []
        for movie in movies[:10]:
            title = movie.get("title", "Unknown")
            release_date = movie.get("release_date")
            tmdb_id = movie.get("id")
            print(f"  - {title} (TMDB ID: {tmdb_id}, Release: {release_date})")
            samples.append({
                "id": tmdb_id,
                "title": title,
                "release_date": release_date,
                "popularity": movie.get("popularity"),
            })
        
        results["tests"].append({
            "name": "tmdb_upcoming",
            "endpoint": "/movie/upcoming",
            "success": True,
            "movie_count": len(movies),
            "total_results": upcoming.get("total_results"),
            "total_pages": upcoming.get("total_pages"),
            "samples": samples,
        })
        
    except Exception as exc:
        print(f"Error: {exc}")
        results["tests"].append({
            "name": "tmdb_upcoming",
            "success": False,
            "error": str(exc),
        })
    
    # Test 2: TMDB Discover with US theatrical releases
    print("\n--- Test 2: TMDB Discover (US Theatrical, next 90 days) ---")
    try:
        # Discover movies with US theatrical release in the next 90 days
        params = {
            "page": 1,
            "include_adult": "false",
            "language": "en-US",
            "region": "US",
            "release_date.gte": today.isoformat(),
            "release_date.lte": window_end.isoformat(),
            "with_release_type": "2|3",  # 2=Theatrical, 3=Theatrical (limited)
            "sort_by": "release_date.asc",
        }
        
        discover = client._request("discover", "/discover/movie", params)
        movies = discover.get("results", [])
        print(f"Discover movies (page 1): {len(movies)}")
        print(f"Total results: {discover.get('total_results')}")
        print(f"Date range: {today.isoformat()} to {window_end.isoformat()}")
        
        # Show samples
        print("\nSample discovered movies:")
        samples = []
        for movie in movies[:10]:
            title = movie.get("title", "Unknown")
            release_date = movie.get("release_date")
            tmdb_id = movie.get("id")
            print(f"  - {title} (TMDB ID: {tmdb_id}, Release: {release_date})")
            samples.append({
                "id": tmdb_id,
                "title": title,
                "release_date": release_date,
                "popularity": movie.get("popularity"),
            })
        
        results["tests"].append({
            "name": "tmdb_discover_us_theatrical",
            "endpoint": "/discover/movie",
            "success": True,
            "movie_count": len(movies),
            "total_results": discover.get("total_results"),
            "total_pages": discover.get("total_pages"),
            "params": params,
            "samples": samples,
        })
        
    except Exception as exc:
        print(f"Error: {exc}")
        results["tests"].append({
            "name": "tmdb_discover_us_theatrical",
            "success": False,
            "error": str(exc),
        })
    
    return results


def main():
    """Run all coming soon data source tests."""
    
    print("\n" + "=" * 80)
    print("Reel Seattle Coming Soon Data Source Investigation")
    print("=" * 80)
    print(f"Date: {datetime.now().isoformat()}")
    print(f"Window: Next 90 days from {date.today().isoformat()}")
    
    all_results = {
        "investigation_date": datetime.now().isoformat(),
        "window_start": date.today().isoformat(),
        "window_end": (date.today() + timedelta(days=90)).isoformat(),
    }
    
    # Test AMC
    amc_results = test_amc_coming_soon_api()
    all_results["amc"] = amc_results
    
    # Test TMDB
    tmdb_results = test_tmdb_upcoming_api()
    all_results["tmdb"] = tmdb_results
    
    # Save results
    output_path = Path("data/audits/coming_soon_api_tests.json")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as f:
        json.dump(all_results, f, indent=2)
    
    print("\n" + "=" * 80)
    print(f"Results saved to: {output_path}")
    print("=" * 80)
    
    # Summary
    print("\n=== SUMMARY ===\n")
    
    amc_success = sum(1 for t in amc_results.get("tests", []) if t.get("success")) if isinstance(amc_results, dict) else 0
    amc_total = len(amc_results.get("tests", [])) if isinstance(amc_results, dict) else 0
    print(f"AMC API Tests: {amc_success}/{amc_total} successful")
    
    tmdb_success = sum(1 for t in tmdb_results.get("tests", []) if t.get("success")) if isinstance(tmdb_results, dict) else 0
    tmdb_total = len(tmdb_results.get("tests", [])) if isinstance(tmdb_results, dict) else 0
    print(f"TMDB API Tests: {tmdb_success}/{tmdb_total} successful")


if __name__ == "__main__":
    main()
