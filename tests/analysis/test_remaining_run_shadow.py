from datetime import date, timedelta

from reel_seattle.analysis.leaving_soon_feature_expansion import enrich_observations
from reel_seattle.analysis.leaving_soon_prepublication_survival import _fit_hazard, _person_periods, _predict_rows
from reel_seattle.analysis.leaving_soon_scheduling_assumptions import Screening
from reel_seattle.analysis.remaining_run_shadow import (
    append_ledger,
    assert_probabilities,
    evaluation_seed,
    horizon_friday,
    probabilities_from_serialized,
    publication_status,
    selected_feature_names,
    serialize_hazard,
    write_shadow_outputs,
)
from reel_seattle.analysis.tmdb_weekly_snapshot import append_jsonl_gz, split_tmdb_payload


def _show(film, theater, day):
    return Screening(
        screening_id=f"{film}-{theater}-{day.isoformat()}",
        film_id=film,
        title="Film",
        theater_id=theater,
        show_date=day,
        minutes=1140,
        first_snapshot=day - timedelta(days=2),
        removed_before_show=False,
        canceled=False,
        premium=False,
        catalog_category="ordinary",
        title_run_type="first",
        segment="ordinary",
        segment_source="test",
        segment_confidence="high",
        identity_kind="film",
    )


def _labeled(bucket, screening):
    row = {name: float(screening) for name in selected_feature_names()}
    row.update({"censored": 0, "bucket": bucket, "remaining_weeks": bucket if bucket < 3 else 4, "known_weeks": bucket if bucket < 3 else 4})
    return row


def test_selected_features_exclude_auditorium_and_include_opening():
    names = selected_feature_names()
    assert "opening_week_screenings" in names
    assert "current_week_screenings" in names
    assert not any("auditorium" in name or "price" in name or "sold" in name for name in names)


def test_distribution_is_nonnegative_and_sums_to_one():
    rows = [_labeled(bucket % 4, index + 1) for index, bucket in enumerate([0, 1, 2, 3] * 12)]
    rows.append({"censored": 1, "bucket": None, "remaining_weeks": None, "known_weeks": 1, **{name: 0.0 for name in selected_feature_names()}})
    periods = _person_periods(rows)
    assert all(event == 0 for _row, _period, event in periods if _row["censored"])
    model = _fit_hazard(rows, selected_feature_names())
    spec = serialize_hazard(model)
    scored = [dict(row) for row in rows if not row["censored"]]
    _predict_rows(model, scored)
    again = probabilities_from_serialized(spec, scored[0])
    probs = [again["p_final_week"], again["p_plus_1_week"], again["p_plus_2_weeks"], again["p_plus_3_plus"]]
    assert_probabilities(probs)
    assert abs(again["p_final_week"] - scored[0]["p0"]) < 1e-8
    second = probabilities_from_serialized(spec, scored[0])
    assert second == again


def test_opening_footprint_ignores_a_later_week():
    visible = date(2026, 8, 14)
    shows = [
        _show("f", "t", date(2026, 8, 7)),
        _show("f", "t", date(2026, 8, 8)),
        *[_show("f", "t", visible + timedelta(days=offset)) for offset in range(5)],
        *[_show("f", "t", date(2026, 8, 21) + timedelta(days=offset)) for offset in range(9)],
    ]
    row = {
        "snapshot_kind": "shadow",
        "film_id": "f",
        "theater_id": "t",
        "observation_date": "2026-08-17",
        "visible_friday": visible.isoformat(),
        "upcoming_friday": "2026-08-21",
        "current_week_screenings": 5,
        "market_theater_count": 1,
        "left_truncated": 0,
        "theater_name": "Test",
        "title": "Film",
        "segment": "ordinary",
        "theatrical_week_number": 2,
    }
    enrich_observations([row], shows, {}, {}, date(2026, 6, 1))
    assert row["opening_week_screenings"] == 2
    assert row["peak_week_screenings"] == 5


