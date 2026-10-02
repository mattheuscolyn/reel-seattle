"""Extra pre-publication signals for the remaining-week distribution.

Builds on the PR #140 weekly hazard. Production Leaving Soon scoring is not
used and is not changed. A field is modeled only when the historical snapshot
already contained it, or when it is stable film metadata.
"""

from __future__ import annotations

import json
import math
import statistics
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Mapping, Sequence

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, log_loss

from reel_seattle.analysis.leaving_soon_feature_value import load_bundle
from reel_seattle.analysis.leaving_soon_prepublication_survival import (
    _distribution_metrics,
    _feature_names,
    _fit_hazard,
    _fit_multiclass,
    _market_rows,
    _predict_rows,
    _ranking,
    _split,
    _survival_rows,
    _week_screenings,
    build_booking_cycles,
    build_observations,
)
from reel_seattle.analysis.leaving_soon_scheduling_assumptions import (
    Screening,
    programming_week_friday,
    time_block,
)
from reel_seattle.normalize.times import parse_time_to_minutes

SOUTH_ASIAN = frozenset({"hi", "ta", "te", "ml", "kn", "pa", "bn", "mr", "gu"})
RATING_ORDINAL = {"G": 0, "PG": 1, "PG-13": 2, "PG13": 2, "R": 3, "NC-17": 4, "NR": 5}
PROBE_LOGS = ("2026-06-29", "2026-08-01", "2026-09-03", "2026-10-01")
AUDITORIUM_CAPTURE_START = date(2026, 7, 19)

OPENING = (
    "opening_week_screenings",
    "opening_premium_count",
    "opening_prime_count",
    "opening_weekend_screenings",
    "opening_market_theaters",
    "opening_market_screenings",
    "peak_week_screenings",
    "peak_theater_count",
    "current_over_opening",
    "current_over_peak",
    "theaters_over_peak",
)
QUALITY = (
    "friday_saturday_evening_share",
    "matinee_share",
    "late_share",
    "days_with_evening",
    "time_dispersion_hours",
)
MARKET_SHAPE = (
    "median_theater_screenings",
    "screening_concentration",
    "theaters_with_10plus",
    "strong_theater_share",
    "downtown_share",
)
METADATA = (
    "runtime_minutes",
    "days_since_release",
    "rating_ordinal",
    "language_en",
    "language_south_asian",
    "language_ja",
    "language_other",
    "genre_horror",
    "genre_family",
    "genre_documentary",
    "genre_animation",
)
ARCHETYPE = (
    "arch_wide",
    "arch_specialty",
    "arch_south_asian",
    "arch_anime",
    "arch_horror",
    "arch_family",
    "arch_documentary",
    "arch_foreign",
    "arch_faith",
    "arch_concert",
)
COMPETITION = (
    "known_national_openings",
    "advance_screening_count",
    "advance_premium_count",
    "advance_title_count",
)
COMMITMENT_EXTRA = ("mean_adult_price", "distinct_auditoriums", "price_vs_theater_median")
FUTURE_COMMITMENT = ("incumbent_beyond_next_week",)
INTERACTIONS = (
    "screenings_x_week",
    "screenings_x_open_ratio",
    "screenings_x_theaters",
    "prime_x_screenings",
    "retention_x_screenings",
)
FAMILIES = (
    ("opening_footprint", OPENING),
    ("schedule_quality", QUALITY),
    ("market_shape", MARKET_SHAPE),
    ("safe_metadata", METADATA),
    ("archetype", ARCHETYPE),
    ("competition", COMPETITION),
    ("auditorium_price", COMMITMENT_EXTRA),
    ("interactions", INTERACTIONS),
)


def _nan() -> float:
    return float("nan")


def _safe_div(num: float, den: float) -> float:
    if den is None or den == 0 or (isinstance(den, float) and math.isnan(den)):
        return _nan()
    if isinstance(num, float) and math.isnan(num):
        return _nan()
    return float(num) / float(den)


def adult_price(prices: Any) -> float | None:
    if not isinstance(prices, list):
        return None
    for item in prices:
        if isinstance(item, Mapping) and str(item.get("type") or "").upper() == "ADULT":
            try:
                return float(item["price"])
            except (TypeError, ValueError, KeyError):
                return None
    return None


