#!/usr/bin/env python3
"""Generate Coming Soon source audit artifact."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from reel_seattle.emit.coming_soon import write_coming_soon_source_audit


def main():
    """Generate the coming soon audit artifact."""
    
    print("=" * 80)
    print("GENERATING COMING SOON SOURCE AUDIT")
    print("=" * 80)
    
    artifact = write_coming_soon_source_audit()
    
    print("\n" + "=" * 80)
    print("AUDIT COMPLETE")
    print("=" * 80)
    
    # Show representative samples
    entries = artifact.get("entries", [])
    
    print("\n--- Confirmed Local (has future Seattle screenings) ---")
    confirmed = [e for e in entries if e["provisional_status"] == "confirmed_local"]
    for entry in confirmed[:10]:
        print(f"  {entry['expected_release_date']}: {entry['title']}")
        print(f"    Evidence: {', '.join(entry['evidence'])}")
        print(f"    First local: {entry['first_local_screening_date']}")
    
    print(f"\n  ... {len(confirmed)} total")
    
    print("\n--- AMC Announced (no current Seattle screenings yet) ---")
    amc_only = [e for e in entries if e["provisional_status"] == "amc_announced"]
    for entry in amc_only[:15]:
        print(f"  {entry['expected_release_date']}: {entry['title']}")
        print(f"    AMC ID: {entry['amc_movie_id']}")
    
    print(f"\n  ... {len(amc_only)} total")
    
    print("\n--- TMDB Upcoming (if implemented) ---")
    tmdb = [e for e in entries if e["provisional_status"] == "tmdb_upcoming"]
    if tmdb:
        for entry in tmdb[:10]:
            print(f"  {entry['expected_release_date']}: {entry['title']}")
    else:
        print("  (TMDB live queries not yet implemented - would add supplemental evidence)")


if __name__ == "__main__":
    main()
