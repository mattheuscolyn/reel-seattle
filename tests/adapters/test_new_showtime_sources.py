"""Offline tests for Tasveer, Anderson School, STG, and Majestic Bay."""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

from daily_processor import process_indie_csv_data
from reel_seattle.adapters.anderson_school import fetch_anderson_school
from reel_seattle.adapters.anderson_titles import normalize_anderson_title
from reel_seattle.adapters.majestic_bay import fetch_majestic_bay
from reel_seattle.adapters.option_c import write_option_c_scrape_log
from reel_seattle.adapters.scrape_log import daily_log_path
from reel_seattle.adapters.stg import fetch_stg
from reel_seattle.adapters.stg_qualification import qualify_stg_event, split_stg_title
from reel_seattle.adapters.tasveer import fetch_tasveer
from reel_seattle.emit.current import build_showtimes_current
from reel_seattle.history_keys import load_theater_index

START = date(2026, 9, 27)
END = date(2027, 9, 27)
RUN_DATE = "2026-09-27"
SCRAPED_AT = "2026-09-27T12:00:00-07:00"


def _http(body: str | bytes, status: int = 200, headers: dict | None = None):
    payload = body.encode("utf-8") if isinstance(body, str) else body

    def fetch(url, method="GET", data=None, headers=None, timeout=45):
        return status, payload, headers or {"x-wp-totalpages": "1"}

    return fetch


def test_anderson_title_allowlist_does_not_strip_other_parentheticals():
    assert normalize_anderson_title("Wildwood (OCAP)") == ("Wildwood", "(OCAP)")
    assert normalize_anderson_title("Forgotten Island OCAP") == ("Forgotten Island", "OCAP")
    assert normalize_anderson_title("Practical Magic 2 (open captions)") == (
        "Practical Magic 2",
        "(open captions)",
    )
    assert normalize_anderson_title("The Godfather (Part II)") == ("The Godfather (Part II)", None)
    assert normalize_anderson_title("Disclosure Day (Director's Cut)") == (
        "Disclosure Day (Director's Cut)",
        None,
    )
    assert normalize_anderson_title("Film (2024)") == ("Film (2024)", None)
    assert normalize_anderson_title("OCAP Night") == ("OCAP Night", None)


def test_stg_title_split_is_series_specific():
    assert split_stg_title("Silent Movie Mondays – Metropolis (1927)") == (
        "Metropolis",
        1927,
        "Silent Movie Mondays",
    )
    assert split_stg_title("Silent Movie Mondays: The Godfather (Part II)") == (
        "The Godfather (Part II)",
        None,
        "Silent Movie Mondays",
    )
    decision, _reason = qualify_stg_event(
        "Songs from The Wizard of Oz",
        "The orchestra performs the score with no projection.",
    )
    assert decision == "deny"
    decision, _reason = qualify_stg_event(
        "Movies on My Mind",
        "A talk about movies with the programmer.",
    )
    assert decision == "deny"
    decision, _reason = qualify_stg_event(
        "The Lion King",
        "A Broadway musical based on the movie.",
    )
    assert decision == "deny"
    decision, _reason = qualify_stg_event(
        "An Evening of Film",
        "Category: Film. An evening with the director.",
    )
    assert decision == "ambiguous"
    decision, _reason = qualify_stg_event(
        "The Warning",
        "Everything's Falling World Tour. Their concert film Live From Auditorio Nacional, which screened in AMC theaters.",
    )
    assert decision == "deny"
    decision, _reason = qualify_stg_event(
        "Silent Movie Monday Matinee Lecture Demonstration",
        "Organist: Tyler Pattison. Hear the organ while watching a short silent film.",
    )
    assert decision == "deny"
    decision, reason = qualify_stg_event(
        "The Legend of Korra in Concert",
        "The series is projected on a full-size cinema screen while a live orchestra performs the score.",
    )
    assert decision == "accept"
    assert reason == "explicit_screening"
    decision, reason = qualify_stg_event(
        "The General",
        "Feature film screened with live organ accompaniment.",
    )
    assert decision == "accept"
    assert reason == "explicit_screening"
    decision, _reason = qualify_stg_event(
        "Dweezil Zappa",
        "His work spans television, film, and entrepreneurship, and a 100-piece orchestra has performed his compositions.",
    )
    assert decision != "accept"


