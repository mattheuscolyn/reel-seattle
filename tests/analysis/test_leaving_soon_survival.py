"""Tests for discrete-time remaining-run survival modeling."""

from __future__ import annotations

from datetime import date, timedelta

import pytest

from reel_seattle.analysis.leaving_soon_survival import (
    FORBIDDEN_MODEL_INPUTS,
    AgeOnlyBaseline,
    DiscreteHazardModel,
    apply_platt,
    assert_temporal_split_integrity,
    binary_outcome,
    conformal_residual_interval,
    covariate_dict,
    default_feature_columns,
    expand_person_periods,
    filter_primary_observations,
    follow_up_days,
    make_observation,
    n_bins,
    platt_calibrator,
    split_by_observation_date,
    survival_from_hazards,
    threshold_for_precision,
)


def test_same_day_final_show_is_period_zero_event():
    row = make_observation(remaining_days=0, event_observed=True, right_censored=False)
    periods = expand_person_periods(row, as_of=date(2026, 8, 1), horizon_days=21, bin_size=1)
    assert [(p.period, p.event) for p in periods] == [(0, 1)]


def test_seven_day_event_has_six_zeros_then_one():
    row = make_observation(remaining_days=7, event_observed=True)
    periods = expand_person_periods(row, as_of=date(2026, 8, 1), bin_size=1, horizon_days=21)
    assert [p.event for p in periods] == [0, 0, 0, 0, 0, 0, 0, 1]
    assert periods[-1].period == 7


def test_censored_observation_has_no_event_and_stops_at_follow_up():
    row = make_observation(
        observation_date=date(2026, 8, 1),
        remaining_days=None,
        event_observed=False,
        right_censored=True,
        outcome_quality="right_censored",
    )
    as_of = date(2026, 8, 11)  # 10 days of follow-up; event-free days 0..9
    periods = expand_person_periods(row, as_of=as_of, bin_size=1, horizon_days=21)
    assert follow_up_days(row, as_of) == 10
    assert all(p.event == 0 for p in periods)
    assert [p.period for p in periods] == list(range(10))


def test_zero_follow_up_censored_row_emits_no_periods():
    row = make_observation(
        observation_date=date(2026, 9, 1),
        remaining_days=None,
        event_observed=False,
        right_censored=True,
        outcome_quality="right_censored",
    )
    periods = expand_person_periods(row, as_of=date(2026, 9, 1), bin_size=1, horizon_days=21)
    assert periods == []


def test_weekly_bins_do_not_include_incomplete_censor_bin():
    row = make_observation(
        observation_date=date(2026, 8, 1),
        remaining_days=None,
        event_observed=False,
        right_censored=True,
        outcome_quality="right_censored",
    )
    periods = expand_person_periods(row, as_of=date(2026, 8, 11), bin_size=7, horizon_days=21)
    # follow-up 10 days: bin 0 (days 0-6) complete; bin 1 (7-13) incomplete
    assert [(p.period, p.event) for p in periods] == [(0, 0)]


def test_survival_curve_is_monotone_and_bounded():
    curve = survival_from_hazards([0.2, 0.5, 0.9], bin_size=1, horizon_days=2)
    assert curve.survival[0] == 1.0
    assert all(0.0 <= s <= 1.0 for s in curve.survival)
    assert all(curve.survival[i] >= curve.survival[i + 1] for i in range(len(curve.survival) - 1))
    assert all(0.0 <= h <= 1.0 for h in curve.hazards)
    assert 0.0 <= curve.p_end_within[3] <= 1.0


def test_remaining_day_derivation_from_hazards():
    # Certain death on day 0
    certain = survival_from_hazards([1.0, 0.0, 0.0], bin_size=1, horizon_days=2)
    assert certain.median_remaining_days == 0
    assert certain.p_end_within[7] == 1.0
    # No hazard within horizon
    never = survival_from_hazards([0.0, 0.0, 0.0], bin_size=1, horizon_days=2)
    assert never.median_beyond_horizon is True
    assert never.median_remaining_days is None
    assert never.p_end_within[3] == 0.0


def test_far_future_event_is_horizon_censored_in_expansion():
    row = make_observation(remaining_days=40, event_observed=True)
    periods = expand_person_periods(row, as_of=date(2026, 9, 1), bin_size=1, horizon_days=21)
    assert len(periods) == n_bins(21, 1)
    assert all(p.event == 0 for p in periods)


def test_one_night_special_is_special_and_day_zero_event():
    row = make_observation(
        run_type="concert_live_event",
        remaining_days=0,
        theater_count=1,
        showtime_count=1,
        days_since_run_start=0,
    )
    assert row.is_special is True
    periods = expand_person_periods(row, as_of=date(2026, 8, 1), bin_size=1, horizon_days=7)
    assert periods[0].event == 1
    assert periods[0].features["is_special"] == 1.0