def _parse_log_date(value: str) -> date | None:
    for fmt in ("%m/%d/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    return None


def _iso_date(value: str | None) -> date | None:
    if not value:
        return None
    text = str(value)[:10]
    try:
        return date.fromisoformat(text)
    except ValueError:
        return None


def load_stable_metadata(root: Path) -> dict[str, dict[str, Any]]:
    """AMC catalog genre/rating/runtime/release plus stable TMDB language and genres."""
    products_path = root / "data" / "source_catalog" / "amc_movie_products.json"
    products = json.loads(products_path.read_text(encoding="utf-8"))
    by_film: dict[str, dict[str, Any]] = {}
    for product in products.get("products") or []:
        film_id = str(product.get("source_film_id") or "")
        if not film_id:
            continue
        by_film[film_id] = {
            "runtime_minutes": product.get("runtime_min"),
            "release_date": _iso_date(product.get("release_date_utc")),
            "genre": str(product.get("genre") or "").upper(),
            "rating": str(product.get("mpaa_rating") or "").upper(),
            "distributor_code": str(product.get("distributor_code") or ""),
            "first_seen": _iso_date((product.get("lifecycle") or {}).get("first_seen_at")),
            "language": None,
            "tmdb_genres": [],
        }
    decisions_path = root / "data" / "film_identity" / "tmdb_match_decisions.json"
    tmdb_by_source: dict[str, int] = {}
    if decisions_path.exists():
        payload = json.loads(decisions_path.read_text(encoding="utf-8"))
        for decision in payload.get("decisions") or []:
            if not decision.get("active") or decision.get("decision") != "confirm":
                continue
            source = str((decision.get("source_identity") or {}).get("source_film_id") or "")
            tmdb_id = decision.get("tmdb_id")
            if source and isinstance(tmdb_id, int):
                tmdb_by_source[source] = tmdb_id
    enrichment_path = root / "public" / "data" / "film_enrichment_current.json"
    enrichment: dict[int, Mapping[str, Any]] = {}
    if enrichment_path.exists():
        for film in json.loads(enrichment_path.read_text(encoding="utf-8")).get("films") or []:
            tmdb_id = film.get("tmdb_id")
            if isinstance(tmdb_id, int):
                enrichment[tmdb_id] = film
    matched = 0
    for film_id, tmdb_id in tmdb_by_source.items():
        row = by_film.setdefault(film_id, {"genre": "", "rating": "", "language": None, "tmdb_genres": [], "release_date": None, "runtime_minutes": None, "first_seen": None, "distributor_code": ""})
        film = enrichment.get(tmdb_id)
        if film is None:
            continue
        matched += 1
        row["language"] = film.get("original_language")
        row["tmdb_genres"] = [str(item.get("name") or "") for item in film.get("genres") or [] if isinstance(item, Mapping)]
        if row.get("runtime_minutes") in (None, "") and film.get("runtime_minutes"):
            row["runtime_minutes"] = film.get("runtime_minutes")
        if row.get("release_date") is None:
            row["release_date"] = _iso_date(film.get("release_date"))
    load_stable_metadata.match_count = matched  # type: ignore[attr-defined]
    load_stable_metadata.product_count = len(by_film)  # type: ignore[attr-defined]
    return by_film


def assign_archetype(meta: Mapping[str, Any], *, title: str, segment: str, opening_theaters: float) -> dict[str, float]:
    language = str(meta.get("language") or "")
    genres = {str(meta.get("genre") or "").upper()}
    genres.update(name.upper() for name in meta.get("tmdb_genres") or [])
    blob = f"{title} {segment}".casefold()
    south = language in SOUTH_ASIAN
    anime = language == "ja" and ("ANIMATION" in genres or "ANIME" in genres)
    horror = "HORROR" in genres
    family = "FAMILY" in genres or ("ANIMATION" in genres and language in {"", "en"})
    documentary = "DOCUMENTARY" in genres
    foreign = bool(language) and language not in {"en"} and not south and not anime
    faith = any(token in blob for token in ("faith", "gospel", "jesus"))
    concert = any(token in blob for token in ("concert", "tour", "live in"))
    wide = isinstance(opening_theaters, float) and not math.isnan(opening_theaters) and opening_theaters >= 4
    specialty = segment == "ordinary" and language in {"", "en"} and not horror and not family and isinstance(opening_theaters, float) and not math.isnan(opening_theaters) and opening_theaters <= 2
    return {
        "arch_wide": 1.0 if wide else 0.0,
        "arch_specialty": 1.0 if specialty else 0.0,
        "arch_south_asian": 1.0 if south else 0.0,
        "arch_anime": 1.0 if anime else 0.0,
        "arch_horror": 1.0 if horror else 0.0,
        "arch_family": 1.0 if family else 0.0,
        "arch_documentary": 1.0 if documentary else 0.0,
        "arch_foreign": 1.0 if foreign else 0.0,
        "arch_faith": 1.0 if faith else 0.0,
        "arch_concert": 1.0 if concert else 0.0,
    }


def archetype_label(flags: Mapping[str, Any]) -> str:
    order = (
        ("arch_concert", "concert/event"),
        ("arch_faith", "faith"),
        ("arch_anime", "anime"),
        ("arch_south_asian", "south asian"),
        ("arch_documentary", "documentary"),
        ("arch_horror", "horror"),
        ("arch_family", "family"),
        ("arch_foreign", "foreign-language"),
        ("arch_wide", "wide"),
        ("arch_specialty", "specialty/limited"),
    )
    for key, label in order:
        if flags.get(key):
            return label
    return "unclassified"


def _history_tables(screenings: Sequence[Screening]) -> tuple[dict, dict, dict]:
    by_pair: dict[tuple[str, str], list[Screening]] = defaultdict(list)
    for show in screenings:
        by_pair[(show.film_id, show.theater_id)].append(show)
    theater_weeks: dict[tuple[str, str], dict[date, dict[str, float]]] = {}
    market_weeks: dict[str, dict[date, dict[str, float]]] = defaultdict(lambda: defaultdict(lambda: {"screenings": 0.0, "theaters": set()}))
    first_show: dict[str, date] = {}
    for (film_id, theater_id), shows in by_pair.items():
        weeks: dict[date, dict[str, float]] = defaultdict(lambda: {"screenings": 0.0, "premium": 0.0, "prime": 0.0, "weekend": 0.0})
        for show in shows:
            if show.canceled or show.removed_before_show:
                continue
            week = programming_week_friday(show.show_date)
            bucket = weeks[week]
            bucket["screenings"] += 1
            bucket["premium"] += 1 if show.premium else 0
            bucket["prime"] += 1 if time_block(show.minutes) == "prime" else 0
            bucket["weekend"] += 1 if show.show_date.weekday() in (4, 5, 6) else 0
            market_weeks[film_id][week]["screenings"] += 1
            market_weeks[film_id][week]["theaters"].add(theater_id)
            current = first_show.get(film_id)
            if current is None or show.show_date < current:
                first_show[film_id] = show.show_date
        theater_weeks[(film_id, theater_id)] = weeks
    return theater_weeks, market_weeks, first_show


def _quality(shows: Sequence[Screening]) -> dict[str, float]:
    total = len(shows)
    if not total:
        return {name: _nan() for name in QUALITY}
    evening = sum(1 for show in shows if show.show_date.weekday() in (4, 5) and time_block(show.minutes) == "prime")
    matinee = sum(1 for show in shows if time_block(show.minutes) in {"morning", "afternoon"})
    late = sum(1 for show in shows if time_block(show.minutes) == "late")
    evening_days = {show.show_date for show in shows if time_block(show.minutes) == "prime"}
    minutes = [show.minutes for show in shows if show.minutes is not None]
    dispersion = statistics.pstdev(minutes) / 60 if len(minutes) >= 2 else 0.0
    return {
        "friday_saturday_evening_share": evening / total,
        "matinee_share": matinee / total,
        "late_share": late / total,
        "days_with_evening": float(len(evening_days)),
        "time_dispersion_hours": float(dispersion),
    }


def _load_price_index(root: Path, days: set[date]) -> dict[date, dict[tuple[str, str, date, int], tuple[float | None, str]]]:
    indexes: dict[date, dict[tuple[str, str, date, int], tuple[float | None, str]]] = {}
    for day in sorted(days):
        path = root / "data" / "daily_logs" / f"{day.isoformat()}_amc.json"
        if not path.exists():
            continue
        payload = json.loads(path.read_text(encoding="utf-8"))
        index: dict[tuple[str, str, date, int], tuple[float | None, str]] = {}
        for record in payload.get("records") or []:
            show_day = _parse_log_date(str(record.get("date_raw") or ""))
            minutes = parse_time_to_minutes(record.get("time_raw"))
            if show_day is None or minutes is None:
                continue
            attrs = record.get("attributes") or {}
            key = (
                str(record.get("theater_name_raw") or "").casefold(),
                str(record.get("title_raw") or "").casefold(),
                show_day,
                int(minutes),
            )
            index[key] = (adult_price(attrs.get("ticket_prices")), str(attrs.get("auditorium") or ""))
        indexes[day] = index
    return indexes


def _price_features(shows: Sequence[Screening], theater_name: str, index: Mapping[tuple[str, str, date, int], tuple[float | None, str]]) -> dict[str, float]:
    prices = []
    auditoriums = set()
    for show in shows:
        if show.minutes is None:
            continue
        found = index.get((theater_name.casefold(), show.title.casefold(), show.show_date, int(show.minutes)))
        if found is None:
            continue
        price, auditorium = found
        if price is not None:
            prices.append(price)
        if auditorium:
            auditoriums.add(auditorium)
    return {
        "mean_adult_price": float(statistics.fmean(prices)) if prices else _nan(),
        "distinct_auditoriums": float(len(auditoriums)) if auditoriums else _nan(),
    }


def enrich_observations(rows: list[dict[str, Any]], screenings: Sequence[Screening], metadata: Mapping[str, Mapping[str, Any]], price_indexes: Mapping[date, Mapping], dataset_start: date) -> None:
    theater_weeks, market_weeks, first_show = _history_tables(screenings)
    by_pair: dict[tuple[str, str], list[Screening]] = defaultdict(list)
    by_theater: dict[str, list[Screening]] = defaultdict(list)
    first_played: dict[tuple[str, str], date] = {}
    for show in screenings:
        by_pair[(show.film_id, show.theater_id)].append(show)
        by_theater[show.theater_id].append(show)
        if show.canceled or show.removed_before_show:
            continue
        key = (show.film_id, show.theater_id)
        current = first_played.get(key)
        if current is None or show.show_date < current:
            first_played[key] = show.show_date
    grouped: dict[tuple[str, str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[(row["snapshot_kind"], row["upcoming_friday"], row["film_id"])].append(row)
    for row in rows:
        snapshot = date.fromisoformat(row["observation_date"])
        visible = date.fromisoformat(row["visible_friday"])
        upcoming = date.fromisoformat(row["upcoming_friday"])
        film_id = row["film_id"]
        shows = by_pair.get((film_id, row["theater_id"]), ())
        current = _week_screenings(shows, visible, visible + timedelta(days=6), snapshot)
        row.update(_quality(current))
        weeks = theater_weeks.get((film_id, row["theater_id"]), {})
        past = {week: stats for week, stats in weeks.items() if week < visible}
        opening_week = min(past) if past else visible
        truncated = bool(row.get("left_truncated")) or (first_show.get(film_id) is not None and first_show[film_id] <= dataset_start)
        if truncated:
            opening_screenings = opening_premium = opening_prime = opening_weekend = _nan()
        elif opening_week == visible:
            opening_screenings = float(len(current))
            opening_premium = float(sum(1 for show in current if show.premium))
            opening_prime = float(sum(1 for show in current if time_block(show.minutes) == "prime"))
            opening_weekend = float(sum(1 for show in current if show.show_date.weekday() in (4, 5, 6)))
        else:
            stats = past[opening_week]
            opening_screenings = stats["screenings"]
            opening_premium = stats["premium"]
            opening_prime = stats["prime"]
            opening_weekend = stats["weekend"]
        market = market_weeks.get(film_id, {})
        past_market = {week: stats for week, stats in market.items() if week < visible}
        opening_market_week = min(past_market) if past_market else visible
        if truncated:
            opening_market_theaters = opening_market_screenings = peak_theater_count = _nan()
        else:
            origin = past_market.get(opening_market_week)
            if origin is None:
                peers = grouped[(row["snapshot_kind"], row["upcoming_friday"], film_id)]
                opening_market_theaters = float(len(peers))
                opening_market_screenings = float(sum(int(peer["current_week_screenings"]) for peer in peers))
            else:
                opening_market_theaters = float(len(origin["theaters"]))
                opening_market_screenings = float(origin["screenings"])
            observed_markets = list(past_market.values()) + ([market[visible]] if visible in market else [])
            peak_theater_count = float(max(len(stats["theaters"]) for stats in observed_markets)) if observed_markets else _nan()
        observed_counts = [stats["screenings"] for stats in past.values()] + [float(len(current))]
        peak_week = max(observed_counts) if observed_counts else _nan()
        row.update(
            {
                "opening_week_screenings": opening_screenings,
                "opening_premium_count": opening_premium,
                "opening_prime_count": opening_prime,
                "opening_weekend_screenings": opening_weekend,
                "opening_market_theaters": opening_market_theaters,
                "opening_market_screenings": opening_market_screenings,
                "peak_week_screenings": peak_week,
                "peak_theater_count": peak_theater_count,
                "current_over_opening": _safe_div(float(len(current)), opening_screenings),
                "current_over_peak": _safe_div(float(len(current)), peak_week),
                "theaters_over_peak": _safe_div(float(row.get("market_theater_count") or 0), peak_theater_count),
                "opening_truncated": 1.0 if truncated else 0.0,
            }
        )
        peers = grouped[(row["snapshot_kind"], row["upcoming_friday"], film_id)]
        counts = [int(peer["current_week_screenings"]) for peer in peers]
        total = sum(counts) or 0
        strong = sum(count for count in counts if count >= 10)
        downtown = sum(int(peer["current_week_screenings"]) for peer in peers if "pacific place" in str(peer["theater_name"]).casefold())
        row.update(
            {
                "median_theater_screenings": float(np.median(counts)) if counts else _nan(),
                "screening_concentration": (max(counts) / total) if total else _nan(),
                "theaters_with_10plus": float(sum(1 for count in counts if count >= 10)),
                "strong_theater_share": (strong / total) if total else _nan(),
                "downtown_share": (downtown / total) if total else 0.0,
            }
        )
        meta = metadata.get(film_id, {})
        release = meta.get("release_date")
        runtime = meta.get("runtime_minutes")
        language = str(meta.get("language") or "")
        genres = " ".join([str(meta.get("genre") or "")] + list(meta.get("tmdb_genres") or [])).upper()
        row.update(
            {
                "runtime_minutes": float(runtime) if isinstance(runtime, (int, float)) else _nan(),
                "days_since_release": float((snapshot - release).days) if isinstance(release, date) and release <= snapshot else _nan(),
                "rating_ordinal": float(RATING_ORDINAL[str(meta.get("rating") or "")]) if str(meta.get("rating") or "") in RATING_ORDINAL else _nan(),
                "language_en": 1.0 if language == "en" else 0.0,
                "language_south_asian": 1.0 if language in SOUTH_ASIAN else 0.0,
                "language_ja": 1.0 if language == "ja" else 0.0,
                "language_other": 1.0 if language and language not in {"en", "ja"} and language not in SOUTH_ASIAN else 0.0,
                "genre_horror": 1.0 if "HORROR" in genres else 0.0,
                "genre_family": 1.0 if "FAMILY" in genres else 0.0,
                "genre_documentary": 1.0 if "DOCUMENTARY" in genres else 0.0,
                "genre_animation": 1.0 if "ANIMATION" in genres else 0.0,
            }
        )
        flags = assign_archetype(meta, title=row["title"], segment=row["segment"], opening_theaters=opening_market_theaters if not isinstance(opening_market_theaters, float) or not math.isnan(opening_market_theaters) else _nan())
        row.update(flags)
        row["archetype"] = archetype_label(flags)
        advance_titles = set()
        advance_screenings = advance_premium = 0
        for show in by_theater.get(row["theater_id"], ()):
            if show.canceled or show.show_date < upcoming or show.first_snapshot > snapshot:
                continue
            if show.removed_before_show and show.removed_at is not None and show.removed_at <= snapshot:
                continue
            played_on = first_played.get((show.film_id, row["theater_id"]))
            if played_on is not None and played_on < snapshot:
                continue
            advance_titles.add(show.film_id)
            advance_screenings += 1
            advance_premium += 1 if show.premium else 0
        known_openings = 0
        for candidate, info in metadata.items():
            release_day = info.get("release_date")
            seen = info.get("first_seen")
            if not isinstance(release_day, date) or not isinstance(seen, date):
                continue
            if seen <= snapshot and upcoming <= release_day <= upcoming + timedelta(days=6):
                known_openings += 1
        beyond = sum(1 for show in shows if show.show_date >= upcoming + timedelta(days=7) and show.first_snapshot <= snapshot and not show.canceled)
        row.update(
            {
                "known_national_openings": float(known_openings),
                "advance_screening_count": float(advance_screenings),
                "advance_premium_count": float(advance_premium),
                "advance_title_count": float(len(advance_titles)),
                "incumbent_beyond_next_week": float(beyond),
            }
        )
        price_index = price_indexes.get(snapshot, {})
        prices = _price_features(current, row["theater_name"], price_index)
        row.update(prices)
    theater_prices: dict[tuple[str, str], list[float]] = defaultdict(list)
    for row in rows:
        price = row.get("mean_adult_price")
        if isinstance(price, float) and not math.isnan(price):
            theater_prices[(row["theater_id"], row["observation_date"])].append(price)
    for row in rows:
        peers = theater_prices.get((row["theater_id"], row["observation_date"]), [])
        median = float(np.median(peers)) if peers else _nan()
        row["price_vs_theater_median"] = _safe_div(row.get("mean_adult_price", _nan()), median)
        current = float(row["current_week_screenings"])
        row["screenings_x_week"] = current * float(row["theatrical_week_number"])
        row["screenings_x_open_ratio"] = current * row["current_over_opening"] if not math.isnan(row["current_over_opening"]) else _nan()
        row["screenings_x_theaters"] = current * float(row["market_theater_count"])
        row["prime_x_screenings"] = current * float(row.get("prime_share") or 0)
        row["retention_x_screenings"] = current * row["current_over_peak"] if not math.isnan(row["current_over_peak"]) else _nan()


def _score(train: Sequence[Mapping[str, Any]], holdout: Sequence[Mapping[str, Any]], names: Sequence[str]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    model = _fit_hazard(train, names)
    scored = [dict(row) for row in holdout]
    _predict_rows(model, scored)
    metrics = _distribution_metrics(scored)
    metrics["ranking_pairwise"] = _ranking(scored).get("pairwise_accuracy")
    metrics["ranking_n"] = _ranking(scored).get("pairwise_n")
    return metrics, scored


def _fit_two_stage(train: Sequence[Mapping[str, Any]], names: Sequence[str]):
    final_rows = []
    final_y = []
    later_rows = []
    later_y = []
    for row in train:
        if row["censored"]:
            if int(row["known_weeks"]) >= 1:
                final_rows.append(row)
                final_y.append(0)
            continue
        final_rows.append(row)
        final_y.append(1 if int(row["bucket"]) == 0 else 0)
        if int(row["bucket"]) >= 1:
            later_rows.append(row)
            later_y.append(int(row["bucket"]) - 1)
    if len(set(final_y)) < 2 or len(set(later_y)) < 2:
        return None
    from sklearn.impute import SimpleImputer
    from sklearn.preprocessing import StandardScaler

    def fit(rows, target):
        matrix = np.array([[row.get(name, np.nan) for name in names] for row in rows], dtype=float)
        imputer = SimpleImputer(strategy="median")
        scaler = StandardScaler()
        model = LogisticRegression(C=1.0, max_iter=500)
        model.fit(scaler.fit_transform(imputer.fit_transform(matrix)), target)
        return {"imputer": imputer, "scaler": scaler, "model": model}

    return {"final": fit(final_rows, final_y), "later": fit(later_rows, later_y), "names": list(names)}


def _apply_two_stage(model, rows: Sequence[dict[str, Any]]) -> None:
    if model is None:
        return
    matrix = np.array([[row.get(name, np.nan) for name in model["names"]] for row in rows], dtype=float)

    def probs(part, matrix_in):
        filled = part["scaler"].transform(part["imputer"].transform(matrix_in))
        return part["model"].predict_proba(filled), list(part["model"].classes_)

    final_probs, final_classes = probs(model["final"], matrix)
    later_probs, later_classes = probs(model["later"], matrix)
    final_index = final_classes.index(1) if 1 in final_classes else 0
    for row, final, later in zip(rows, final_probs, later_probs):
        p0 = float(final[final_index])
        conditional = [0.0, 0.0, 0.0]
        for klass, prob in zip(later_classes, later):
            conditional[int(klass)] = float(prob)
        total = sum(conditional) or 1.0
        conditional = [value / total for value in conditional]
        survive = 1.0 - p0
        row["p0"] = p0
        row["p1"] = survive * conditional[0]
        row["p2"] = survive * conditional[1]
        row["p3"] = survive * conditional[2]
        row["expected_weeks"] = row["p1"] + 2 * row["p2"] + 3 * row["p3"]


def _bootstrap(baseline: Sequence[Mapping[str, Any]], challenger: Sequence[Mapping[str, Any]], draws: int = 400) -> dict[str, Any]:
    keyed = {(row["film_id"], row["theater_id"], row["observation_date"]): row for row in challenger}
    paired = []
    for row in baseline:
        other = keyed.get((row["film_id"], row["theater_id"], row["observation_date"]))
        if other is None or row.get("censored") or other.get("censored"):
            continue
        if row.get("p0") != row.get("p0") or other.get("p0") != other.get("p0"):
            continue
        paired.append((row, other))
    if len(paired) < 30:
        return {"n": len(paired)}
    rng = np.random.default_rng(140)
    deltas = {"log_loss": [], "pr_auc_exactly_1": [], "pr_auc_exactly_2": [], "pr_auc_final_week": []}

    def pack(rows):
        y = np.array([int(row["bucket"]) for row in rows])
        proba = np.clip(np.array([[row["p0"], row["p1"], row["p2"], row["p3"]] for row in rows], dtype=float), 1e-6, 1)
        proba = proba / proba.sum(axis=1, keepdims=True)
        return y, proba

    def one(y, proba, key):
        if key == "log_loss":
            return float(log_loss(y, proba, labels=[0, 1, 2, 3]))
        label = {"pr_auc_final_week": y == 0, "pr_auc_exactly_1": y == 1, "pr_auc_exactly_2": y == 2}[key]
        score = {"pr_auc_final_week": proba[:, 0], "pr_auc_exactly_1": proba[:, 1], "pr_auc_exactly_2": proba[:, 2]}[key]
        if len(set(label.tolist())) < 2:
            return None
        return float(average_precision_score(label, score))

    n = len(paired)
    for _ in range(draws):
        pick = rng.integers(0, n, n)
        base_rows = [paired[index][0] for index in pick]
        new_rows = [paired[index][1] for index in pick]
        y0, p0 = pack(base_rows)
        y1, p1 = pack(new_rows)
        for key in deltas:
            left = one(y0, p0, key)
            right = one(y1, p1, key)
            if left is None or right is None:
                continue
            deltas[key].append(right - left)
    summary = {"n": n, "draws": draws}
    for key, values in deltas.items():
        if not values:
            summary[key] = None
            continue
        array = np.array(values)
        summary[key] = {
            "mean_delta": float(array.mean()),
            "low": float(np.percentile(array, 2.5)),
            "high": float(np.percentile(array, 97.5)),
        }
    return summary


def _middle_mask(row: Mapping[str, Any]) -> bool:
    p0 = row.get("base_p0")
    expected = row.get("base_expected")
    if not isinstance(p0, float) or math.isnan(p0):
        return False
    uncertain = 0.20 <= p0 <= 0.80
    mid_expected = isinstance(expected, float) and 0.5 <= expected <= 2.5
    actual_middle = (not row.get("censored")) and row.get("bucket") in (1, 2)
    confident_miss = (not row.get("censored")) and max(row.get("base_p0", 0), row.get("base_p1", 0), row.get("base_p2", 0), row.get("base_p3", 0)) >= 0.60 and int(np.argmax([row["base_p0"], row["base_p1"], row["base_p2"], row["base_p3"]])) != int(row["bucket"])
    return uncertain or mid_expected or actual_middle or confident_miss


def _error_bucket(row: Mapping[str, Any]) -> str | None:
    if row.get("censored"):
        return None
    probs = [row["base_p0"], row["base_p1"], row["base_p2"], row["base_p3"]]
    predicted = int(np.argmax(probs))
    actual = int(row["bucket"])
    if predicted == 0 and actual == 1:
        return "called final, played one more week"
    if predicted == 0 and actual >= 2:
        return "called final, played two or more"
    if predicted == 3 and actual == 1:
        return "called a long run, stopped after one more week"
    if predicted == 1 and actual >= 3:
        return "called one more week, ran much longer"
    return None


def probe_amc_fields(root: Path) -> list[dict[str, Any]]:
    rows = []
    for day in PROBE_LOGS:
        path = root / "data" / "daily_logs" / f"{day}_amc.json"
        if not path.exists():
            continue
        payload = json.loads(path.read_text(encoding="utf-8"))
        records = payload.get("records") or []
        almost = sum(1 for record in records if record.get("almost_sold_out") is True)
        attrs = records[0].get("attributes") or {} if records else {}
        sold = sum(1 for record in records if (record.get("attributes") or {}).get("is_sold_out") is True)
        attendance = sum(1 for record in records if (record.get("attributes") or {}).get("maximum_intended_attendance") not in (None, ""))
        rows.append(
            {
                "snapshot": day,
                "showtimes": len(records),
                "almost_sold_out_true": almost,
                "is_sold_out_true": sold,
                "maximum_intended_attendance_filled": attendance,
                "auditorium_captured": "auditorium" in attrs,
                "ticket_prices_captured": "ticket_prices" in attrs,
                "genre_on_showtime": "genre" in attrs,
                "languages_nonempty": sum(1 for record in records if (record.get("attributes") or {}).get("languages")),
            }
        )
    return rows


def amc_inventory(probe: Sequence[Mapping[str, Any]]) -> list[dict[str, str]]:
    captured_later = "yes from 2026-07-19" if any(row["auditorium_captured"] for row in probe) else "no"
    return [
        {"field": "runTime", "source": "showtimes + movies catalog", "example": "103", "persisted": "yes", "historical": "yes", "stability": "stable", "relevance": "runtime of the booking", "leakage": "low", "modeled": "yes"},
        {"field": "genre", "source": "movies catalog; showtimes attributes after early July", "example": "HORROR", "persisted": "catalog yes, early showtimes no", "historical": "catalog current refresh of a stable field", "stability": "stable", "relevance": "release pattern", "leakage": "low if the genre does not get rewritten", "modeled": "yes"},
        {"field": "mpaaRating", "source": "movies catalog", "example": "PG-13", "persisted": "yes", "historical": "catalog refresh", "stability": "stable", "relevance": "audience", "leakage": "low", "modeled": "yes"},
        {"field": "releaseDateUtc", "source": "movies catalog", "example": "2026-08-28", "persisted": "yes", "historical": "catalog refresh", "stability": "stable for this booking", "relevance": "days since opening", "leakage": "low", "modeled": "yes"},
        {"field": "distributorCode", "source": "movies catalog", "example": "FFF", "persisted": "yes", "historical": "catalog refresh", "stability": "usually stable", "relevance": "studio", "leakage": "low", "modeled": "no, high cardinality"},
        {"field": "premiumFormat", "source": "showtimes format_raw", "example": "IMAX at AMC", "persisted": "yes", "historical": "yes", "stability": "time-varying", "relevance": "premium commitment", "leakage": "none at the snapshot", "modeled": "already in PR #140"},
        {"field": "isAlmostSoldOut", "source": "showtimes", "example": "false", "persisted": "yes", "historical": "yes", "stability": "time-varying", "relevance": "demand", "leakage": "none", "modeled": "no, true on well under 2% of showtimes"},
        {"field": "isSoldOut", "source": "showtimes attributes", "example": "false", "persisted": "yes after capture expansion", "historical": captured_later, "stability": "time-varying", "relevance": "demand", "leakage": "none", "modeled": "no, a handful of true values per day"},
        {"field": "auditorium", "source": "showtimes attributes", "example": "7", "persisted": "daily logs only", "historical": captured_later, "stability": "time-varying", "relevance": "screen identity, not size", "leakage": "none", "modeled": "distinct count only, from 2026-07-19"},
        {"field": "layoutId", "source": "showtimes attributes", "example": "111", "persisted": "daily logs only", "historical": captured_later, "stability": "time-varying", "relevance": "seat map id, no geometry stored", "leakage": "none", "modeled": "no"},
        {"field": "maximumIntendedAttendance", "source": "showtimes attributes", "example": "null", "persisted": "key only", "historical": "always empty in probed logs", "stability": "unknown", "relevance": "auditorium capacity", "leakage": "n/a", "modeled": "no"},
        {"field": "ticketPrices", "source": "showtimes attributes", "example": "ADULT 20.04", "persisted": "daily logs only", "historical": captured_later, "stability": "time-varying", "relevance": "slot quality proxy", "leakage": "none", "modeled": "mean adult price from 2026-07-19"},
        {"field": "languages", "source": "showtimes attributes", "example": "empty object", "persisted": "key only", "historical": "present and empty", "stability": "unknown", "relevance": "spoken language", "leakage": "n/a", "modeled": "no; language comes from TMDB"},
        {"field": "attribute_codes", "source": "movies catalog", "example": "IMAX, DOLBY", "persisted": "yes", "historical": "current union of formats", "stability": "time-varying", "relevance": "premium capability", "leakage": "high if used on earlier weeks", "modeled": "no"},
        {"field": "seat map / seats remaining", "source": "not in showtimes payload", "example": "", "persisted": "no", "historical": "no", "stability": "time-varying", "relevance": "demand versus a thin schedule", "leakage": "would be severe if scraped today onto old weeks", "modeled": "no"},
    ]


def tmdb_inventory() -> list[dict[str, str]]:
    return [
        {"field": "original_language", "class": "safe", "reason": "Stable. Stored on matched films in film_enrichment_current.json."},
        {"field": "genres", "class": "safe", "reason": "Stable list. Stored on matched films."},
        {"field": "runtime", "class": "safe", "reason": "Stable. AMC runtime is preferred; TMDB fills gaps."},
        {"field": "release_date", "class": "safe", "reason": "Stable. Used only when the date is on or before the snapshot."},
        {"field": "us_certification", "class": "safe", "reason": "Stored, but AMC MPAA rating is the field actually modeled."},
        {"field": "original_title vs display_title", "class": "safe", "reason": "Stable identity. Not separately modeled."},
        {"field": "belongs_to_collection", "class": "uncertain", "reason": "Stable enough to reconstruct, but this repo does not store it. Not fetched live for this audit."},
        {"field": "production_companies", "class": "uncertain", "reason": "Usually stable, not stored. AMC distributor code is the stored studio-like field and was left out for cardinality."},
        {"field": "popularity", "class": "unsafe", "reason": "Changes daily. A current value cannot score a past week."},
        {"field": "vote_count", "class": "unsafe", "reason": "Grows after release. Needs a historical snapshot."},
        {"field": "vote_average", "class": "unsafe", "reason": "Moves as votes arrive."},
        {"field": "revenue", "class": "unsafe", "reason": "Updated after the theatrical run. Hindsight."},
        {"field": "budget", "class": "unsafe", "reason": "Often filled in or revised after release."},
        {"field": "person popularity", "class": "unsafe", "reason": "Current person popularity is not the value at prediction time."},
    ]


def run_feature_expansion(root: Path) -> dict[str, Any]:
    bundle = load_bundle(root)
    metadata = load_stable_metadata(root)
    cycles = build_booking_cycles(bundle.screenings, bundle.snapshot_dates, bundle.theater_names, bundle.as_of)
    primary = build_observations(bundle, cycles, kind="before_80")
    days = {date.fromisoformat(row["observation_date"]) for row in primary}
    price_indexes = _load_price_index(root, days)
    enrich_observations(primary, bundle.screenings, metadata, price_indexes, bundle.dataset_start)
    parts = _split(primary)
    base_names = _feature_names(True)
    baseline, base_scored = _score(parts["train"], parts["holdout"], base_names)
    for row in base_scored:
        row["base_p0"], row["base_p1"], row["base_p2"], row["base_p3"] = row["p0"], row["p1"], row["p2"], row["p3"]
        row["base_expected"] = row["expected_weeks"]
    base_by_key = {(row["film_id"], row["theater_id"], row["observation_date"]): row for row in base_scored}
    results = [{"model": "pr140_baseline", "mode": "baseline", "features": len(base_names), **{key: baseline.get(key) for key in ("n", "log_loss", "brier", "pr_auc_final_week", "pr_auc_exactly_1", "pr_auc_exactly_2", "pr_auc_3_plus", "pr_auc_gone_within_2_weeks", "median_abs_error_capped", "accuracy", "ranking_pairwise")}}]
    cumulative = list(base_names)
    best_name = "pr140_baseline"
    best_loss = baseline.get("log_loss") or 99
    best_scored = base_scored
    for label, names in FAMILIES:
        cumulative = [*cumulative, *names]
        metrics, scored = _score(parts["train"], parts["holdout"], cumulative)
        results.append({"model": label, "mode": "cumulative", "features": len(cumulative), **{key: metrics.get(key) for key in ("n", "log_loss", "brier", "pr_auc_final_week", "pr_auc_exactly_1", "pr_auc_exactly_2", "pr_auc_3_plus", "pr_auc_gone_within_2_weeks", "median_abs_error_capped", "accuracy", "ranking_pairwise")}})
        if metrics.get("log_loss") is not None and metrics["log_loss"] < best_loss and (metrics.get("pr_auc_final_week") or 0) >= (baseline.get("pr_auc_final_week") or 0) - 0.02:
            best_loss = metrics["log_loss"]
            best_name = label
            best_scored = scored
        alone, _alone_rows = _score(parts["train"], parts["holdout"], [*base_names, *names])
        results.append({"model": label, "mode": "added_alone", "features": len(base_names) + len(names), **{key: alone.get(key) for key in ("n", "log_loss", "brier", "pr_auc_final_week", "pr_auc_exactly_1", "pr_auc_exactly_2", "pr_auc_3_plus", "pr_auc_gone_within_2_weeks", "median_abs_error_capped", "accuracy", "ranking_pairwise")}})
    with_future, future_scored = _score(parts["train"], parts["holdout"], [*cumulative, *FUTURE_COMMITMENT])
    results.append({"model": "known_future_commitment", "mode": "added_alone_to_full", "features": len(cumulative) + 1, **{key: with_future.get(key) for key in ("n", "log_loss", "brier", "pr_auc_final_week", "pr_auc_exactly_1", "pr_auc_exactly_2", "pr_auc_3_plus", "median_abs_error_capped", "accuracy", "ranking_pairwise")}})
    two_stage = _fit_two_stage(parts["train"], cumulative)
    two_rows = [dict(row) for row in parts["holdout"]]
    _apply_two_stage(two_stage, two_rows)
    two_metrics = _distribution_metrics(two_rows)
    two_metrics["ranking_pairwise"] = _ranking(two_rows).get("pairwise_accuracy")
    multi = _fit_multiclass(parts["train"], cumulative)
    from reel_seattle.analysis.leaving_soon_prepublication_survival import _apply_multiclass

    multi_rows = [dict(row) for row in parts["holdout"]]
    _apply_multiclass(multi, multi_rows)
    multi_metrics = _distribution_metrics(multi_rows)
    opening_train = [row for row in parts["train"] if row.get("in_first_week")]
    opening_holdout = [row for row in parts["holdout"] if row.get("in_first_week")]
    opening_general, _ = _score(parts["train"], opening_holdout, base_names)
    opening_special, _ = _score(opening_train, opening_holdout, [*base_names, *OPENING, *QUALITY, *ARCHETYPE]) if len(opening_train) >= 80 else ({"n": len(opening_holdout), "log_loss": None}, [])
    market = _market_rows(primary)
    market_parts = _split(market)
    market_base, _ = _score(market_parts["train"], market_parts["holdout"], base_names)
    market_new, _ = _score(market_parts["train"], market_parts["holdout"], [*base_names, *METADATA, *ARCHETYPE, *MARKET_SHAPE, *OPENING])
    for row in best_scored:
        base = base_by_key.get((row["film_id"], row["theater_id"], row["observation_date"]))
        if base:
            row["base_p0"], row["base_p1"], row["base_p2"], row["base_p3"] = base["base_p0"], base["base_p1"], base["base_p2"], base["base_p3"]
            row["base_expected"] = base["base_expected"]
    middle = [row for row in best_scored if _middle_mask(row)]
    errors = []
    for row in base_scored:
        kind = _error_bucket(row)
        if kind:
            errors.append({**row, "error_archetype": kind})
    errors.sort(key=lambda item: max(item["base_p0"], item["base_p1"], item["base_p2"], item["base_p3"]), reverse=True)
    probe = probe_amc_fields(root)
    priced = [row for row in primary if isinstance(row.get("mean_adult_price"), float) and not math.isnan(row["mean_adult_price"])]
    language_known = [row for row in primary if row.get("language_en") or row.get("language_south_asian") or row.get("language_ja") or row.get("language_other")]
    best_metrics = _distribution_metrics(best_scored)
    best_metrics["ranking_pairwise"] = _ranking(best_scored).get("pairwise_accuracy")
    return {
        "as_of": bundle.as_of.isoformat(),
        "train_end": "2026-08-16",
        "validation_end": "2026-09-06",
        "baseline": baseline,
        "best_model": best_name,
        "best_metrics": best_metrics,
        "results": results,
        "two_stage": two_metrics,
        "multiclass_expanded": {key: multi_metrics.get(key) for key in ("n", "log_loss", "brier", "pr_auc_final_week", "pr_auc_exactly_1", "pr_auc_exactly_2", "pr_auc_3_plus", "median_abs_error_capped")},
        "future_commitment": with_future,
        "future_scored_note": len(future_scored),
        "bootstrap_best_minus_baseline": _bootstrap(base_scored, best_scored),
        "opening_week": {"general": opening_general, "separate": opening_special, "holdout_n": len(opening_holdout)},
        "market_baseline": market_base,
        "market_expanded": market_new,
        "survival": {
            "opening": _survival_rows(primary, lambda row: "truncated" if row.get("opening_truncated") else ("1-8" if row.get("opening_week_screenings", 99) <= 8 else "9-20" if row["opening_week_screenings"] <= 20 else "21+"), "opening"),
            "retention": _survival_rows(primary, lambda row: "unknown" if not isinstance(row.get("current_over_peak"), float) or math.isnan(row["current_over_peak"]) else ("under 40% of peak" if row["current_over_peak"] < 0.4 else "40-70% of peak" if row["current_over_peak"] < 0.7 else "70-90% of peak" if row["current_over_peak"] < 0.9 else "at least 90% of peak"), "retention"),
            "prime": _survival_rows(primary, lambda row: "prime under 20%" if row.get("prime_share", 0) < 0.2 else "prime 20-50%" if row["prime_share"] < 0.5 else "prime at least 50%", "prime"),
            "friday_evening": _survival_rows(primary, lambda row: "no friday/saturday evening" if row.get("friday_saturday_evening_share", 0) <= 0 else "some friday/saturday evening", "friday_evening"),
            "shape": _survival_rows(primary, lambda row: "one strong theater" if row.get("theaters_with_10plus", 0) <= 1 and row.get("market_theater_count", 0) >= 3 else "two or more strong theaters" if row.get("theaters_with_10plus", 0) >= 2 else "no theater at 10+", "shape"),
            "archetype": _survival_rows(primary, lambda row: row.get("archetype") or "unclassified", "archetype"),
        },
        "coverage": {
            "rows": len(primary),
            "priced_rows": len(priced),
            "language_known_rows": len(language_known),
            "tmdb_matches": getattr(load_stable_metadata, "match_count", None),
            "catalog_films": getattr(load_stable_metadata, "product_count", None),
        },
        "middle": middle,
        "middle_n": len(middle),
        "errors": errors[:40],
        "error_counts": {name: sum(1 for row in base_scored if _error_bucket(row) == name) for name in ("called final, played one more week", "called final, played two or more", "called a long run, stopped after one more week", "called one more week, ran much longer")},
        "probe": probe,
        "amc_inventory": amc_inventory(probe),
        "tmdb_inventory": tmdb_inventory(),
        "baseline_scored": base_scored,
        "best_scored": best_scored,
    }