def test_tasveer_maps_ids_timezone_and_open_captions():
    payload = {
        "data": {
            "movies": {
                "data": [
                    {
                        "id": "155992",
                        "name": "Primetime (USA, 2026)",
                        "urlSlug": "primetime",
                        "duration": 90,
                        "rating": "PG-13",
                        "showings": [
                            {
                                "id": "4003596",
                                "time": "2026-10-03T02:00:00Z",
                                "showingBadges": [{"id": "9", "title": "Open Captions"}],
                            }
                        ],
                    }
                ]
            }
        }
    }
    result = fetch_tasveer(
        START,
        END,
        fetch=_http(json.dumps(payload)),
        scraped_at=SCRAPED_AT,
    )
    assert result.restate_safe is True
    record = result.records[0]
    assert record.title_raw == "Primetime (USA, 2026)"
    assert record.attributes["source_film_id"] == "155992"
    assert record.source_showtime_id == "4003596"
    assert record.date_raw == "10/02/2026"
    assert record.time_raw == "7:00 PM"
    assert record.format_raw == "open caption"
    assert record.attributes["year_raw"] == 2026
    assert record.ticket_url_raw.endswith("/checkout/showing/primetime/4003596")
    assert record.source_film_url == "https://filmcenter.tasveer.org/movie/primetime"
    assert record.theater_name_raw == "Tasveer Film Center"


def test_tasveer_graphql_and_http_failures_are_not_empty_success():
    error = fetch_tasveer(
        START,
        END,
        fetch=_http(json.dumps({"errors": [{"message": "no site"}]})),
        scraped_at=SCRAPED_AT,
    )
    assert error.restate_safe is False
    assert error.contract["status"] == "request_failure"
    assert error.errors
    structural = fetch_tasveer(
        START,
        END,
        fetch=_http(json.dumps({"data": {"movies": {}}})),
        scraped_at=SCRAPED_AT,
    )
    assert structural.contract["status"] == "structural_failure"
    assert structural.restate_safe is False
    http_fail = fetch_tasveer(START, END, fetch=_http("nope", status=500), scraped_at=SCRAPED_AT)
    assert http_fail.contract["status"] == "request_failure"
    assert http_fail.records == []


def _anderson_modal(film_id: str, title: str, purchase: str, clock: str = "7pm") -> str:
    return f"""
    <div id="modal-buytickets-{film_id}" class="uk-modal uk-modal-buytickets">
      <h4>{title}</h4>
      <p class="uk-modal-runningtime">(109) Running time: 109 minutes</p>
      <div id="date_panel_{film_id}_10022026">
        <button onclick="window.open('https://ticketing.uswest.veezi.com/purchase/{purchase}?siteToken=public')">{clock}</button>
      </div>
    </div>
    """


def test_anderson_ocap_shares_identity_and_keeps_other_parentheticals():
    html = (
        '<div class="uk-modal-buytickets"></div>'
        + _anderson_modal("ST00001000", "Wildwood", "200")
        + _anderson_modal("ST00001001", "Wildwood (OCAP)", "201")
        + _anderson_modal("ST00001002", "The Godfather (Part II)", "202")
        + _anderson_modal("ST00001006", "Forgotten Island OCAP", "203")
    )
    result = fetch_anderson_school(START, END, fetch=_http(html), scraped_at=SCRAPED_AT)
    assert result.restate_safe is True
    by_id = {row.source_showtime_id: row for row in result.records}
    assert by_id["200"].title_raw == "Wildwood"
    assert "identity_title" not in (by_id["200"].attributes or {})
    assert by_id["201"].title_raw == "Wildwood (OCAP)"
    assert by_id["201"].attributes["identity_title"] == "Wildwood"
    assert by_id["201"].format_raw == "open caption"
    assert by_id["201"].attributes["source_film_id"] == "ST00001001"
    assert by_id["202"].title_raw == "The Godfather (Part II)"
    assert "identity_title" not in (by_id["202"].attributes or {})
    assert by_id["203"].attributes["identity_title"] == "Forgotten Island"
    assert by_id["200"].runtime_raw == "109"
    broken = fetch_anderson_school(
        START,
        END,
        fetch=_http("<html><body>maintenance</body></html>"),
        scraped_at=SCRAPED_AT,
    )
    assert broken.contract["status"] == "structural_failure"
    assert broken.restate_safe is False


