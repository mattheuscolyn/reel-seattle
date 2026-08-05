"""T-FILMID-02 public nullable film_id emission tests."""

from __future__ import annotations

import json
from datetime import date, datetime
from zoneinfo import ZoneInfo

import pytest

from reel_seattle.emit.current import build_showtimes_current, write_showtimes_current
from reel_seattle.film_identity.public_emit import (
    attach_public_film_ids,
    build_confirmed_tmdb_index,
    resolve_public_film_id,
)
from reel_seattle.normalize import format_date_csv
from reel_seattle.validate import SchemaValidationError, validate_showtimes_current

PACIFIC = ZoneInfo("America/Los_Angeles")
REFERENCE = date(2026, 6, 26)


def _catalog_film(
    *,
    film_id: str,
    status: str,
    source: str,
    source_film_id: str,
    showtime_film_key: str,
    identity_type: str = "tmdb",
) -> dict:
    tmdb_id = int(film_id.split(":", 1)[1]) if film_id.startswith("tmdb:") else None
    return {
        "film_id": film_id,
        "identity_type": identity_type,
        "tmdb_id": tmdb_id,
        "match_status": status,
        "match_method": "manual" if "manual" in status else "automatic",
        "match_confidence": 1.0,
        "source_identities": [
            {
                "source": source,
                "source_film_id": source_film_id,
                "showtime_film_key": showtime_film_key,
                "source_title": showtime_film_key,
            }
        ],
    }


def _history_row(
    show_date: date,
    *,
    film: str = "Sinners",
    theater: str = "AMC Pacific Place 11",
    source: str = "amc",
    source_film_id: str = "",
) -> dict[str, str]:
    return {
        "Date": format_date_csv(show_date),
        "Time": "7:30PM",
        "Theater": theater,
        "Film": film,
        "Runtime": "120",
        "isAlmostSoldOut": "None",
        "posterDynamic": "https://example.com/p.jpg",
        "isCanceled": "false",
        "premiumFormat": "",
        "hasTrailers": "",
        "maximumIntendedAttendance": "",
        "first_seen_date": "2026-06-20",
        "last_updated": "2026-06-26",
        "source": source,
        "source_film_id": source_film_id,
    }


def test_index_only_confirmed_tmdb():
    catalog = {
        "films": [
            _catalog_film(
                film_id="tmdb:10",
                status="confirmed_manual",
                source="amc",
                source_film_id="111",
                showtime_film_key="a",
            ),
            _catalog_film(
                film_id="tmdb:20",
                status="confirmed_automatic",
                source="siff",
                source_film_id="222",
                showtime_film_key="b",
            ),
            _catalog_film(
                film_id="source:amc:333",
                status="unmatched",
                source="amc",
                source_film_id="333",
                showtime_film_key="c",
                identity_type="source",
            ),
            _catalog_film(
                film_id="tmdb:40",
                status="rejected",
                source="amc",
                source_film_id="444",
                showtime_film_key="d",
            ),
        ]
    }
    index, _warnings = build_confirmed_tmdb_index(catalog)
    assert index == {"amc|id|111": "tmdb:10", "siff|id|222": "tmdb:20"}


def test_resolve_collision_returns_null():
    index = {"amc|id|1": "tmdb:10", "siff|id|2": "tmdb:20"}
    film_id, warnings = resolve_public_film_id(
        [
            {"source": "amc", "source_film_id": "1", "showtime_film_key": "x"},
            {"source": "siff", "source_film_id": "2", "showtime_film_key": "x"},
        ],
        index,
    )
    assert film_id is None
    assert any("collision" in w for w in warnings)


def test_resolve_multi_source_same_canonical():
    index = {"amc|id|1": "tmdb:10", "siff|id|2": "tmdb:10"}
    film_id, warnings = resolve_public_film_id(
        [
            {"source": "amc", "source_film_id": "1", "showtime_film_key": "x"},
            {"source": "siff", "source_film_id": "2", "showtime_film_key": "x"},
        ],
        index,
    )
    assert film_id == "tmdb:10"
    assert warnings == []


def test_unmatched_and_title_alone_do_not_map():
    index = {"amc|id|1": "tmdb:10"}
    film_id, _ = resolve_public_film_id(
        [{"source": "amc", "source_film_id": "999", "showtime_film_key": "sinners"}],
        index,
    )
    assert film_id is None
    film_id2, _ = resolve_public_film_id(
        [{"source": None, "source_film_id": None, "showtime_film_key": "sinners"}],
        index,
    )
    assert film_id2 is None


def test_attach_emits_null_for_program_fallback():
    films = [{"showtime_film_key": "met-opera", "title": "Met", "source_film_id": "83829"}]
    showtimes = [
        {
            "showtime_film_key": "met-opera",
            "source": "amc",
            "source_film_id": "83829",
        }
    ]
    catalog = {
        "films": [
            _catalog_film(
                film_id="source:amc:83829",
                status="unmatched",
                source="amc",
                source_film_id="83829",
                showtime_film_key="met-opera",
                identity_type="source",
            )
        ]
    }
    report = attach_public_film_ids(films, showtimes, catalog=catalog)
    assert films[0]["film_id"] is None
    assert report["null_film_id"] == 1
    assert report["source_fallback_emitted"] == 0


