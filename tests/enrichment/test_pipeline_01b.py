"""T-ENR-01B enrichment pipeline tests (no live TMDB in CI)."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from reel_seattle.enrichment.normalize import (
    build_image_config,
    merge_partial_row,
    normalize_enrichment_row,
)
from reel_seattle.enrichment.pipeline import (
    build_enrichment_artifact,
    write_enrichment_outputs,
)
from reel_seattle.enrichment.validate import validate_film_enrichment_document
from reel_seattle.validate import SchemaValidationError

FIXTURE = (
    Path(__file__).resolve().parents[1]
    / "fixtures"
    / "enrichment"
    / "film_enrichment_v1_example.json"
)


def _catalog(*films: dict) -> dict:
    return {
        "schema_version": "1.0.0",
        "generated_at": "2026-07-28T00:00:00+00:00",
        "films": list(films),
    }


def _confirmed(tmdb_id: int, *, status: str = "confirmed_manual") -> dict:
    return {
        "film_id": f"tmdb:{tmdb_id}",
        "identity_type": "tmdb",
        "tmdb_id": tmdb_id,
        "match_status": status,
        "match_method": "manual" if "manual" in status else "automatic",
        "match_confidence": 1.0,
        "source_identities": [
            {"source": "siff", "source_film_id": str(tmdb_id), "source_title": f"Film {tmdb_id}"}
        ],
        "normalized_title": f"Film {tmdb_id}",
    }


def _details(tmdb_id: int, **overrides) -> dict:
    base = {
        "id": tmdb_id,
        "title": f"Film {tmdb_id}",
        "original_title": f"Original {tmdb_id}",
        "original_language": "en",
        "overview": f"Overview for {tmdb_id}",
        "release_date": "1991-07-20",
        "poster_path": f"/poster_{tmdb_id}.jpg",
        "backdrop_path": f"/backdrop_{tmdb_id}.jpg",
        "genres": [{"id": 18, "name": "Drama"}],
        "credits": {
            "crew": [{"id": 1, "name": "Ada Director", "job": "Director"}],
            "cast": [
                {
                    "id": 10,
                    "name": "Lead Actor",
                    "character": "Hero",
                    "order": 0,
                }
            ],
        },
        "external_ids": {"imdb_id": "tt0094625"},
        "runtime": 118,
        "release_dates": {
            "results": [
                {
                    "iso_3166_1": "US",
                    "release_dates": [
                        {"certification": "PG", "type": 3},
                    ],
                }
            ]
        },
    }
    base.update(overrides)
    return base


class FakeClient:
    def __init__(self, payloads: dict[int, dict] | Exception | None = None) -> None:
        self.payloads = payloads if isinstance(payloads, dict) else {}
        self.error = payloads if isinstance(payloads, Exception) else None
        self.calls: list[int] = []

    def movie_details(self, tmdb_id: int) -> dict:
        self.calls.append(tmdb_id)
        if self.error is not None:
            raise self.error
        if tmdb_id not in self.payloads:
            raise RuntimeError(f"missing fixture for {tmdb_id}")
        return self.payloads[tmdb_id]


def _row_from_details(details: dict, *, fetched_at: str) -> dict:
    return normalize_enrichment_row(
        details,
        image_config=build_image_config(),
        fetched_at=fetched_at,
    )


def test_example_fixture_validates():
    doc = json.loads(FIXTURE.read_text(encoding="utf-8"))
    validate_film_enrichment_document(doc)


def test_normalize_core_fields_and_unicode():
    details = _details(
        15080,
        title="Only Yesterday",
        original_title="おもひでぽろぽろ",
        original_language="ja",
        overview="  trimmed  ",
        genres=[{"id": 16, "name": "Animation"}, {"id": 16, "name": "Animation"}],
        credits={
            "crew": [
                {"id": 608, "name": "Isao Takahata", "job": "Director"},
                {"id": 608, "name": "Isao Takahata", "job": "Director"},
                {"id": 9, "name": "Not Director", "job": "Writer"},
            ],
            "cast": [],
        },
        external_ids={"imdb_id": "bad"},
        poster_path="/tOSnFE9e82iH3ZAzSTtuOkBsabJ.jpg",
        backdrop_path=None,
    )
    row = normalize_enrichment_row(details, image_config=build_image_config())
    assert row["film_id"] == "tmdb:15080"
    assert row["original_title"] == "おもひでぽろぽろ"
    assert row["overview"] == "trimmed"
    assert row["imdb_id"] is None
    assert row["release_year"] == 1991
    assert row["genres"] == [{"id": 16, "name": "Animation"}]
    assert row["directors"] == [{"tmdb_person_id": 608, "name": "Isao Takahata"}]
    assert row["poster"]["url"].endswith("/w500/tOSnFE9e82iH3ZAzSTtuOkBsabJ.jpg")
    assert row["backdrop"] is None


def test_merge_partial_preserves_prior_good_fields():
    prior = _row_from_details(_details(1), fetched_at="2026-01-01T00:00:00+00:00")
    incoming = _row_from_details(
        _details(1, overview="", directors=[], poster_path=None),
        fetched_at="2026-07-01T00:00:00+00:00",
    )
    merged = merge_partial_row(prior, incoming)
    assert merged["overview"] == prior["overview"]
    assert merged["directors"] == prior["directors"]
    assert merged["poster"] == prior["poster"]
    assert merged["provenance"]["fetched_at"] == "2026-07-01T00:00:00+00:00"


def test_build_includes_confirmed_excludes_fallbacks_and_dedups():
    catalog = _catalog(
        _confirmed(10, status="confirmed_automatic"),
        _confirmed(10, status="confirmed_manual"),
        _confirmed(20, status="confirmed_manual"),
        {
            "film_id": "source:amc:1",
            "identity_type": "source",
            "tmdb_id": None,
            "match_status": "unmatched",
            "match_method": "fallback",
            "match_confidence": None,
            "source_identities": [{"source": "amc", "source_film_id": "1"}],
        },
        {
            "film_id": "source:amc:2",
            "identity_type": "source",
            "tmdb_id": None,
            "match_status": "non_film",
            "match_method": "none",
            "match_confidence": None,
            "source_identities": [{"source": "amc", "source_film_id": "2"}],
        },
        {
            "film_id": "tmdb:99",
            "identity_type": "tmdb",
            "tmdb_id": 99,
            "match_status": "rejected",
            "match_method": "none",
            "match_confidence": None,
            "source_identities": [{"source": "siff", "source_film_id": "99"}],
        },
    )
    client = FakeClient({10: _details(10), 20: _details(20)})
    artifact, metrics = build_enrichment_artifact(
        catalog=catalog,
        prior=None,
        client=client,
        now=datetime(2026, 7, 28, tzinfo=timezone.utc),
    )
    assert [row["tmdb_id"] for row in artifact["films"]] == [10, 20]
    assert metrics["eligible_confirmed_tmdb_films"] == 2
    assert metrics["fresh_fetch_count"] == 2
    validate_film_enrichment_document(artifact)


def test_offline_reuses_prior_and_omits_missing():
    prior_row = _row_from_details(
        _details(10),
        fetched_at="2026-07-01T00:00:00+00:00",
    )
    prior = {
        "version": 1,
        "generated_at": "2026-07-01T00:00:00+00:00",
        "provider": "tmdb",
        "language": "en-US",
        "image_config": build_image_config(),
        "films": [prior_row],
    }
    catalog = _catalog(_confirmed(10), _confirmed(20))
    artifact, metrics = build_enrichment_artifact(
        catalog=catalog,
        prior=prior,
        client=None,
        offline=True,
        now=datetime(2026, 7, 28, tzinfo=timezone.utc),
    )
    assert [row["tmdb_id"] for row in artifact["films"]] == [10]
    assert metrics["cache_reuse_count"] == 1
    assert metrics["missing_first_fetch_count"] == 1
    assert metrics["status"] == "partial"


def test_temporary_failure_retains_last_good():
    prior_row = _row_from_details(
        _details(10),
        fetched_at=(datetime(2026, 1, 1, tzinfo=timezone.utc)).isoformat(),
    )
    prior = {
        "version": 1,
        "generated_at": prior_row["provenance"]["fetched_at"],
        "provider": "tmdb",
        "language": "en-US",
        "image_config": build_image_config(),
        "films": [prior_row],
    }
    client = FakeClient(RuntimeError("tmDB down"))
    artifact, metrics = build_enrichment_artifact(
        catalog=_catalog(_confirmed(10)),
        prior=prior,
        client=client,
        refresh=True,
        now=datetime(2026, 7, 28, tzinfo=timezone.utc),
    )
    assert len(artifact["films"]) == 1
    assert artifact["films"][0]["overview"] == prior_row["overview"]
    assert metrics["retained_last_good_count"] == 1
    assert metrics["failed_fetch_count"] == 1
    assert metrics["status"] == "partial"


def test_orphan_identity_removed():
    old = _row_from_details(_details(1), fetched_at="2026-07-01T00:00:00+00:00")
    keep = _row_from_details(_details(2), fetched_at="2026-07-01T00:00:00+00:00")
    prior = {
        "version": 1,
        "generated_at": "2026-07-01T00:00:00+00:00",
        "provider": "tmdb",
        "language": "en-US",
        "image_config": build_image_config(),
        "films": [old, keep],
    }
    client = FakeClient({2: _details(2)})
    artifact, metrics = build_enrichment_artifact(
        catalog=_catalog(_confirmed(2)),
        prior=prior,
        client=client,
        now=datetime(2026, 7, 28, tzinfo=timezone.utc),
    )
    assert [row["tmdb_id"] for row in artifact["films"]] == [2]
    assert metrics["removed_orphan_count"] == 1


def test_invalid_write_does_not_replace_prior(tmp_path: Path):
    good = {
        "version": 1,
        "generated_at": "2026-07-28T00:00:00+00:00",
        "provider": "tmdb",
        "language": "en-US",
        "image_config": build_image_config(),
        "films": [
            _row_from_details(_details(1), fetched_at="2026-07-28T00:00:00+00:00")
        ],
    }
    artifact_path = tmp_path / "film_enrichment_current.json"
    report_path = tmp_path / "report.json"
    artifact_path.write_text(json.dumps(good), encoding="utf-8")
    bad = dict(good)
    bad["films"] = [
        {
            **good["films"][0],
            "film_id": "source:amc:1",
            "tmdb_id": 1,
        }
    ]
    with pytest.raises((ValueError, SchemaValidationError)):
        write_enrichment_outputs(
            bad,
            {"status": "ok"},
            artifact_path=artifact_path,
            report_path=report_path,
        )
    retained = json.loads(artifact_path.read_text(encoding="utf-8"))
    assert retained["films"][0]["film_id"] == "tmdb:1"
    report = json.loads(report_path.read_text(encoding="utf-8"))
    assert report["validation_status"] == "failed"


@pytest.mark.parametrize(
    "mutator",
    [
        lambda d: d["films"].append(d["films"][0]),
        lambda d: d["films"][0].__setitem__("film_id", "tmdb:999"),
        lambda d: d["films"][0].__setitem__("release_date", "1991/07/20"),
        lambda d: d["films"][0].__setitem__("release_year", 1990),
        lambda d: d["films"][0].__setitem__("imdb_id", "imdb"),
        lambda d: d["films"][0].__setitem__(
            "poster", {"path": "missing-slash.jpg", "url": None}
        ),
        lambda d: d["films"][0].__setitem__(
            "genres",
            [{"id": 1, "name": "Drama"}, {"id": 2, "name": "Drama"}],
        ),
        lambda d: d["films"][0].__setitem__("vote_average", 8.1),
        lambda d: d.__setitem__("notes", "api_key=abc123"),
    ],
)
def test_validation_rejects_contract_violations(mutator):
    doc = json.loads(FIXTURE.read_text(encoding="utf-8"))
    mutator(doc)
    with pytest.raises((ValueError, SchemaValidationError)):
        validate_film_enrichment_document(doc)


def test_stale_forces_refetch():
    stale_stamp = (datetime(2026, 7, 28, tzinfo=timezone.utc) - timedelta(days=100)).isoformat()
    prior_row = _row_from_details(_details(10, overview="old"), fetched_at=stale_stamp)
    prior = {
        "version": 1,
        "generated_at": stale_stamp,
        "provider": "tmdb",
        "language": "en-US",
        "image_config": build_image_config(),
        "films": [prior_row],
    }
    client = FakeClient({10: _details(10, overview="new")})
    artifact, metrics = build_enrichment_artifact(
        catalog=_catalog(_confirmed(10)),
        prior=prior,
        client=client,
        now=datetime(2026, 7, 28, tzinfo=timezone.utc),
    )
    assert artifact["films"][0]["overview"] == "new"
    assert metrics["fresh_fetch_count"] == 1
    assert metrics["stale_count"] == 1


def test_frontend_isolation_no_pipeline_token_leakage():
    """Browser code may load the public enrichment artifact, but never TMDB secrets."""
    v2_root = Path(__file__).resolve().parents[2] / "v2"
    secret_hits = []
    for path in v2_root.rglob("*"):
        if path.suffix.lower() not in {".js", ".jsx", ".ts", ".tsx", ".mjs", ".css"}:
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        lowered = text.lower()
        if "tmdb_api_key" in lowered or "authorization: bearer" in lowered:
            secret_hits.append(str(path))
        if "api.themoviedb.org" in lowered:
            secret_hits.append(str(path))
    assert secret_hits == []
