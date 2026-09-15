"""TMDB upcoming/discover integration for Coming Soon (requires live TMDB access).

This module documents and implements TMDB queries for upcoming US theatrical releases.
NOTE: Requires TMDB_READ_ACCESS_TOKEN or TMDB_API_KEY environment variable.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from reel_seattle.film_identity.tmdb_client import TmdbClient, TmdbAuthError


def fetch_tmdb_upcoming_us_theatrical(
    client: TmdbClient,
    *,
    start_date: date,
    end_date: date,
    max_pages: int = 5,
) -> list[dict[str, Any]]:
    """Fetch upcoming US theatrical releases from TMDB Discover API.
    
    Uses TMDB /discover/movie with:
    - region=US
    - release_date.gte / release_date.lte for date window
    - with_release_type=2|3 (Theatrical | Theatrical Limited)
    - sort_by=release_date.asc
    
    Returns list of movies with at least:
    - id (TMDB ID)
    - title
    - release_date
    - popularity
    """
    
    results = []
    
    for page in range(1, max_pages + 1):
        try:
            params = {
                "page": page,
                "include_adult": "false",
                "language": "en-US",
                "region": "US",
                "release_date.gte": start_date.isoformat(),
                "release_date.lte": end_date.isoformat(),
                "with_release_type": "2|3",  # 2=Theatrical, 3=Theatrical Limited
                "sort_by": "release_date.asc",
            }
            
            response = client._request("discover", "/discover/movie", params)
            movies = response.get("results", [])
            
            if not movies:
                break
            
            results.extend(movies)
            
            # Check if more pages available
            total_pages = response.get("total_pages", 0)
            if page >= total_pages:
                break
                
        except Exception as exc:
            print(f"TMDB discover page {page} failed: {exc}")
            break
    
    return results


def fetch_tmdb_upcoming_standard(
    client: TmdbClient,
    *,
    max_pages: int = 3,
) -> list[dict[str, Any]]:
    """Fetch from TMDB /movie/upcoming endpoint.
    
    This is a simpler endpoint but less precise than Discover.
    Returns upcoming movies but may include international releases.
    """
    
    results = []
    
    for page in range(1, max_pages + 1):
        try:
            response = client._request("upcoming", "/movie/upcoming", {"page": page})
            movies = response.get("results", [])
            
            if not movies:
                break
            
            results.extend(movies)
            
            total_pages = response.get("total_pages", 0)
            if page >= total_pages:
                break
                
        except Exception as exc:
            print(f"TMDB upcoming page {page} failed: {exc}")
            break
    
    return results


def tmdb_movie_to_candidate_info(movie: dict[str, Any]) -> dict[str, Any]:
    """Extract candidate info from TMDB movie object."""
    
    return {
        "tmdb_id": int(movie["id"]),
        "title": movie.get("title", "Unknown"),
        "original_title": movie.get("original_title"),
        "release_date": movie.get("release_date"),
        "popularity": movie.get("popularity"),
        "poster_path": movie.get("poster_path"),
        "overview": movie.get("overview"),
    }


# Example usage (when TMDB credentials are available):
"""
from reel_seattle.film_identity.tmdb_client import resolve_tmdb_auth, TmdbClient
from datetime import date, timedelta

try:
    auth = resolve_tmdb_auth(require=True)
    client = TmdbClient(auth)
    
    today = date.today()
    window_end = today + timedelta(days=90)
    
    # Fetch US theatrical releases
    theatrical = fetch_tmdb_upcoming_us_theatrical(
        client,
        start_date=today,
        end_date=window_end,
    )
    
    print(f"Found {len(theatrical)} TMDB upcoming US theatrical releases")
    
    for movie in theatrical[:20]:
        info = tmdb_movie_to_candidate_info(movie)
        print(f"  {info['release_date']}: {info['title']} (TMDB {info['tmdb_id']})")
        
except TmdbAuthError as exc:
    print(f"TMDB auth not available: {exc}")
"""