def test_long_running_first_run_not_special():
    row = make_observation(
        run_type="probable_normal_first_run",
        remaining_days=18,
        days_since_run_start=20,
        theater_count=6,
    )
    assert row.is_special is False
    periods = expand_person_periods(row, as_of=date(2026, 9, 1), bin_size=1, horizon_days=21)
    assert periods[-1].event == 1
    assert periods[-1].period == 18


def test_covariates_exclude_label_fields():
    row = make_observation(remaining_days=4)
    feats = covariate_dict(row)
    assert not (set(feats) & FORBIDDEN_MODEL_INPUTS)
    assert "theater_count" in feats
    assert "remaining_days" not in feats


def test_missing_prior_features_are_zero_with_flag():
    row = make_observation(
        delta_theater_count="",
        delta_showtime_count="",
        farthest_show_date_delta="",
    )
    feats = covariate_dict(row)
    assert feats["missing_prior"] == 1.0
    assert feats["delta_theater_count"] == 0.0


def test_filter_drops_title_fallback_keeps_specials_and_censored():
    rows = [
        make_observation(identity_kind="title_fallback", product_id="title:foo"),
        make_observation(
            identity_kind="source_film_id",
            observation_quality="usable_14day_truncated_title_identity",
        ),
        make_observation(
            identity_kind="source_film_id",
            outcome_quality="unreliable_negative_remaining",
            event_observed=True,
        ),
        make_observation(run_type="concert_live_event", remaining_days=0),
        make_observation(
            remaining_days=None,
            event_observed=False,
            right_censored=True,
            outcome_quality="right_censored",
        ),
    ]
    kept, accounting = filter_primary_observations(rows)
    assert len(kept) == 2
    assert {row.run_type for row in kept} == {"concert_live_event", "probable_normal_first_run"}
    assert any(row.right_censored for row in kept)
    assert accounting[0]["remaining"] == 5
    assert accounting[-1]["remaining"] == 2


def test_time_based_split_has_no_future_in_train():
    rows = [
        make_observation(observation_date=date(2026, 7, 1), run_id="a#01"),
        make_observation(observation_date=date(2026, 7, 27), run_id="a#01"),
        make_observation(observation_date=date(2026, 8, 1), run_id="a#01"),
        make_observation(observation_date=date(2026, 8, 20), run_id="b#01"),
    ]
    bundle = split_by_observation_date(
        rows, train_end=date(2026, 7, 27), val_end=date(2026, 8, 14)
    )
    assert_temporal_split_integrity(bundle)
    assert {row.observation_date for row in bundle.train} == {date(2026, 7, 1), date(2026, 7, 27)}
    assert {row.observation_date for row in bundle.val} == {date(2026, 8, 1)}
    assert {row.observation_date for row in bundle.test} == {date(2026, 8, 20)}
    assert max(r.observation_date for r in bundle.train) < min(r.observation_date for r in bundle.val)
    assert max(r.observation_date for r in bundle.val) < min(r.observation_date for r in bundle.test)


def test_split_rejects_overlapping_windows():
    rows = [make_observation(observation_date=date(2026, 7, 1))]
    with pytest.raises(ValueError):
        split_by_observation_date(rows, train_end=date(2026, 8, 1), val_end=date(2026, 8, 1))


def test_binary_outcome_excludes_short_censoring():
    as_of = date(2026, 8, 5)
    observed_hit = make_observation(remaining_days=3, event_observed=True)
    observed_miss = make_observation(remaining_days=10, event_observed=True)
    censored_known_alive = make_observation(
        observation_date=date(2026, 7, 1),
        remaining_days=None,
        event_observed=False,
        right_censored=True,
        outcome_quality="right_censored",
    )
    censored_unknown = make_observation(
        observation_date=date(2026, 8, 3),
        remaining_days=None,
        event_observed=False,
        right_censored=True,
        outcome_quality="right_censored",
    )
    assert binary_outcome(observed_hit, horizon=7, as_of=as_of) == 1
    assert binary_outcome(observed_miss, horizon=7, as_of=as_of) == 0
    assert binary_outcome(censored_known_alive, horizon=7, as_of=as_of) == 0
    assert binary_outcome(censored_unknown, horizon=7, as_of=as_of) is None


def test_run_type_encoding_groups_specials():
    first = covariate_dict(make_observation(run_type="probable_normal_first_run"))
    concert = covariate_dict(make_observation(run_type="concert_live_event"))
    rerelease = covariate_dict(make_observation(run_type="rerelease_anniversary"))
    assert first["grp_first_run"] == 1.0
    assert concert["is_special"] == 1.0
    assert concert["grp_event_or_special"] == 1.0
    assert rerelease["grp_rerelease"] == 1.0
    assert rerelease["grp_first_run"] == 0.0