def test_post_publication_features_use_the_snapshot_before_the_threshold():
    upcoming = date(2026, 10, 9)
    snapshots = [date(2026, 10, 5), date(2026, 10, 6), date(2026, 10, 7)]
    shows = []
    for day, count in ((date(2026, 10, 5), 2), (date(2026, 10, 6), 10), (date(2026, 10, 7), 10)):
        for index in range(count):
            show = _show("f", "t", upcoming)
            show = Screening(**{**show.__dict__, "screening_id": f"{day.isoformat()}-{index}", "first_snapshot": day})
            shows.append(show)
    for index in range(10):
        shows.append(_show(f"other-{index}", "t", date(2026, 10, 2)))
    status = publication_status(shows, "t", snapshots, upcoming, snapshots[-1])
    assert status["forecast_state"] == "post_publication"
    assert status["feature_snapshot"] == date(2026, 10, 5)
    assert status["publication_snapshot"] == date(2026, 10, 6)
    assert horizon_friday(date(2026, 10, 1)) == date(2026, 10, 2)


def test_ledgers_append_without_rewriting_or_touching_production(tmp_path):
    forecast = {
        "record_type": "forecast",
        "prediction_id": "v|theater|film|th|2026-10-09|pre_publication|2026-10-05",
        "model_version": "remaining_run_shadow_v1",
        "grain": "theater",
        "film_id": "film",
        "theater_id": "th",
        "prediction_date": "2026-10-05",
        "upcoming_friday": "2026-10-09",
        "forecast_state": "pre_publication",
        "p_final_week": 0.5,
        "p_plus_1_week": 0.2,
        "p_plus_2_weeks": 0.2,
        "p_plus_3_plus": 0.1,
        "expected_remaining_weeks": 0.9,
    }
    path = tmp_path / "forecasts.jsonl.gz"
    assert append_ledger(path, [forecast]) == 1
    assert append_ledger(path, [forecast]) == 0
    assert append_ledger(path, [evaluation_seed([forecast])[0]]) == 1
    first = append_ledger.__wrapped__ if hasattr(append_ledger, "__wrapped__") else None
    assert first is None
    from reel_seattle.analysis.tmdb_weekly_snapshot import read_jsonl_gz

    stored = read_jsonl_gz(path)
    assert stored[0]["prediction_id"] == forecast["prediction_id"]
    assert stored[0]["p_final_week"] == 0.5
    dynamic, stable = split_tmdb_payload(
        {"id": 11, "popularity": 3, "vote_count": 4, "vote_average": 5, "original_language": "en", "runtime": 90, "genres": [], "production_companies": [], "production_countries": []},
        film_id="film",
        observed_at="2026-10-02T00:00:00+00:00",
    )
    history = tmp_path / "tmdb.jsonl.gz"
    assert append_jsonl_gz(history, [dynamic], key_fn=lambda row: f"{row['tmdb_id']}|{row['observed_at'][:10]}") == 1
    assert append_jsonl_gz(history, [dynamic], key_fn=lambda row: f"{row['tmdb_id']}|{row['observed_at'][:10]}") == 0
    assert "popularity" not in stable
    result = {
        "generated_at": "2026-10-02T00:00:00+00:00",
        "manifest": {"role": "research_shadow_not_production", "verification_holdout": {}, "model_version": "remaining_run_shadow_v1"},
        "live": {"as_of": "2026-10-02", "upcoming_friday": "2026-10-09", "publication_by_theater": {}, "theaters": [], "market": []},
        "disagreements": [],
    }
    write_shadow_outputs(tmp_path, result)
    assert not (tmp_path / "public" / "data" / "leaving_soon_current.json").exists()
    assert (tmp_path / "data" / "models" / "remaining_run_shadow" / "current.json").exists()
    assert "research_shadow_not_production" in (tmp_path / "data" / "models" / "remaining_run_shadow" / "current.json").read_text(encoding="utf-8")