def test_majestic_bay_public_veezi_ids_and_retro_label():
    html = """
    <h1>Majestic Bay Theatres</h1>
    <div id="sessionsByDateConent">
      <div class="film">
        <img class="poster" alt="Tremors" src="/Media/Poster?siteToken=public&amp;code=0000001704" />
        <h3 class="title">Tremors</h3>
        <ul class="session-times">
          <li>
            <a href="https://ticketing.useast.veezi.com/purchase/36198?siteToken=public"><time>7:30 PM</time></a>
            <span class="screen-attribute attribute-0000000009">Retro</span>
            <span class="screen-attribute few-tickets-left">SELLING FAST</span>
          </li>
        </ul>
      </div>
    </div>
    <script type="application/ld+json">
    [{"@type":"VisualArtsEvent","name":"Tremors","startDate":"2026-10-02T19:30:00-07:00","duration":"PT1H36M","url":"https://ticketing.useast.veezi.com/purchase/36198?siteToken=public"}]
    </script>
    """
    result = fetch_majestic_bay(START, END, fetch=_http(html), scraped_at=SCRAPED_AT)
    assert result.restate_safe is True
    record = result.records[0]
    assert record.theater_name_raw == "Majestic Bay Theatres"
    assert record.title_raw == "Tremors"
    assert record.attributes["source_film_id"] == "0000001704"
    assert record.source_showtime_id == "36198"
    assert record.format_raw == "Retro"
    assert "SELLING FAST" not in (record.format_raw or "")
    assert record.runtime_raw == "96"
    assert record.date_raw == "10/02/2026"
    empty = fetch_majestic_bay(
        START,
        END,
        fetch=_http(
            "<h1>Majestic Bay Theatres</h1><div id='sessionsByDateConent'></div><p>No shows currently scheduled</p>"
        ),
        scraped_at=SCRAPED_AT,
    )
    assert empty.contract["status"] == "valid_empty"
    assert empty.restate_safe is True
    assert empty.records == []
    structural = fetch_majestic_bay(
        START,
        END,
        fetch=_http("<h1>Majestic Bay Theatres</h1><p>welcome</p>"),
        scraped_at=SCRAPED_AT,
    )
    assert structural.contract["status"] == "structural_failure"


def _stg_event(event_id, title, excerpt, content, slug="event"):
    return {
        "id": event_id,
        "link": f"https://www.stgpresents.org/events/{slug}/",
        "title": {"rendered": title},
        "excerpt": {"rendered": excerpt},
        "content": {"rendered": content},
    }


