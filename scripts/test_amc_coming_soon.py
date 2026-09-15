#!/usr/bin/env python3
"""Test AMC Coming Soon API endpoints."""

import json
import os
import sys
import time
from datetime import date, datetime
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).parent.parent))

from reel_seattle.adapters.amc import build_amc_headers, AMC_BASE_URL


def test_amc_coming_soon():
    """Test various AMC API endpoints for Coming Soon data."""
    
    headers = build_amc_headers()
    if not headers.get("X-AMC-Vendor-Key"):
        print("ERROR: AMC_API_KEY not set")
        return
    
    results = {
        "tested_at": datetime.now().isoformat(),
        "tests": []
    }
    
    # Test 1: Movies endpoint (general catalog)
    print("\n=== Test 1: GET /v2/movies (general catalog) ===")
    url = f"{AMC_BASE_URL}/movies?page-number=1&page-size=50"
    try:
        response = requests.get(url, headers=headers, timeout=30)
        status = response.status_code
        print(f"Status: {status}")
        
        if status == 200:
            data = response.json()
            movies = data.get("_embedded", {}).get("movies", [])
            print(f"Movies returned: {len(movies)}")
            
            # Analyze fields
            if movies:
                sample = movies[0]
                print(f"\nSample movie fields: {list(sample.keys())}")
                print(f"Sample movie:")
                print(json.dumps(sample, indent=2)[:1000])
                
            results["tests"].append({
                "endpoint": "/v2/movies",
                "status": status,
                "success": True,
                "movie_count": len(movies),
                "sample_fields": list(sample.keys()) if movies else [],
            })
        else:
            print(f"Failed: {response.text[:500]}")
            results["tests"].append({
                "endpoint": "/v2/movies",
                "status": status,
                "success": False,
                "error": response.text[:500],
            })
    except Exception as exc:
        print(f"Exception: {exc}")
        results["tests"].append({
            "endpoint": "/v2/movies",
            "success": False,
            "error": str(exc),
        })
    
    time.sleep(1)
    
    # Test 2: Movies with filters (coming soon / now playing)
    print("\n=== Test 2: GET /v2/movies?filter=coming-soon ===")
    url = f"{AMC_BASE_URL}/movies?filter=coming-soon&page-number=1&page-size=100"
    try:
        response = requests.get(url, headers=headers, timeout=30)
        status = response.status_code
        print(f"Status: {status}")
        
        if status == 200:
            data = response.json()
            movies = data.get("_embedded", {}).get("movies", [])
            print(f"Coming soon movies: {len(movies)}")
            
            if movies:
                # Show first few titles and release dates
                print("\nFirst 10 coming soon movies:")
                for movie in movies[:10]:
                    title = movie.get("name", "Unknown")
                    release_date = movie.get("releaseDate") or movie.get("releaseDateUtc")
                    movie_id = movie.get("id")
                    print(f"  - {title} (ID: {movie_id}, Release: {release_date})")
                    
            results["tests"].append({
                "endpoint": "/v2/movies?filter=coming-soon",
                "status": status,
                "success": True,
                "movie_count": len(movies),
                "titles": [m.get("name") for m in movies[:20]],
            })
        else:
            print(f"Failed: {response.text[:500]}")
            results["tests"].append({
                "endpoint": "/v2/movies?filter=coming-soon",
                "status": status,
                "success": False,
                "error": response.text[:500],
            })
    except Exception as exc:
        print(f"Exception: {exc}")
        results["tests"].append({
            "endpoint": "/v2/movies?filter=coming-soon",
            "success": False,
            "error": str(exc),
        })
    
    time.sleep(1)
    
    # Test 3: Now playing filter (for comparison)
    print("\n=== Test 3: GET /v2/movies?filter=now-playing ===")
    url = f"{AMC_BASE_URL}/movies?filter=now-playing&page-number=1&page-size=100"
    try:
        response = requests.get(url, headers=headers, timeout=30)
        status = response.status_code
        print(f"Status: {status}")
        
        if status == 200:
            data = response.json()
            movies = data.get("_embedded", {}).get("movies", [])
            print(f"Now playing movies: {len(movies)}")
            results["tests"].append({
                "endpoint": "/v2/movies?filter=now-playing",
                "status": status,
                "success": True,
                "movie_count": len(movies),
            })
        else:
            print(f"Failed: {response.text[:500]}")
            results["tests"].append({
                "endpoint": "/v2/movies?filter=now-playing",
                "status": status,
                "success": False,
                "error": response.text[:500],
            })
    except Exception as exc:
        print(f"Exception: {exc}")
        results["tests"].append({
            "endpoint": "/v2/movies?filter=now-playing",
            "success": False,
            "error": str(exc),
        })
    
    time.sleep(1)
    
    # Test 4: Try to get movie details for a coming soon movie
    # First, get a coming soon movie ID
    url = f"{AMC_BASE_URL}/movies?filter=coming-soon&page-number=1&page-size=5"
    try:
        response = requests.get(url, headers=headers, timeout=30)
        if response.status_code == 200:
            data = response.json()
            movies = data.get("_embedded", {}).get("movies", [])
            if movies:
                movie_id = movies[0].get("id")
                print(f"\n=== Test 4: GET /v2/movies/{movie_id} (movie detail) ===")
                detail_url = f"{AMC_BASE_URL}/movies/{movie_id}"
                detail_response = requests.get(detail_url, headers=headers, timeout=30)
                print(f"Status: {detail_response.status_code}")
                
                if detail_response.status_code == 200:
                    detail_data = detail_response.json()
                    print(f"Movie detail fields: {list(detail_data.keys())}")
                    print(f"\nMovie detail sample:")
                    print(json.dumps(detail_data, indent=2)[:2000])
                    
                    results["tests"].append({
                        "endpoint": f"/v2/movies/{movie_id}",
                        "status": detail_response.status_code,
                        "success": True,
                        "fields": list(detail_data.keys()),
                    })
                else:
                    results["tests"].append({
                        "endpoint": f"/v2/movies/{movie_id}",
                        "status": detail_response.status_code,
                        "success": False,
                        "error": detail_response.text[:500],
                    })
    except Exception as exc:
        print(f"Exception in Test 4: {exc}")
        results["tests"].append({
            "endpoint": "/v2/movies/{id}",
            "success": False,
            "error": str(exc),
        })
    
    # Save results
    output_path = Path("data/audits/amc_coming_soon_test.json")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)
    
    print(f"\n=== Results saved to {output_path} ===")
    return results


if __name__ == "__main__":
    test_amc_coming_soon()
