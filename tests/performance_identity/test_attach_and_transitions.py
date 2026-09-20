"""Cross-source performance identity transition tests."""

from datetime import date

from reel_seattle.ingestion.grand_illusion_reconcile import (
    reconcile_grand_illusion_showtimes,
)
from reel_seattle.performance_identity.attach import attach_performance_ids


def _showtime(
    *,
    showtime_id: str,
    title: str,
    source: str,
    time: str = "18:30",
    occurrence_id: str | None = None,
    source_film_id: str | None = None,
    film_id: str | None = None,
    ticket_url: str | None = None,
) -> dict:
    row = {
        "id": showtime_id,
        "theater_id": "siff-film-center",
        "date": "2026-09-20",
        "time": time,
        "film_title": title,
        "source": source,
        "source_film_id": source_film_id,
        "attributes": {},
        "status": "active",
        "ticket_url": ticket_url,
    }
    if occurrence_id is not None:
        row["attributes"]["source_occurrence_id"] = occurrence_id
    if film_id is not None:
        row["film_id"] = film_id
    return row


def _gi(
    occurrence_id: str,
    *,
    title: str = "The Hole",
    showtime_id: str = "gi-fallback",
    time: str = "18:30",
    film_id: str | None = None,
) -> dict:
    return _showtime(
        showtime_id=showtime_id,
        title=title,
        source="grand_illusion",
        time=time,
        occurrence_id=occurrence_id,
        source_film_id="gi-program-the-hole",
        film_id=film_id,
    )


def _host(
    showtime_id: str = "abcdef01",
    *,
    title: str = "The Hole",
    time: str = "18:30",
    film_id: str | None = None,
) -> dict:
    return _showtime(
        showtime_id=showtime_id,
        title=title,
        source="siff",
        time=time,
        source_film_id="siff-film-the-hole",
        film_id=film_id,
        ticket_url="https://siff.example/tickets",
    )


def _attach(rows: list[dict], registry_path, day: int = 20) -> None:
    attach_performance_ids(
        rows,
        registry_path=registry_path,
        persist=True,
        reference_date=date(2026, 9, day),
    )


def test_gi_first_then_host_keeps_xsrc_identity(tmp_path):
    registry_path = tmp_path / "registry.json"
    day1_gi = _gi("occ-gi-first")
    _attach([day1_gi], registry_path)
    day1_public = reconcile_grand_illusion_showtimes([day1_gi])
    original_id = day1_public[0]["performance_id"]
    assert original_id.startswith("xsrc:grand-illusion:")

    day2_gi = _gi("occ-gi-first")
    day2_host = _host()
    _attach([day2_host, day2_gi], registry_path, day=21)
    day2_public = reconcile_grand_illusion_showtimes([day2_host, day2_gi])

    assert [row["id"] for row in day2_public] == ["abcdef01"]
    assert day2_public[0]["performance_id"] == original_id


def test_host_first_then_gi_uses_host_compatible_identity(tmp_path):
    registry_path = tmp_path / "registry.json"
    day1_host = _host()
    _attach([day1_host], registry_path)
    assert "performance_id" not in day1_host

    day2_host = _host()
    day2_gi = _gi("occ-host-first")
    _attach([day2_host, day2_gi], registry_path, day=21)
    public = reconcile_grand_illusion_showtimes([day2_host, day2_gi])

    assert public[0]["performance_id"] == "id:abcdef01"


def test_simultaneous_sources_use_host_compatible_identity(tmp_path):
    rows = [_host("abcdef02"), _gi("occ-simultaneous")]
    _attach(rows, tmp_path / "registry.json")
    public = reconcile_grand_illusion_showtimes(rows)

    assert len(public) == 1
    assert public[0]["id"] == "abcdef02"
    assert public[0]["performance_id"] == "id:abcdef02"


def test_host_inherits_xsrc_identity_after_gi_disappears(tmp_path):
    registry_path = tmp_path / "registry.json"
    day1_gi = _gi("occ-disappears")
    _attach([day1_gi], registry_path)
    original_id = day1_gi["performance_id"]

    _attach([], registry_path, day=21)
    day3_host = _host("abcdef03")
    _attach([day3_host], registry_path, day=22)

    assert day3_host["performance_id"] == original_id