def test_stg_qualifies_films_and_rejects_non_films():
    excerpt = (
        "<p>The Paramount Theatre<br />Monday, Oct. 5, 2026<br />7pm<br />"
        '<a href="https://www.ticketmaster.com/artist/999234?venueId=122980&amp;brand=paramountseattle">Get Tickets</a></p>'
    )
    events = [
        _stg_event(
            74288,
            "Silent Movie Mondays &#8211; Metropolis (1927)",
            excerpt,
            "<p>The film is shown. Organist: Tedde Gibson. Run time: 148 mins</p>",
            "silent-movie-mondays-metropolis",
        ),
        _stg_event(
            80001,
            "The General",
            excerpt,
            "<p>Feature film screened with live organ accompaniment. Run time: 78 mins</p>",
            "the-general",
        ),
        _stg_event(
            80002,
            "Songs from The Wizard of Oz",
            excerpt,
            "<p>The orchestra performs the score. There is no projection.</p>",
            "wizard-score",
        ),
        _stg_event(
            80003,
            "An Evening of Film",
            excerpt,
            "<p>Category: Film. An evening with the director.</p>",
            "evening-of-film",
        ),
        _stg_event(
            80004,
            "Silent Movie Mondays: The Godfather (Part II)",
            excerpt,
            "<p>Presented in Silent Movie Mondays.</p>",
            "godfather",
        ),
        _stg_event(80005, "Membership Night", "<p>Join the Seattle Theatre Group.</p>", "<p>No screening.</p>"),
    ]
    result = fetch_stg(START, END, fetch=_http(json.dumps(events)), scraped_at=SCRAPED_AT)
    assert result.restate_safe is True
    titles = {row.attributes.get("identity_title", row.title_raw) for row in result.records}
    assert titles == {"Metropolis", "The General", "The Godfather (Part II)"}
    metro = next(row for row in result.records if row.attributes.get("identity_title") == "Metropolis")
    assert metro.title_raw == "Silent Movie Mondays – Metropolis (1927)"
    assert metro.attributes["year_raw"] == 1927
    assert metro.attributes["source_film_id"] == "74288"
    assert metro.source_showtime_id == "74288"
    assert metro.theater_name_raw == "Paramount Theatre"
    assert metro.runtime_raw == "148"
    assert "ticketmaster.com" in metro.ticket_url_raw
    assert all("Wizard" not in row.title_raw for row in result.records)
    assert any(item["code"] == "ambiguous_film_event" for item in result.contract["rejected_observations"])
    blocked = fetch_stg(START, END, fetch=_http("nope", status=403), scraped_at=SCRAPED_AT)
    assert blocked.contract["status"] == "request_failure"
    assert blocked.restate_safe is False
    changed = fetch_stg(
        START,
        END,
        fetch=_http(json.dumps({"code": "rest_no_route"})),
        scraped_at=SCRAPED_AT,
    )
    assert changed.contract["status"] == "structural_failure"


def test_stg_date_ranges_and_venue_lines():
    excerpt = (
        "<p>DZ20: Like Father, Like Son<br />The Moore Theatre<br />"
        "Friday, Oct. 19 to 20, 2026<br />8pm<br />"
        '<a href="https://www.ticketmaster.com/event/1">Get Tickets</a></p>'
    )
    events = [
        _stg_event(
            74971,
            "The Blair Witch Project: Film Screening and QA",
            excerpt,
            "<p>A screening of the original movie on the big screen.</p>",
            "blair",
        )
    ]
    result = fetch_stg(START, END, fetch=_http(json.dumps(events)), scraped_at=SCRAPED_AT)
    assert result.restate_safe is True
    assert len(result.records) == 2
    assert {row.date_raw for row in result.records} == {"10/19/2026", "10/20/2026"}
    assert {row.attributes["theater_id"] for row in result.records} == {"the-moore-theatre"}
    assert {row.source_showtime_id for row in result.records} == {"74971:2026-10-19", "74971:2026-10-20"}


def test_ambiguous_schedule_does_not_block_a_parsed_film():
    film = (
        "<p>The Paramount Theatre<br />Monday, Oct. 5, 2026<br />7pm</p>"
    )
    ambiguous = (
        "<p>The Paramount Theatre<br />Thursday, Jan. 7 &amp; 8, 2027<br />8pm</p>"
    )
    events = [
        _stg_event(
            74288,
            "Silent Movie Mondays &#8211; Metropolis (1927)",
            film,
            "<p>The film is shown. Run time: 148 mins</p>",
        ),
        _stg_event(
            74589,
            "Lord Huron",
            ambiguous,
            "<p>An evening of songs.</p>",
        ),
        _stg_event(
            6398,
            "Free Neptune Tour",
            "<p>The Neptune Theatre<br />Tours depart at 8pm</p>",
            "<p>A building tour.</p>",
        ),
    ]
    result = fetch_stg(START, END, fetch=_http(json.dumps(events)), scraped_at=SCRAPED_AT)
    assert result.restate_safe is True
    assert [row.attributes.get("identity_title") for row in result.records] == ["Metropolis"]
    excerpt = "<p>The Neptune Theatre<br />Monday, Oct. 5, 2026<br />7pm</p>"
    events = [
        _stg_event(
            900,
            "Silent Movie Mondays: Nosferatu (1922)",
            excerpt,
            "<p>The film is shown.</p>",
        )
    ]
    result = fetch_stg(START, END, fetch=_http(json.dumps(events)), scraped_at=SCRAPED_AT)
    assert result.restate_safe is False
    assert result.contract["status"] == "partial_failure"
    assert result.records == []
    assert any(item["code"] == "unmapped_venue" for item in result.contract["rejected_observations"])


