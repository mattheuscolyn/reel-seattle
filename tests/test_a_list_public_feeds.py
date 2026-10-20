"""Safety and shape tests for the minimal public AMC planning feeds."""
from scripts.build_a_list_catalog import build_public_a_list_catalog
from scripts.build_a_list_forecast import build_public_forecast
import pytest

def test_eligibility_export_exposes_only_allowlisted_fields():
    raw={"generated_at":"2026-10-12T07:00:00-07:00","products":[
        {"source_film_id":"123","source_title":"Hidden film",
         "available_for_a_list":True,"release_date_utc":"2026-10-23T05:00:00Z",
         "presentation":{"category":"standard"},"private_field":"do not publish"},
        {"source_film_id":"234","available_for_a_list":False,
         "presentation":{"category":"concert_or_event"}},
        {"source_film_id":"345","available_for_a_list":None},
    ]}
    result=build_public_a_list_catalog(raw)
    assert result["schema_version"]==1
    assert len(result["products"])==2
    assert result["products"][0]=={
        "amc_movie_id":"123","a_list_eligible":True,"release_date":"2026-10-23",
        "presentation_kind":"standard"}
    assert result["products"][1]["a_list_eligible"] is False
    assert "Hidden film" not in str(result)
    assert "private_field" not in str(result)

def test_incomplete_export_never_overwrites_verified_eligibility():
    with pytest.raises(ValueError):
        build_public_a_list_catalog({"generated_at":"2026-10-12T07:00:00Z","products":[
            {"source_film_id":"123","available_for_a_list":None}]})
    with pytest.raises(ValueError):
        build_public_a_list_catalog({"generated_at":"2026-10-12T07:00:00Z","products":[
            {"source_film_id":"123","available_for_a_list":True},
            {"source_film_id":"123","available_for_a_list":False},
        ]})

def test_shadow_subset_only_exports_valid_probabilities():
    input={"modelVersion":"remaining_run_shadow_v1","asOf":"2026-10-12",
        "generatedAt":"2026-10-12T19:00:00Z","market":[
            {"sourceFilmId":"123","currentProgrammingWeek":"2026-10-09",
             "forecastState":"post_publication","pFinalWeek":0.6,
             "pPlus1Week":0.3,"pPlus2Weeks":0.1,"pPlus3PlusWeeks":0.0,
             "model_inputs":{"private":"not public"}},
            {"sourceFilmId":"124","pFinalWeek":0.9,
             "pPlus1Week":0.9,"pPlus2Weeks":0.1,"pPlus3PlusWeeks":0.0},
        ]}
    doc=build_public_forecast(input)
    assert doc["asOf"]=="2026-10-12"
    assert len(doc["market"])==1
    assert doc["market"][0]["sourceFilmId"]=="123"
    assert "private" not in str(doc)


def test_degraded_shadow_forecast_keeps_last_known_good_file(tmp_path, monkeypatch):
    import json
    import sys
    from scripts.build_a_list_forecast import main

    source = tmp_path / "shadow.json"
    output = tmp_path / "a_list_run_forecast_current.json"
    source.write_text(json.dumps({
        "modelVersion": "remaining_run_shadow_v1",
        "asOf": "2026-10-20",
        "qualityState": "degraded_observation_history",
        "market": [{"sourceFilmId": "123", "pFinalWeek": 0.6, "pPlus1Week": 0.3,
                    "pPlus2Weeks": 0.1, "pPlus3PlusWeeks": 0.0}],
    }), encoding="utf-8")
    output.write_text('{"kept":true}\n', encoding="utf-8")
    monkeypatch.setattr(sys, "argv", ["build_a_list_forecast.py", "--source", str(source),
                                     "--output", str(output)])
    assert main() == 0
    assert json.loads(output.read_text(encoding="utf-8")) == {"kept": True}