def test_threshold_selection_uses_provided_scores_only():
    y = [1, 1, 0, 0, 0]
    scores = [0.9, 0.8, 0.7, 0.2, 0.1]
    chosen = threshold_for_precision(y, scores, min_precision=0.9)
    assert chosen["threshold"] >= 0.8
    assert chosen["precision"] >= 0.9


def test_age_only_baseline_uses_train_medians():
    train = [
        make_observation(days_since_run_start=2, remaining_days=10),
        make_observation(days_since_run_start=2, remaining_days=12),
        make_observation(days_since_run_start=20, remaining_days=1),
        make_observation(days_since_run_start=20, remaining_days=3),
    ]
    model = AgeOnlyBaseline().fit(train)
    young = make_observation(days_since_run_start=1, remaining_days=99)
    old = make_observation(days_since_run_start=21, remaining_days=99)
    assert model.predict_median(young) == 11
    assert model.predict_median(old) == 2


def test_logistic_fit_is_deterministic_and_ignores_missing_like_zero():
    sklearn = pytest.importorskip("sklearn")
    _ = sklearn
    train_rows = [
        make_observation(
            observation_date=date(2026, 7, 1) + timedelta(days=i),
            run_id=f"{i}#01",
            remaining_days=0 if i % 2 == 0 else 8,
            theater_count=1 if i % 2 == 0 else 6,
            days_since_run_start=i,
        )
        for i in range(12)
    ]
    as_of = date(2026, 8, 1)
    from reel_seattle.analysis.leaving_soon_survival import expand_rows

    periods = expand_rows(train_rows, as_of=as_of, horizon_days=14, bin_size=1)
    columns = default_feature_columns(n_bins(14, 1))
    model_a = DiscreteHazardModel(columns=columns, horizon_days=14, bin_size=1, seed=42).fit(periods)
    model_b = DiscreteHazardModel(columns=columns, horizon_days=14, bin_size=1, seed=42).fit(periods)
    row = make_observation(theater_count=1, remaining_days=0, days_since_run_start=0)
    assert model_a.predict_hazards_for_row(row) == pytest.approx(model_b.predict_hazards_for_row(row))
    curve = model_a.predict_curve(row)
    assert curve.survival[0] == 1.0
    assert all(curve.survival[i] >= curve.survival[i + 1] for i in range(len(curve.survival) - 1))


def test_scaler_is_fit_on_train_not_later_rows():
    pytest.importorskip("sklearn")
    small = make_observation(theater_count=1, remaining_days=2, run_id="s#01")
    large = make_observation(theater_count=100, remaining_days=2, run_id="l#01")
    from reel_seattle.analysis.leaving_soon_survival import expand_rows

    columns = default_feature_columns(n_bins(7, 1))
    train_periods = expand_rows([small], as_of=date(2026, 8, 1), horizon_days=7, bin_size=1)
    model = DiscreteHazardModel(columns=columns, horizon_days=7, bin_size=1).fit(train_periods)
    later_periods = expand_rows([large], as_of=date(2026, 8, 1), horizon_days=7, bin_size=1)
    # Scaler mean comes from train theater_count=1, not 100.
    import numpy as np
    from reel_seattle.analysis.leaving_soon_survival import feature_matrix

    x_train = np.asarray(feature_matrix(train_periods, columns), dtype=float)
    idx = columns.index("theater_count")
    mean = x_train[:, idx].mean()
    assert mean == pytest.approx(1.0)
    x_later = np.asarray(feature_matrix(later_periods, columns), dtype=float)
    assert x_later[:, idx].mean() == pytest.approx(100.0)
    transformed = model._transform(x_later.tolist())
    assert transformed[0, idx] != pytest.approx(0.0)


def test_default_columns_exclude_label_fields():
    columns = default_feature_columns(n_bins(21, 1))
    assert not (set(columns) & FORBIDDEN_MODEL_INPUTS)
    assert "remaining_days" not in columns
    assert "run_end_date" not in columns


def test_platt_calibrator_uses_only_provided_scores():
    pytest.importorskip("sklearn")
    val_scores = [0.1, 0.2, 0.8, 0.9]
    val_y = [0, 0, 1, 1]
    held_out = [0.05, 0.95]
    model = platt_calibrator(val_scores, val_y)
    calibrated = apply_platt(model, held_out)
    # Held-out labels never enter the fit; output stays in (0, 1).
    assert all(0.0 < p < 1.0 for p in calibrated)
    assert calibrated[0] < calibrated[1]


def test_conformal_interval_is_not_marked_defensible():
    result = conformal_residual_interval([1.0, -2.0, 3.0, 0.0, 4.0], alpha=0.2)
    assert result["defensible"] == 0.0
    assert result["n"] == 5
    assert result["half_width"] >= 0.0