def test_processor_emits_all_four_sources(tmp_path):
    tasveer = fetch_tasveer(
        START,
        END,
        fetch=_http(
            json.dumps(
                {
                    "data": {
                        "movies": {
                            "data": [
                                {
                                    "id": "1",
                                    "name": "Ha-Chan Shake Your Booty",
                                    "urlSlug": "ha-chan",
                                    "duration": 100,
                                    "showings": [
                                        {
                                            "id": "11",
                                            "time": "2026-10-03T02:00:00Z",
                                            "showingBadges": [],
                                        }
                                    ],
                                }
                            ]
                        }
                    }
                }
            )
        ),
        scraped_at=SCRAPED_AT,
    )
    anderson = fetch_anderson_school(
        START,
        END,
        fetch=_http(
            '<div class="uk-modal-buytickets"></div>'
            + _anderson_modal("ST00001000", "Wildwood", "200", "4pm")
            + _anderson_modal("ST00001001", "Wildwood (OCAP)", "201", "7pm")
        ),
        scraped_at=SCRAPED_AT,
    )
    majestic = fetch_majestic_bay(
        START,
        END,
        fetch=_http(
            """
            <h1>Majestic Bay Theatres</h1>
            <div id="sessionsByDateConent">
              <div class="film">
                <img class="poster" alt="Tremors" src="/Media/Poster?code=0000001704" />
                <ul><li><a href="https://ticketing.useast.veezi.com/purchase/36198?siteToken=public"><time>7:30 PM</time></a>
                <span class="screen-attribute">Retro</span></li></ul>
              </div>
            </div>
            <script type="application/ld+json">
            [{"@type":"VisualArtsEvent","name":"Tremors","startDate":"2026-10-02T19:30:00-07:00","duration":"PT1H36M","url":"https://ticketing.useast.veezi.com/purchase/36198?siteToken=public"}]
            </script>
            """
        ),
        scraped_at=SCRAPED_AT,
    )
    excerpt = "<p>The Paramount Theatre<br />Monday, Oct. 5, 2026<br />7pm</p>"
    stg = fetch_stg(
        START,
        END,
        fetch=_http(
            json.dumps(
                [
                    _stg_event(
                        74288,
                        "Silent Movie Mondays &#8211; Metropolis (1927)",
                        excerpt,
                        "<p>The film is shown. Run time: 148 mins</p>",
                    ),
                    _stg_event(
                        80002,
                        "Songs from The Wizard of Oz",
                        excerpt,
                        "<p>The orchestra performs the score.</p>",
                    ),
                ]
            )
        ),
        scraped_at=SCRAPED_AT,
    )
    assert tasveer.restate_safe and anderson.restate_safe and majestic.restate_safe and stg.restate_safe
    logs = tmp_path / "logs"
    for source, result in (
        ("tasveer", tasveer),
        ("anderson_school", anderson),
        ("stg", stg),
        ("majestic_bay", majestic),
    ):
        write_option_c_scrape_log(daily_log_path(RUN_DATE, source, logs_dir=logs), result.log_envelope)
    history: list[dict] = []
    process_indie_csv_data(
        str(tmp_path / "missing.csv"),
        history,
        [],
        RUN_DATE,
        load_theater_index(),
        today_date=START,
        run_date_iso=RUN_DATE,
        logs_dir=logs,
    )
    registry = json.loads(Path("data/theaters.json").read_text(encoding="utf-8"))
    artifact = build_showtimes_current(history, registry=registry, reference_date=START)
    showtimes = artifact["showtimes"]
    by_source = {}
    for row in showtimes:
        by_source.setdefault(row["source"], []).append(row)
    assert {row["theater_id"] for row in by_source["tasveer"]} == {"tasveer-film-center"}
    assert {row["theater_id"] for row in by_source["anderson_school"]} == {"anderson-school-theater"}
    assert {row["theater_id"] for row in by_source["stg"]} == {"paramount-theatre"}
    assert {row["theater_id"] for row in by_source["majestic_bay"]} == {"majestic-bay"}
    films = {film["title"] for film in artifact["films"]}
    assert "Wildwood" in films
    assert "Wildwood (OCAP)" not in films
    assert "Metropolis" in films
    assert not any("Silent Movie Mondays" in title for title in films)
    assert not any("Wizard" in title for title in films)
    wildwood_keys = {
        row["showtime_film_key"] for row in showtimes if row["source"] == "anderson_school"
    }
    assert len(wildwood_keys) == 1