def test_build_showtimes_current_includes_nullable_film_id(theaters_registry, monkeypatch):
    catalog = {
        "films": [
            _catalog_film(
                film_id="tmdb:15080",
                status="confirmed_manual",
                source="amc",
                source_film_id="83588",
                showtime_film_key="only-yesterday",
            )
        ]
    }
    monkeypatch.setattr(
        "reel_seattle.film_identity.public_emit.load_identity_catalog",
        lambda path=None: catalog,
    )
    rows = [
        _history_row(REFERENCE, film="Only Yesterday", source_film_id="83588"),
        _history_row(REFERENCE, film="Mystery Program", source_film_id="99999"),
    ]
    artifact = build_showtimes_current(
        rows,
        registry=theaters_registry,
        reference_date=REFERENCE,
        generated_at=datetime(2026, 6, 26, tzinfo=PACIFIC),
    )
    by_key = {f["showtime_film_key"]: f["film_id"] for f in artifact["films"]}
    assert by_key.get("only-yesterday") == "tmdb:15080"
    assert by_key.get("mystery-program") is None
    for film in artifact["films"]:
        assert "showtime_film_key" in film
        assert "source_film_id" in film
        assert "film_id" in film
    for showtime in artifact["showtimes"]:
        assert "showtime_film_key" in showtime
        assert "film_id" not in showtime
    validate_showtimes_current(artifact)


def test_schema_rejects_raw_tmdb_integer(theaters_registry):
    rows = [_history_row(REFERENCE)]
    artifact = build_showtimes_current(
        rows,
        registry=theaters_registry,
        reference_date=REFERENCE,
        generated_at=datetime(2026, 6, 26, tzinfo=PACIFIC),
    )
    artifact["films"][0]["film_id"] = "15080"
    with pytest.raises(SchemaValidationError):
        validate_showtimes_current(artifact)


def test_schema_accepts_null_film_id(theaters_registry):
    rows = [_history_row(REFERENCE)]
    artifact = build_showtimes_current(
        rows,
        registry=theaters_registry,
        reference_date=REFERENCE,
        generated_at=datetime(2026, 6, 26, tzinfo=PACIFIC),
    )
    for film in artifact["films"]:
        film["film_id"] = None
    validate_showtimes_current(artifact)


def test_write_showtimes_current_persists_report(theaters_registry, tmp_path, monkeypatch):
    output = tmp_path / "showtimes_current.json"
    report_path = tmp_path / "emit_report.json"
    written: list[dict] = []

    def _write(report, *, path=None):
        written.append(dict(report))
        target = path or report_path
        target.write_text(json.dumps(report), encoding="utf-8")
        return target

    monkeypatch.setattr(
        "reel_seattle.emit.current.write_identity_emit_report",
        _write,
    )
    monkeypatch.setattr(
        "reel_seattle.film_identity.public_emit.load_identity_catalog",
        lambda path=None: {"films": []},
    )

    registry_path = tmp_path / "theaters.json"
    registry_path.write_text(json.dumps(theaters_registry), encoding="utf-8")

    rows = [_history_row(REFERENCE, source_film_id="no-match")]
    artifact = write_showtimes_current(
        rows,
        output_path=output,
        registry_path=registry_path,
        reference_date=REFERENCE,
    )
    assert output.is_file()
    assert all("film_id" in film for film in artifact["films"])
    assert written
    assert written[0]["total_public_films"] == artifact["stats"]["film_count"]


def test_attach_regression_gate_fails_when_zero_public_ids():
    from reel_seattle.film_identity.public_emit import (
        assert_public_film_id_attach_not_regressed,
    )

    catalog = {
        "films": [
            _catalog_film(
                film_id="tmdb:15080",
                status="confirmed_manual",
                source="amc",
                source_film_id="83588",
                showtime_film_key="only-yesterday",
            )
        ]
    }
    showtimes_doc = {
        "films": [
            {
                "showtime_film_key": "only-yesterday",
                "source_film_id": "83588",
                "film_id": None,
                "title": "Only Yesterday",
            }
        ],
        "showtimes": [
            {
                "showtime_film_key": "only-yesterday",
                "source": "amc",
                "source_film_id": "83588",
            }
        ],
    }
    with pytest.raises(ValueError, match="public film_id attach regression"):
        assert_public_film_id_attach_not_regressed(
            showtimes_doc=showtimes_doc,
            catalog=catalog,
        )


def test_attach_regression_gate_allows_partial_coverage():
    from reel_seattle.film_identity.public_emit import (
        assert_public_film_id_attach_not_regressed,
    )

    catalog = {
        "films": [
            _catalog_film(
                film_id="tmdb:15080",
                status="confirmed_manual",
                source="amc",
                source_film_id="83588",
                showtime_film_key="only-yesterday",
            )
        ]
    }
    showtimes_doc = {
        "films": [
            {
                "showtime_film_key": "only-yesterday",
                "source_film_id": "83588",
                "film_id": "tmdb:15080",
                "title": "Only Yesterday",
            },
            {
                "showtime_film_key": "mystery",
                "source_film_id": "999",
                "film_id": None,
                "title": "Mystery",
            },
        ],
        "showtimes": [
            {
                "showtime_film_key": "only-yesterday",
                "source": "amc",
                "source_film_id": "83588",
            },
            {
                "showtime_film_key": "mystery",
                "source": "amc",
                "source_film_id": "999",
            },
        ],
    }
    result = assert_public_film_id_attach_not_regressed(
        showtimes_doc=showtimes_doc,
        catalog=catalog,
    )
    assert result["status"] == "ok"
    assert result["non_null_film_id"] == 1
    assert result["attachable_aliases"] == 1