def test_cross_process_gi_disappears_then_host_recovers_from_disk(tmp_path):
    """Prove GI→absent→host continuity across independent registry load cycles."""
    registry_path = tmp_path / "registry.json"

    # Run A (process 1): GI-only publishes mapping to disk.
    day1_gi = _gi("occ-cross-process")
    report_a = attach_performance_ids(
        [day1_gi],
        registry_path=registry_path,
        persist=True,
        reference_date=date(2026, 9, 20),
    )
    original_id = day1_gi["performance_id"]
    assert original_id.startswith("xsrc:grand-illusion:")
    assert report_a["registry_persisted"] is True
    on_disk = registry_path.read_text(encoding="utf-8")

    # Run B (process 2): GI absent; registry must still load from disk unchanged.
    report_b = attach_performance_ids(
        [],
        registry_path=registry_path,
        persist=True,
        reference_date=date(2026, 9, 21),
    )
    assert report_b["registry_upserts"] == 0
    assert registry_path.read_text(encoding="utf-8") == on_disk

    # Run C (process 3): host alone inherits persisted GI-first identity.
    day3_host = _host("abcdef99")
    attach_performance_ids(
        [day3_host],
        registry_path=registry_path,
        persist=True,
        reference_date=date(2026, 9, 22),
    )
    assert day3_host["performance_id"] == original_id


def test_attach_noop_second_run_does_not_rewrite_registry(tmp_path):
    registry_path = tmp_path / "registry.json"
    rows = [_gi("occ-noop")]
    first = attach_performance_ids(
        rows,
        registry_path=registry_path,
        persist=True,
        reference_date=date(2026, 9, 20),
    )
    assert first["registry_persisted"] is True
    before = registry_path.read_text(encoding="utf-8")

    rows2 = [_gi("occ-noop")]
    second = attach_performance_ids(
        rows2,
        registry_path=registry_path,
        persist=True,
        reference_date=date(2026, 9, 21),
    )
    assert second["registry_upserts"] == 0
    assert second["registry_persisted"] is False
    assert registry_path.read_text(encoding="utf-8") == before
    assert rows2[0]["performance_id"] == rows[0]["performance_id"]


def test_same_slot_different_films_get_different_performance_ids(tmp_path):
    rows = [
        _gi("occ-screen-a", title="The Hole", showtime_id="gi-a"),
        _gi("occ-screen-b", title="Pulp", showtime_id="gi-b"),
    ]
    _attach(rows, tmp_path / "registry.json")

    assert rows[0]["performance_id"] != rows[1]["performance_id"]


def test_ambiguous_hosts_do_not_publish_or_merge_gi(tmp_path):
    host1 = _host("abcdef04")
    host2 = _host("abcdef05")
    gi = _gi("occ-ambiguous")
    rows = [host1, host2, gi]
    _attach(rows, tmp_path / "registry.json")
    public = reconcile_grand_illusion_showtimes(rows)

    assert {row["id"] for row in public} == {"abcdef04", "abcdef05"}
    assert "performance_id" not in gi
    assert all("presenters" not in row["attributes"] for row in public)


def test_title_presentation_variants_reconcile_via_parent_keys(tmp_path):
    host = _host("abcdef06", title="The Hole (35mm)")
    gi = _gi("occ-title-variant", title="The Hole in 35mm")
    rows = [host, gi]
    _attach(rows, tmp_path / "registry.json")
    public = reconcile_grand_illusion_showtimes(rows)

    assert [row["id"] for row in public] == ["abcdef06"]
    assert public[0]["performance_id"] == "id:abcdef06"


def test_later_film_id_enrichment_does_not_churn_gi_identity(tmp_path):
    registry_path = tmp_path / "registry.json"
    first = _gi("occ-enrichment")
    _attach([first], registry_path)
    original_id = first["performance_id"]

    enriched = _gi("occ-enrichment", film_id="film-the-hole")
    _attach([enriched], registry_path, day=21)

    assert enriched["performance_id"] == original_id