def test_failed_tasveer_log_does_not_suppress_anderson(tmp_path):
    from daily_processor import normalize_history_row

    failed = fetch_tasveer(START, END, fetch=_http("nope", status=500), scraped_at=SCRAPED_AT)
    anderson = fetch_anderson_school(
        START,
        END,
        fetch=_http(
            '<div class="uk-modal-buytickets"></div>' + _anderson_modal("ST00001000", "Wildwood", "200")
        ),
        scraped_at=SCRAPED_AT,
    )
    assert failed.restate_safe is False
    assert anderson.restate_safe is True
    logs = tmp_path / "logs"
    write_option_c_scrape_log(daily_log_path(RUN_DATE, "tasveer", logs_dir=logs), failed.log_envelope)
    write_option_c_scrape_log(
        daily_log_path(RUN_DATE, "anderson_school", logs_dir=logs),
        anderson.log_envelope,
    )
    kept = normalize_history_row(
        {
            "Date": "10/02/2026",
            "Time": "7:00 PM",
            "Theater": "Tasveer Film Center",
            "Film": "Already Listed",
            "Runtime": "90",
            "source": "tasveer",
            "first_seen_date": RUN_DATE,
            "last_updated": RUN_DATE,
        }
    )
    history = [kept]
    process_indie_csv_data(
        str(tmp_path / "missing.csv"),
        history,
        [],
        RUN_DATE,
        load_theater_index(),
        today_date=START,
        run_date_iso=RUN_DATE,
        logs_dir=logs,
    )
    assert any(row["Film"] == "Already Listed" and row["source"] == "tasveer" for row in history)
    assert any(row["Film"] == "Wildwood" and row["source"] == "anderson_school" for row in history)


def test_one_new_source_failure_does_not_suppress_the_others(monkeypatch):
    from reel_seattle.adapters.base import FetchContext, FetchResult
    from reel_seattle.adapters.option_c import OptionCAdapterResult
    from webscrapetheaters import collect_indie_showtimes

    def empty_fetch(*args, **kwargs):
        return FetchResult(records=[], stats={}, warnings=[], errors=[])

    def option_stub(*args, **kwargs):
        return OptionCAdapterResult(
            records=[],
            stats={"restate_safe": False},
            warnings=[],
            errors=["stub"],
            contract={"status": "request_failure"},
            mapping={"restate_safe": False},
            log_envelope={},
            restate_safe=False,
        )

    monkeypatch.setattr("webscrapetheaters.fetch_siff_showtimes", empty_fetch)
    monkeypatch.setattr("webscrapetheaters.fetch_beacon_showtimes", empty_fetch)
    monkeypatch.setattr("webscrapetheaters.fetch_nwff", option_stub)
    monkeypatch.setattr("webscrapetheaters.fetch_central_cinema", option_stub)
    monkeypatch.setattr("webscrapetheaters.fetch_grand_illusion", option_stub)

    def boom(start, end, **kwargs):
        raise RuntimeError("tasveer down")

    def ok(start, end, **kwargs):
        return option_stub()

    monkeypatch.setattr("webscrapetheaters.fetch_tasveer", boom)
    monkeypatch.setattr("webscrapetheaters.fetch_anderson_school", ok)
    monkeypatch.setattr("webscrapetheaters.fetch_stg", ok)
    monkeypatch.setattr("webscrapetheaters.fetch_majestic_bay", ok)
    context = FetchContext(
        run_date=START,
        window_start=START,
        window_end=END,
        theaters_registry={},
    )
    _siff, _beacon, _nwff, _central, _gi, added = collect_indie_showtimes(context)
    assert added["tasveer"] is None
    assert added["anderson_school"] is not None
    assert added["stg"] is not None
    assert added["majestic_bay"] is not None
