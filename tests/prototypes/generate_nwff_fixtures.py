"""Generate NWFF adapter fixtures under tests/fixtures/adapters/nwff/."""

from __future__ import annotations

import json
from pathlib import Path

from nwff_html import calendar_shell, film_item, program_page, workshop_item

ROOT = Path(__file__).resolve().parents[1] / "fixtures" / "adapters" / "nwff"


def write(name: str, text: str) -> None:
    (ROOT / name).write_text(text, encoding="utf-8")


def main() -> None:
    ROOT.mkdir(parents=True, exist_ok=True)

    week1 = calendar_shell(
        heading="Jul 14 - 20",
        body="".join(
            [
                film_item(
                    title="Staff Selects - ASCO: Without Permission",
                    href="/films/asco-without-permission/",
                    start_iso="2026-07-18T15:30:00",
                    ticket_url="https://nwfilmforum.eventive.org/tickets/asco-1530",
                ),
                film_item(
                    title="Staff Selects - ASCO: Without Permission",
                    href="/films/asco-without-permission/",
                    start_iso="2026-07-18T17:30:00",
                    ticket_url="https://nwfilmforum.eventive.org/tickets/asco-1730",
                ),
                film_item(
                    title="Staff Selects - ASCO: Without Permission",
                    href="/films/asco-without-permission/",
                    start_iso="2026-07-18T19:30:00",
                ),
                film_item(
                    title="Local Shorts Program",
                    href="/films/local-shorts-program/",
                    start_iso="2026-07-19T19:00:00",
                ),
                workshop_item(
                    title="Screenwriting Workshop",
                    href="/education/workshops/screenwriting/",
                    start_iso="2026-07-20T10:00:00",
                ),
            ]
        ),
    )
    week2 = calendar_shell(
        heading="Jul 21 - 27",
        body="".join(
            [
                # Overlap duplicate of week1 occurrence (should dedupe).
                film_item(
                    title="Staff Selects - ASCO: Without Permission",
                    href="https://nwfilmforum.org/films/asco-without-permission/",
                    start_iso="2026-07-18T19:30:00",
                ),
                film_item(
                    title="Special Presentation: Night Film",
                    href="/films/night-film/",
                    start_iso="2026-07-22T20:00:00",
                    ticket_url="https://nwfilmforum.eventive.org/tickets/night",
                ),
                film_item(
                    title="Offsite Screening",
                    href="/films/offsite-screening/",
                    start_iso="2026-07-23T19:00:00",
                    location="Central Library",
                ),
            ]
        ),
    )
    empty_week = calendar_shell(heading="Jul 28 - Aug 3", body="")
    bad_structure = "<html><body><p>Not a calendar</p></body></html>"
    dec_week = calendar_shell(
        heading="Dec 29 - 4",
        body=film_item(
            title="Year-End Feature",
            href="/films/year-end-feature/",
            start_iso="2026-12-31T19:00:00",
        ),
    )
    jan_week = calendar_shell(
        heading="Jan 5 - 11",
        body=film_item(
            title="Year-End Feature",
            href="/films/year-end-feature/",
            start_iso="2027-01-06T19:00:00",
        ),
    )
    collision_week = calendar_shell(
        heading="Jul 14 - 20",
        body="".join(
            [
                film_item(
                    title="Collision Film",
                    href="/films/collision-film/",
                    start_iso="2026-07-18T19:00:00",
                    ticket_url="https://nwfilmforum.eventive.org/tickets/a",
                ),
                film_item(
                    title="Collision Film",
                    href="/films/collision-film/",
                    start_iso="2026-07-18T19:00:01",
                    ticket_url="https://nwfilmforum.eventive.org/tickets/b",
                ),
            ]
        ),
    )
    malformed_week = calendar_shell(
        heading="Jul 14 - 20",
        body=film_item(
            title="Broken Link Film",
            href="/events/not-a-film/",
            start_iso="2026-07-18T19:00:00",
            css_extra="calendar__item--film",
        ),
    )

    write("calendar_2026-07-14.html", week1)
    write("calendar_2026-07-21.html", week2)
    write("calendar_2026-07-28.html", empty_week)
    write("calendar_bad_structure.html", bad_structure)
    write("calendar_2026-12-29.html", dec_week)
    write("calendar_2027-01-05.html", jan_week)
    write("calendar_collision.html", collision_week)
    write("calendar_malformed.html", malformed_week)

    write(
        "film_asco-without-permission.html",
        program_page(
            title="ASCO: Without Permission",
            schedule_times=[
                "2026-07-18T15:30:00",
                "2026-07-18T17:30:00",
                "2026-07-18T19:30:00",
            ],
            description_html="<p>Line one.</p><p>Line&nbsp;two<br/>continues.</p>",
        ),
    )
    write(
        "film_asco_mismatch.html",
        program_page(
            title="ASCO: Without Permission",
            schedule_times=[
                "2026-07-18T15:30:00",
                "2026-07-18T17:30:00",
                "2026-07-18T21:00:00",  # detail-only extra
            ],
        ),
    )
    write(
        "film_asco_missing_schedule.html",
        program_page(title="ASCO: Without Permission", schedule_times=[]),
    )
    write(
        "film_local-shorts-program.html",
        program_page(
            title="Local Shorts Program",
            schedule_times=["2026-07-19T19:00:00"],
            ticket_url=None,
        ),
    )
    write(
        "film_night-film.html",
        program_page(
            title="Special Presentation: Night Film",
            schedule_times=["2026-07-22T20:00:00"],
        ),
    )
    write(
        "film_offsite-screening.html",
        program_page(title="Offsite Screening", schedule_times=["2026-07-23T19:00:00"]),
    )
    write(
        "film_year-end-feature.html",
        program_page(
            title="Year-End Feature",
            schedule_times=["2026-12-31T19:00:00", "2027-01-06T19:00:00"],
            year="2026",
        ),
    )
    write(
        "film_collision-film.html",
        program_page(title="Collision Film", schedule_times=["2026-07-18T19:00:00"]),
    )

    manifest = {
        "https://nwfilmforum.org/calendar/?start=2026-07-14": "calendar_2026-07-14.html",
        "https://nwfilmforum.org/calendar/?start=2026-07-21": "calendar_2026-07-21.html",
        "https://nwfilmforum.org/calendar/?start=2026-07-28": "calendar_2026-07-28.html",
        "https://nwfilmforum.org/films/asco-without-permission/": "film_asco-without-permission.html",
        "https://nwfilmforum.org/films/local-shorts-program/": "film_local-shorts-program.html",
        "https://nwfilmforum.org/films/night-film/": "film_night-film.html",
        "https://nwfilmforum.org/films/offsite-screening/": "film_offsite-screening.html",
    }
    (ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote fixtures to {ROOT}")


if __name__ == "__main__":
    main()
