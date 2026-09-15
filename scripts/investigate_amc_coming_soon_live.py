#!/usr/bin/env python3
"""Probe AMC's movie/Coming Soon catalog API with live vendor credentials.

Answers, with recorded evidence:
  * can ``AMC_API_KEY`` reach a true movie/catalog/Coming Soon endpoint
  * the exact endpoint and query string used
  * whether the catalog returns titles with zero known performances
  * pagination shape, release-date range, ticket/on-sale fields
  * national vs theater-specific behavior
  * whether specific target titles appear independently of theater bookings

Catalog membership is recorded separately from theater bookings; the two are
never merged here.

Secrets are read from the environment and are never printed or serialized: AMC
authenticates with the ``X-AMC-Vendor-Key`` header, so request URLs stay clean,
and every recorded string passes through the live-audit sanitizer.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Iterable, Mapping
from urllib.parse import urlencode

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import requests

from reel_seattle.adapters.amc import AMC_BASE_URL, build_amc_headers
from reel_seattle.emit.coming_soon_live import (
    load_amc_theater_bookings,
    match_key,
    pacific_today,
)
from reel_seattle.live_audit_security import (
    credential_presence,
    scrub_text,
    write_sanitized_json,
)

SCHEMA_VERSION = "1.0.0"

TARGET_TITLES = ("Verity", "Avengers: Doomsday", "Dune: Part Three")
TARGET_SLUGS = ("verity", "avengers-doomsday", "dune-part-three")

# AMC movie records are keyed by these field-name fragments when they carry
# ticketing / scheduling signals. Detected dynamically so an unexpected field
# name still gets reported.
TICKET_FIELD_FRAGMENTS = (
    "ticket",
    "onsale",
    "on_sale",
    "sale",
    "showtime",
    "performance",
    "presale",
    "earliestshowing",
)

REQUEST_TIMEOUT = 30
SLEEP_SECONDS = 0.35
ERROR_TEXT_LIMIT = 400


def _summarize_error(response: requests.Response) -> str:
    text = (response.text or "").strip()
    # AMC error bodies are pretty-printed with heavy indentation.
    compact = " ".join(text.split())
    return scrub_text(compact[:ERROR_TEXT_LIMIT])


def _embedded_items(payload: Mapping[str, Any]) -> tuple[str | None, list[dict[str, Any]]]:
    embedded = payload.get("_embedded")
    if not isinstance(embedded, Mapping):
        return None, []
    for key, value in embedded.items():
        if isinstance(value, list):
            return key, [item for item in value if isinstance(item, dict)]
    return None, []


class AmcProbe:
    """Performs and records AMC API probes."""

    def __init__(self, session: requests.Session, *, sleep_seconds: float = SLEEP_SECONDS) -> None:
        self.session = session
        self.sleep_seconds = sleep_seconds
        self.probes: list[dict[str, Any]] = []

    def get(
        self,
        path: str,
        *,
        name: str,
        params: Mapping[str, Any] | None = None,
        record: bool = True,
        note: str | None = None,
    ) -> tuple[dict[str, Any], dict[str, Any] | None]:
        """GET ``AMC_BASE_URL + path`` and record a sanitized probe result.

        ``AMC_BASE_URL`` already ends in ``/v2``; paths must not repeat it.
        """
        query = urlencode(dict(params or {}))
        url = f"{AMC_BASE_URL}{path}" + (f"?{query}" if query else "")

        probe: dict[str, Any] = {
            "name": name,
            "method": "GET",
            "path": path,
            "query": dict(params or {}),
            "url": url,
            "auth": "X-AMC-Vendor-Key header",
        }
        if note:
            probe["note"] = note

        payload: dict[str, Any] | None = None
        try:
            response = self.session.get(url, timeout=REQUEST_TIMEOUT)
            probe["status"] = response.status_code
            probe["ok"] = response.status_code == 200
            if response.status_code == 200:
                try:
                    body = response.json()
                except ValueError:
                    probe["ok"] = False
                    probe["error"] = "response was not valid JSON"
                else:
                    if isinstance(body, dict):
                        payload = body
                        collection_key, items = _embedded_items(body)
                        if collection_key is not None:
                            probe["collection"] = collection_key
                            probe["item_count"] = len(items)
                            probe["total_count"] = body.get("count")
                            probe["page_number"] = body.get("pageNumber")
                            probe["page_size"] = body.get("pageSize")
                            links = body.get("_links")
                            probe["has_next_link"] = bool(
                                isinstance(links, Mapping) and links.get("next")
                            )
                        elif "id" in body:
                            probe["single_resource"] = True
                            probe["resource_id"] = body.get("id")
                            probe["resource_name"] = scrub_text(str(body.get("name") or ""))
                        probe["top_level_fields"] = sorted(str(key) for key in body.keys())
                    else:
                        probe["ok"] = False
                        probe["error"] = "response JSON was not an object"
            else:
                probe["error"] = _summarize_error(response)
                probe["authentication_error"] = "vendor authentication" in (
                    probe["error"] or ""
                ).casefold()
        except requests.RequestException as exc:
            probe["ok"] = False
            probe["error"] = scrub_text(f"{type(exc).__name__}: {exc}"[:ERROR_TEXT_LIMIT])

        if record:
            self.probes.append(probe)
        time.sleep(self.sleep_seconds)
        return probe, payload


def paginate_collection(
    prober: AmcProbe,
    path: str,
    *,
    name: str,
    page_size: int,
    max_pages: int,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """Walk a paginated AMC collection, recording pagination behavior."""
    items: list[dict[str, Any]] = []
    pagination: dict[str, Any] = {
        "page_size_requested": page_size,
        "pages_fetched": 0,
        "max_pages": max_pages,
        "page_details": [],
        "exhausted": False,
        "next_link_observed": False,
    }

    for page_number in range(1, max_pages + 1):
        probe, payload = prober.get(
            path,
            name=f"{name}_page_{page_number}",
            params={"page-number": page_number, "page-size": page_size},
            record=page_number == 1,
        )
        if not probe.get("ok") or payload is None:
            pagination["stopped_reason"] = f"page {page_number} returned status {probe.get('status')}"
            pagination["stopped_error"] = probe.get("error")
            break

        _collection_key, page_items = _embedded_items(payload)
        items.extend(page_items)
        pagination["pages_fetched"] = page_number
        pagination["total_count_field"] = payload.get("count")
        pagination["page_size_reported"] = payload.get("pageSize")
        links = payload.get("_links") if isinstance(payload.get("_links"), Mapping) else {}
        has_next = bool(links.get("next"))
        pagination["next_link_observed"] = pagination["next_link_observed"] or has_next
        pagination["page_details"].append(
            {
                "page_number": page_number,
                "item_count": len(page_items),
                "has_next_link": has_next,
            }
        )

        if not page_items or not has_next:
            pagination["exhausted"] = True
            break
    else:
        pagination["stopped_reason"] = f"hit max_pages={max_pages}"

    pagination["items_collected"] = len(items)
    return pagination, items


def extract_movie(movie: Mapping[str, Any]) -> dict[str, Any]:
    """Project an AMC movie record down to audit-relevant fields."""
    ticket_fields = {
        str(key): movie[key]
        for key in movie
        if any(fragment in str(key).casefold() for fragment in TICKET_FIELD_FRAGMENTS)
        and not isinstance(movie[key], (dict, list))
    }
    links = movie.get("_links")
    return {
        "amc_movie_id": str(movie.get("id")) if movie.get("id") is not None else None,
        "name": scrub_text(str(movie.get("name") or "")),
        "slug": movie.get("slug"),
        "release_date": movie.get("releaseDateUtc") or movie.get("releaseDate"),
        "earliest_showing_utc": movie.get("earliestShowingUtc"),
        "has_scheduled_showtimes": movie.get("hasScheduledShowtimes"),
        "mpaa_rating": movie.get("mpaaRating"),
        "run_time": movie.get("runTime"),
        "wwm_release_number": movie.get("wwmReleaseNumber"),
        "ticket_fields": ticket_fields,
        "link_keys": sorted(str(key) for key in links.keys()) if isinstance(links, Mapping) else [],
    }


def _release_date_range(movies: Iterable[Mapping[str, Any]]) -> dict[str, Any]:
    dates: list[str] = []
    missing = 0
    for movie in movies:
        raw = movie.get("release_date")
        if isinstance(raw, str) and raw.strip():
            dates.append(raw.strip()[:10])
        else:
            missing += 1
    dates.sort()
    return {
        "min": dates[0] if dates else None,
        "max": dates[-1] if dates else None,
        "with_release_date": len(dates),
        "missing_release_date": missing,
    }


def _field_inventory(raw_movies: Iterable[Mapping[str, Any]]) -> dict[str, Any]:
    field_names: set[str] = set()
    ticket_field_names: set[str] = set()
    link_names: set[str] = set()
    for movie in raw_movies:
        for key in movie:
            field_names.add(str(key))
            if any(fragment in str(key).casefold() for fragment in TICKET_FIELD_FRAGMENTS):
                ticket_field_names.add(str(key))
        links = movie.get("_links")
        if isinstance(links, Mapping):
            link_names.update(str(key) for key in links)
    return {
        "movie_fields": sorted(field_names),
        "ticket_or_showtime_fields": sorted(ticket_field_names),
        "link_relations": sorted(link_names),
    }


def analyze_zero_performances(
    prober: AmcProbe,
    movies: list[dict[str, Any]],
    *,
    local_booking_ids: set[str],
    local_booking_keys: set[str],
    sample_size: int,
) -> dict[str, Any]:
    """Determine whether the catalog includes titles with no known performances."""
    analysis: dict[str, Any] = {
        "field_signal": {
            "field": "hasScheduledShowtimes",
            "available": any(movie.get("has_scheduled_showtimes") is not None for movie in movies),
        },
        "local_comparison": {
            "definition": (
                "Catalog title whose AMC movie id and match key are both absent from "
                "Seattle-area announced performances in the committed AMC scrape log."
            ),
        },
        "live_per_movie_probe": {"usable": False},
    }

    with_flag = [m for m in movies if m.get("has_scheduled_showtimes") is not None]
    if with_flag:
        no_showtimes = [m for m in with_flag if m.get("has_scheduled_showtimes") is False]
        analysis["field_signal"].update(
            {
                "titles_with_flag": len(with_flag),
                "titles_with_zero_scheduled_showtimes": len(no_showtimes),
                "titles_with_scheduled_showtimes": len(with_flag) - len(no_showtimes),
                "examples_zero_scheduled": [
                    {
                        "amc_movie_id": m["amc_movie_id"],
                        "name": m["name"],
                        "release_date": m["release_date"],
                    }
                    for m in no_showtimes[:15]
                ],
            }
        )

    zero_local = [
        m
        for m in movies
        if (m["amc_movie_id"] or "") not in local_booking_ids
        and match_key(m["name"]) not in local_booking_keys
    ]
    analysis["local_comparison"].update(
        {
            "catalog_titles": len(movies),
            "titles_with_zero_known_local_performances": len(zero_local),
            "titles_with_local_performances": len(movies) - len(zero_local),
            "examples_zero_local": [
                {
                    "amc_movie_id": m["amc_movie_id"],
                    "name": m["name"],
                    "release_date": m["release_date"],
                    "has_scheduled_showtimes": m["has_scheduled_showtimes"],
                }
                for m in zero_local[:15]
            ],
        }
    )

    # Try a live per-movie showtimes lookup so "zero performances" can be
    # checked against AMC rather than only against our own scrape.
    candidates = [m for m in movies if m["amc_movie_id"]][:sample_size]
    if candidates:
        first = candidates[0]
        shapes = [
            (f"/movies/{first['amc_movie_id']}/showtimes", {"page-number": 1, "page-size": 1}),
            (f"/movies/{first['amc_movie_id']}/theatres", {"page-number": 1, "page-size": 1}),
            ("/showtimes", {"movie-id": first["amc_movie_id"], "page-number": 1, "page-size": 1}),
        ]
        usable_shape: str | None = None
        for shape_index, (path, params) in enumerate(shapes, start=1):
            probe, _payload = prober.get(
                path,
                name=f"per_movie_performance_shape_{shape_index}",
                params=params,
                note="probing for a per-movie performance endpoint",
            )
            if probe.get("ok"):
                usable_shape = path.replace(str(first["amc_movie_id"]), "{movie_id}")
                analysis["live_per_movie_probe"] = {
                    "usable": True,
                    "path_template": usable_shape,
                    "query": dict(params),
                }
                break

        if usable_shape and usable_shape.endswith("/showtimes") and "{movie_id}" in usable_shape:
            checked: list[dict[str, Any]] = []
            for movie in candidates:
                probe, payload = prober.get(
                    f"/movies/{movie['amc_movie_id']}/showtimes",
                    name=f"per_movie_showtimes_{movie['amc_movie_id']}",
                    params={"page-number": 1, "page-size": 1},
                    record=False,
                )
                total = None
                if probe.get("ok") and payload is not None:
                    total = payload.get("count")
                    if total is None:
                        _key, items = _embedded_items(payload)
                        total = len(items)
                checked.append(
                    {
                        "amc_movie_id": movie["amc_movie_id"],
                        "name": movie["name"],
                        "release_date": movie["release_date"],
                        "status": probe.get("status"),
                        "performance_count": total,
                    }
                )
            zero_national = [c for c in checked if c["performance_count"] == 0]
            analysis["live_per_movie_probe"].update(
                {
                    "sample_size": len(checked),
                    "titles_with_zero_performances_national": len(zero_national),
                    "sample": checked[:25],
                }
            )
        elif not usable_shape:
            analysis["live_per_movie_probe"]["note"] = (
                "No per-movie performance endpoint responded 200; national "
                "zero-performance claims rely on the hasScheduledShowtimes field."
            )

    return analysis


def investigate_targets(
    prober: AmcProbe,
    *,
    catalog_movies: list[dict[str, Any]],
    catalog_accessible: bool,
    local_booking_ids: set[str],
    local_booking_keys: set[str],
) -> dict[str, Any]:
    """Check each target title for catalog presence independent of bookings."""
    results: dict[str, Any] = {}
    by_key = {match_key(movie["name"]): movie for movie in catalog_movies}

    for title, slug in zip(TARGET_TITLES, TARGET_SLUGS):
        key = match_key(title)
        catalog_hit = by_key.get(key)
        if catalog_hit is None:
            # Fall back to substring matching for punctuation drift.
            needle = key.replace("-", "")
            for movie_key, movie in by_key.items():
                if needle and needle in movie_key.replace("-", ""):
                    catalog_hit = movie
                    break

        entry: dict[str, Any] = {
            "target_title": title,
            "match_key": key,
            "catalog_endpoint_accessible": catalog_accessible,
            "in_amc_coming_soon_catalog": catalog_hit is not None,
            "amc_theater_booking_present": key in local_booking_keys,
        }
        if catalog_hit:
            entry.update(
                {
                    "amc_movie_id": catalog_hit["amc_movie_id"],
                    "catalog_name": catalog_hit["name"],
                    "catalog_release_date": catalog_hit["release_date"],
                    "has_scheduled_showtimes": catalog_hit["has_scheduled_showtimes"],
                    "ticket_fields": catalog_hit["ticket_fields"],
                    "amc_movie_id_in_local_bookings": (catalog_hit["amc_movie_id"] or "")
                    in local_booking_ids,
                }
            )

        # Direct slug lookup is independent of both the catalog listing and bookings.
        slug_probe, slug_payload = prober.get(
            f"/movies/{slug}",
            name=f"movie_by_slug_{slug}",
            note="direct catalog lookup by slug",
        )
        entry["slug_lookup"] = {
            "path": f"/movies/{slug}",
            "status": slug_probe.get("status"),
            "found": bool(slug_probe.get("ok")),
        }
        if slug_probe.get("ok") and isinstance(slug_payload, Mapping):
            projected = extract_movie(slug_payload)
            entry["slug_lookup"].update(
                {
                    "amc_movie_id": projected["amc_movie_id"],
                    "name": projected["name"],
                    "release_date": projected["release_date"],
                    "has_scheduled_showtimes": projected["has_scheduled_showtimes"],
                    "ticket_fields": projected["ticket_fields"],
                }
            )

        catalog_or_slug = entry["in_amc_coming_soon_catalog"] or entry["slug_lookup"]["found"]
        entry["appears_independently_of_theater_bookings"] = bool(
            catalog_or_slug and not entry["amc_theater_booking_present"]
        )
        entry["evidence_summary"] = (
            "catalog evidence only"
            if catalog_or_slug and not entry["amc_theater_booking_present"]
            else "catalog and theater booking evidence"
            if catalog_or_slug and entry["amc_theater_booking_present"]
            else "theater booking evidence only"
            if entry["amc_theater_booking_present"]
            else "no AMC evidence found"
        )
        results[title] = entry

    return results


def investigate_national_vs_theater(
    prober: AmcProbe,
    *,
    national_movies: list[dict[str, Any]],
    theater: Mapping[str, Any] | None,
    page_size: int,
) -> dict[str, Any]:
    """Compare the national catalog with theater-scoped catalog endpoints."""
    result: dict[str, Any] = {
        "national_title_count": len(national_movies),
        "theater_probed": None,
        "theater_endpoints": [],
    }
    if theater is None:
        result["note"] = "No Seattle-area AMC theater id resolved; theater-scoped probes skipped."
        return result

    theater_id = str(theater.get("id"))
    result["theater_probed"] = {
        "amc_theater_id": theater_id,
        "name": scrub_text(str(theater.get("name") or "")),
    }

    shapes = [
        (f"/theatres/{theater_id}/movies/views/coming-soon", {"page-number": 1, "page-size": page_size}),
        (f"/theatres/{theater_id}/movies", {"page-number": 1, "page-size": page_size}),
        ("/movies/views/coming-soon", {"page-number": 1, "page-size": page_size, "theatre-id": theater_id}),
    ]

    national_keys = {match_key(movie["name"]) for movie in national_movies}

    for path, params in shapes:
        probe, payload = prober.get(
            path,
            name=f"theater_scoped{path.replace(theater_id, '{theater_id}')}",
            params=params,
            note="national vs theater-specific comparison",
        )
        record: dict[str, Any] = {
            "path": path.replace(theater_id, "{theater_id}"),
            "query": dict(params),
            "status": probe.get("status"),
            "accessible": bool(probe.get("ok")),
            "item_count": probe.get("item_count"),
            "total_count": probe.get("total_count"),
        }
        if probe.get("ok") and isinstance(payload, Mapping):
            _key, items = _embedded_items(payload)
            theater_keys = {match_key(str(item.get("name") or "")) for item in items}
            theater_keys.discard("")
            record["sample_titles"] = [
                scrub_text(str(item.get("name") or "")) for item in items[:10]
            ]
            record["titles_also_in_national_page"] = len(theater_keys & national_keys)
            record["titles_not_in_national_page"] = len(theater_keys - national_keys)
        result["theater_endpoints"].append(record)

    accessible = [r for r in result["theater_endpoints"] if r["accessible"]]
    result["behavior"] = (
        "national catalog only; no theater-scoped catalog endpoint responded 200"
        if not accessible
        else "both national and theater-scoped catalog endpoints respond"
    )
    return result


def resolve_seattle_theater(prober: AmcProbe) -> tuple[dict[str, Any], dict[str, Any] | None]:
    """Authenticate against ``/theatres`` and pick a Seattle-area theater."""
    probe, payload = prober.get(
        "/theatres",
        name="auth_probe_theatres",
        params={"page-number": 1, "page-size": 100},
        note="credential reachability check and theater id source",
    )
    auth = {
        "probe_path": "/theatres",
        "status": probe.get("status"),
        "authenticated": bool(probe.get("ok")),
        "error": probe.get("error"),
    }
    if not probe.get("ok") or payload is None:
        return auth, None

    _key, theaters = _embedded_items(payload)
    preferred = ("Pacific Place", "Seattle", "Alderwood", "Factoria")
    for needle in preferred:
        for theater in theaters:
            if needle.casefold() in str(theater.get("name") or "").casefold():
                return auth, theater
    return auth, theaters[0] if theaters else None


def select_catalog_endpoint(prober: AmcProbe, *, page_size: int) -> dict[str, Any]:
    """Probe candidate catalog endpoints and pick the Coming Soon source."""
    candidates = [
        ("/movies/views/coming-soon", "coming_soon_view", True),
        ("/movies/views/now-playing", "now_playing_view", False),
        ("/movies/views/advance-tickets", "advance_tickets_view", False),
        ("/movies/views/all", "all_movies_view", False),
        ("/movies", "movies_catalog", False),
    ]
    probed: list[dict[str, Any]] = []
    for path, name, _preferred in candidates:
        probe, _payload = prober.get(
            path,
            name=name,
            params={"page-number": 1, "page-size": page_size},
        )
        probed.append(probe)

    accessible = [p for p in probed if p.get("ok") and p.get("collection")]
    preferred_order = [
        "/movies/views/coming-soon",
        "/movies/views/advance-tickets",
        "/movies",
        "/movies/views/all",
    ]
    selected = None
    for path in preferred_order:
        for probe in accessible:
            if probe["path"] == path:
                selected = probe
                break
        if selected:
            break
    if selected is None and accessible:
        selected = accessible[0]

    return {
        "probed": probed,
        "selected": selected,
        "accessible_count": len(accessible),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", default="audit-output", help="Directory for audit artifacts")
    parser.add_argument(
        "--amc-log",
        default=None,
        help="AMC daily scrape log used for theater-booking comparison (defaults to newest)",
    )
    parser.add_argument("--logs-dir", default="data/daily_logs")
    parser.add_argument("--page-size", type=int, default=100)
    parser.add_argument("--max-pages", type=int, default=40)
    parser.add_argument("--sample-size", type=int, default=25)
    parser.add_argument("--window-days", type=int, default=90)
    parser.add_argument("--sleep-seconds", type=float, default=SLEEP_SECONDS)
    args = parser.parse_args()

    presence = credential_presence()
    print("AMC Coming Soon catalog investigation (live)")
    print(f"  credential presence: {json.dumps(presence)}")

    today = pacific_today()
    window_end = today + timedelta(days=args.window_days)

    if args.amc_log:
        amc_log_path = Path(args.amc_log)
    else:
        logs = sorted(Path(args.logs_dir).glob("*_amc.json"))
        amc_log_path = logs[-1] if logs else Path(args.logs_dir) / "missing_amc.json"

    bookings = load_amc_theater_bookings(amc_log_path, today=today, window_end=window_end)
    local_booking_keys = set(bookings)
    local_booking_ids: set[str] = set()
    for booking in bookings.values():
        local_booking_ids.update(str(mid) for mid in booking.get("amc_movie_ids") or set())
    print(f"  local AMC theater bookings (context only): {len(local_booking_keys)} titles from {amc_log_path}")

    session = requests.Session()
    session.headers.update(build_amc_headers())
    prober = AmcProbe(session, sleep_seconds=args.sleep_seconds)

    auth, theater = resolve_seattle_theater(prober)
    print(f"  auth probe /theatres -> status {auth['status']} authenticated={auth['authenticated']}")

    selection = select_catalog_endpoint(prober, page_size=args.page_size)
    selected = selection["selected"]

    catalog: dict[str, Any] = {
        "selected_endpoint": selected["path"] if selected else None,
        "accessible": bool(selected),
        "endpoint_candidates": [
            {
                "path": probe["path"],
                "query": probe["query"],
                "url": probe["url"],
                "status": probe.get("status"),
                "accessible": bool(probe.get("ok")),
                "item_count": probe.get("item_count"),
                "total_count": probe.get("total_count"),
                "error": probe.get("error"),
            }
            for probe in selection["probed"]
        ],
        "movies": [],
    }

    raw_movies: list[dict[str, Any]] = []
    if selected:
        print(f"  paginating catalog endpoint {selected['path']}")
        pagination, raw_movies = paginate_collection(
            prober,
            selected["path"],
            name="catalog",
            page_size=args.page_size,
            max_pages=args.max_pages,
        )
        movies = [extract_movie(movie) for movie in raw_movies]
        catalog.update(
            {
                "exact_query": {"page-number": "1..N", "page-size": args.page_size},
                "exact_url_template": f"{AMC_BASE_URL}{selected['path']}?page-number={{n}}&page-size={args.page_size}",
                "pagination": pagination,
                "title_count": len(movies),
                "release_date_range": _release_date_range(movies),
                "field_inventory": _field_inventory(raw_movies),
                "movies": movies,
            }
        )
        print(f"  catalog titles collected: {len(movies)}")
    else:
        catalog["note"] = "No AMC movie/catalog endpoint returned 200 with these credentials."
        movies = []

    zero_performance = (
        analyze_zero_performances(
            prober,
            movies,
            local_booking_ids=local_booking_ids,
            local_booking_keys=local_booking_keys,
            sample_size=args.sample_size,
        )
        if movies
        else {"note": "Catalog inaccessible; zero-performance question not answerable."}
    )

    targets = investigate_targets(
        prober,
        catalog_movies=movies,
        catalog_accessible=bool(selected),
        local_booking_ids=local_booking_ids,
        local_booking_keys=local_booking_keys,
    )

    national_vs_theater = investigate_national_vs_theater(
        prober,
        national_movies=movies,
        theater=theater,
        page_size=min(args.page_size, 50),
    )

    artifact = {
        "schema_version": SCHEMA_VERSION,
        "artifact": "amc_coming_soon_endpoint_investigation",
        "generated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "pacific_today": today.isoformat(),
        "base_url": AMC_BASE_URL,
        "credentials": {
            "presence": presence,
            "auth_mechanism": "X-AMC-Vendor-Key request header",
            "auth_probe": auth,
        },
        "evidence_concept": "amcComingSoonCatalog",
        "catalog": catalog,
        "zero_performance_analysis": zero_performance,
        "target_titles": targets,
        "national_vs_theater_specific": national_vs_theater,
        "theater_booking_context": {
            "evidence_concept": "amcTheaterBooking",
            "input": str(amc_log_path),
            "title_count": len(local_booking_keys),
            "note": "Recorded separately; never treated as catalog evidence.",
        },
        "endpoint_probes": prober.probes,
    }

    output_dir = Path(args.output_dir)
    output_path = output_dir / "amc_coming_soon_endpoint_investigation.json"
    write_sanitized_json(output_path, artifact)
    print(f"  wrote {output_path}")

    print(f"  AMC authenticated: {auth['authenticated']}")
    print(f"  AMC catalog accessible: {catalog['accessible']}")
    # HTTP-level outcomes are findings, not script failures; the workflow gate
    # decides whether the run counts as a real live test.
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
