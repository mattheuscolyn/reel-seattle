#!/usr/bin/env python3
"""Investigate AMC's true Coming Soon catalog API.

This script tests various AMC movie catalog endpoints to find the actual
Coming Soon source, separate from theater showtimes.
"""

import json
import os
import sys
import time
from datetime import date, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import requests

from reel_seattle.adapters.amc import build_amc_headers, AMC_BASE_URL


def test_amc_catalog_endpoints():
    """Test various AMC movie catalog endpoints."""
    
    print("=" * 80)
    print("AMC CATALOG API INVESTIGATION")
    print("=" * 80)
    
    headers = build_amc_headers()
    session = requests.Session()
    session.headers.update(headers)
    
    results = {
        "tested_at": datetime.now().isoformat(),
        "base_url": AMC_BASE_URL,
        "endpoints_tested": []
    }
    
    # Test various endpoint patterns
    endpoints = [
        # Coming Soon views
        ("/v2/movies/views/coming-soon", "coming_soon_view"),
        ("/v2/movies?filter=coming-soon", "movies_filter_coming_soon"),
        ("/v2/movies?filter=comingsoon", "movies_filter_comingsoon"),
        
        # Now playing for comparison
        ("/v2/movies?filter=now-playing", "movies_filter_now_playing"),
        
        # General movies catalog
        ("/v2/movies", "movies_catalog"),
        
        # Specific movie by ID (test with known IDs)
        ("/v2/movies/79853", "movie_verity"),  # Verity
        ("/v2/movies/70533", "movie_avengers_doomsday"),  # Avengers: Doomsday
        ("/v2/movies/77032", "movie_dune_part_three"),  # Dune: Part Three
    ]
    
    for endpoint, name in endpoints:
        url = f"{AMC_BASE_URL}{endpoint}"
        if "?" not in endpoint:
            url += "?page-number=1&page-size=20"
        elif "page" not in endpoint:
            url += "&page-number=1&page-size=20"
        
        print(f"\n{'='*80}")
        print(f"Testing: {name}")
        print(f"URL: {url}")
        print('-' * 80)
        
        test_result = {
            "name": name,
            "endpoint": endpoint,
            "url": url,
            "timestamp": datetime.now().isoformat(),
        }
        
        try:
            response = session.get(url, timeout=30)
            status = response.status_code
            test_result["status"] = status
            
            print(f"Status: {status}")
            
            if status == 200:
                try:
                    data = response.json()
                    test_result["success"] = True
                    
                    # Analyze structure
                    if isinstance(data, dict):
                        # Check for embedded movies
                        embedded = data.get("_embedded", {})
                        movies = embedded.get("movies", [])
                        
                        if movies:
                            test_result["movie_count"] = len(movies)
                            test_result["total_count"] = data.get("count")
                            
                            print(f"Movies returned: {len(movies)}")
                            print(f"Total count field: {data.get('count')}")
                            
                            # Check pagination
                            links = data.get("_links", {})
                            if links.get("next"):
                                test_result["has_pagination"] = True
                                print("Has pagination: YES")
                            
                            # Analyze first movie
                            if movies:
                                sample = movies[0]
                                test_result["sample_fields"] = list(sample.keys())
                                
                                print(f"\nSample movie fields:")
                                print(f"  {', '.join(list(sample.keys())[:20])}")
                                
                                # Key fields
                                movie_id = sample.get("id")
                                name = sample.get("name")
                                release_date = sample.get("releaseDate")
                                slug = sample.get("slug")
                                
                                print(f"\nFirst movie:")
                                print(f"  ID: {movie_id}")
                                print(f"  Name: {name}")
                                print(f"  Release Date: {release_date}")
                                print(f"  Slug: {slug}")
                                
                                # Check for performance/showtime data
                                has_showtimes = "showtimes" in sample or "performances" in sample
                                test_result["has_showtimes_in_record"] = has_showtimes
                                print(f"  Has showtimes in record: {has_showtimes}")
                                
                                # Check for ticket availability indicators
                                on_sale = sample.get("onSale") or sample.get("isOnSale")
                                advance_tickets = sample.get("advanceTicketsAvailable")
                                test_result["has_ticket_indicators"] = bool(on_sale is not None or advance_tickets is not None)
                                
                                if on_sale is not None:
                                    print(f"  On Sale: {on_sale}")
                                if advance_tickets is not None:
                                    print(f"  Advance Tickets: {advance_tickets}")
                                
                                # Show first 5 movies
                                print(f"\nFirst 5 movies:")
                                for i, movie in enumerate(movies[:5]):
                                    mid = movie.get("id")
                                    mname = movie.get("name")
                                    mdate = movie.get("releaseDate")
                                    print(f"  {i+1}. {mname} (ID: {mid}, Release: {mdate})")
                                
                                # Store samples
                                test_result["samples"] = [
                                    {
                                        "id": m.get("id"),
                                        "name": m.get("name"),
                                        "releaseDate": m.get("releaseDate"),
                                        "slug": m.get("slug"),
                                    }
                                    for m in movies[:10]
                                ]
                        
                        else:
                            # Single movie response
                            if "id" in data and "name" in data:
                                test_result["is_single_movie"] = True
                                print(f"\nSingle movie:")
                                print(f"  ID: {data.get('id')}")
                                print(f"  Name: {data.get('name')}")
                                print(f"  Release Date: {data.get('releaseDate')}")
                                
                                # Check for showtimes/performances
                                has_performances = bool(data.get("performances") or data.get("showtimes"))
                                test_result["has_performances"] = has_performances
                                print(f"  Has performances: {has_performances}")
                                
                                # Full fields
                                test_result["fields"] = list(data.keys())
                                print(f"\nAll fields: {', '.join(list(data.keys())[:30])}")
                
                except json.JSONDecodeError:
                    test_result["success"] = False
                    test_result["error"] = "Invalid JSON response"
                    print("ERROR: Invalid JSON response")
            
            elif status == 400:
                error_text = response.text[:500]
                test_result["error"] = error_text
                print(f"ERROR: {error_text}")
            
            elif status == 404:
                test_result["error"] = "Not Found"
                print("ERROR: 404 Not Found")
            
            else:
                error_text = response.text[:300]
                test_result["error"] = error_text
                print(f"ERROR: {error_text}")
        
        except Exception as exc:
            test_result["success"] = False
            test_result["error"] = str(exc)
            print(f"EXCEPTION: {exc}")
        
        results["endpoints_tested"].append(test_result)
        time.sleep(0.5)  # Rate limiting
    
    # Save results
    output_path = Path("data/audits/amc_catalog_api_investigation.json")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)
    
    print("\n" + "=" * 80)
    print(f"Results saved to: {output_path}")
    print("=" * 80)
    
    # Summary
    print("\nSUMMARY:")
    successful = [t for t in results["endpoints_tested"] if t.get("success")]
    print(f"  Successful endpoints: {len(successful)}/{len(results['endpoints_tested'])}")
    
    for test in successful:
        print(f"\n  ✓ {test['name']}")
        if test.get("movie_count"):
            print(f"    Movies: {test['movie_count']}")
        if test.get("has_pagination"):
            print(f"    Pagination: YES")
        if test.get("has_showtimes_in_record") is False:
            print(f"    Showtimes in record: NO (pure catalog)")
    
    return results


if __name__ == "__main__":
    test_amc_catalog_endpoints()
