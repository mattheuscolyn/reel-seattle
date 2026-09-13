"""HTML fixtures for collection-page discovery tests."""

SIFF_INDEX = """
<html><body>
  <h2>Film Series</h2>
  <a href="/programs-and-events/nouvelles-femmes">Nouvelles Femmes</a>
  <a href="/programs-and-events/7-movie-tuesdays">$7 Movie Tuesdays</a>
  <h2>Cinema Programs</h2>
  <a href="/programs-and-events/movie-club">Movie Club</a>
</body></html>
"""

SIFF_NOUVELLES = """
<html><head>
  <meta name="description" content="A SIFF Cinema series of French New Wave films.">
  <meta property="og:image" content="https://www.siff.net/images/nouvelles.jpg">
</head><body>
  <h1>Nouvelles Femmes</h1>
  <p>September 16 – November 17, 2026</p>
  <a href="/programs-and-events/nouvelles-femmes/breathless">Nouvelles Femmes: Breathless</a>
  <a href="/programs-and-events/nouvelles-femmes/jules-and-jim">Nouvelles Femmes: Jules and Jim (35mm)</a>
</body></html>
"""

SIFF_MOVIE_CLUB = """
<html><body>
  <h1>Movie Club</h1>
  <p>No member film links on this fixture page.</p>
</body></html>
"""

BEACON_SERIES_INDEX = """
<html><body>
  <a href="/series/time-as-a-symptom">Time as a Symptom</a>
</body></html>
"""

BEACON_PROGRAMS_INDEX = """
<html><body>
  <a href="/programs/shadowland-after-hours">Shadowland After Hours</a>
</body></html>
"""

BEACON_SERIES_PAGE = """
<html><head>
  <meta name="description" content="Films that treat time as a wound and a method.">
</head><body>
  <h1>Time as a Symptom</h1>
  <h2>Films in this Series</h2>
  <a href="/calendar/movie/rebels-of-the-neon-god">Rebels of the Neon God</a>
</body></html>
"""

BEACON_PROGRAM_PAGE = """
<html><body>
  <h1>Shadowland After Hours</h1>
  <h2>Films in this Program</h2>
  <a href="/calendar/movie/invasion">Invasion</a>
</body></html>
"""

NWFF_SERIES_INDEX = """
<html><body>
  <a href="/series/sfcs-at-10/">SFCS at 10</a>
  <a href="/series/disabled-list/">Disabled List</a>
</body></html>
"""

NWFF_SERIES_PAGE = """
<html><head>
  <meta name="description" content="A decade of Seattle Film Critics Society favorites.">
</head><body>
  <h1>SFCS at 10: A Decade of Favorites</h1>
  <a href="/films/sfcs-10-mariners/">SFCS at 10: The History of The Seattle Mariners</a>
  <a href="/films/sfcs-10-first-cow/">SFCS at 10: First Cow</a>
</body></html>
"""

NWFF_EMPTY_SERIES = """
<html><body>
  <h1>Disabled List</h1>
  <p>A standup series with no film links.</p>
</body></html>
"""

NWFF_FILM_PAGE = """
<html><body>
  <h1>SFCS at 10: The History of The Seattle Mariners</h1>
  <a href="/series/sfcs-at-10/">Series - SFCS at 10</a>
</body></html>
"""

NWFF_FESTIVALS_INDEX = """
<html><body>
  <h1>Festivals</h1>
  <h2>Current</h2>
  <a href="/festivals/local-sightings-film-festival-pacific-nw/">Local Sightings Film Festival</a>
  <a href="/festivals/free-forum-2026/">Free Forum 2026</a>
  <h2>Past</h2>
  <a href="/festivals/local-sightings-film-festival-2025/">Local Sightings Film Festival 2025</a>
  <a href="/festivals/bydesign-festival-2023-hybrid/">ByDesign 2023</a>
</body></html>
"""

NWFF_LOCAL_SIGHTINGS_FESTIVAL = """
<html><head>
  <meta name="description" content="29th Annual Local Sightings Film Festival.">
  <meta property="og:image" content="https://nwfilmforum.org/images/lsff.jpg">
</head><body>
  <h1>Local Sightings Film Festival</h1>
  <h2>29th Annual Local Sightings Film Festival</h2>
  <h2>September 18-27, 2026</h2>
  <p>Passes on sale for 2025 alumni and 2026 attendees.</p>
  <h2>Full Festival Catalogue</h2>
  <a href="http://bit.ly/locosight2026shorts">Short Film Programs</a>
  <a href="http://bit.ly/locosight2026features">Feature Films</a>
  <a href="https://www.instagram.com/zackconk/">Instagram noise</a>
  <a href="http://bit.ly/lsff2026pass">Get Festival Pass</a>
  <h2>Past Festivals</h2>
  <a href="/festivals/local-sightings-film-festival-2025/">Local Sightings Film Festival 2025</a>
</body></html>
"""

NWFF_LOCAL_SIGHTINGS_SHORT_PROGRAMS = """
<html><body>
  <h1>Local Sightings Film Festival 2026: Short Film Programs</h1>
  <h2>Short Film Programs</h2>
  <a href="/films/local-sightings-2026-like-a-local/">Sat Sep 19 7.30pm Local Sightings 2026 – Like a Local (Shorts) film</a>
  <a href="/films/local-sightings-2026-ways-of-seeing/">Sun Sep 20 7.30pm Local Sightings 2026 – Ways of Seeing (Shorts) film</a>
</body></html>
"""

NWFF_LOCAL_SIGHTINGS_FEATURES = """
<html><body>
  <h1>Local Sightings Film Festival 2026: Feature Films</h1>
  <a href="/films/local-sightings-2026-sugarfly/">Sat Sep 19 4.00pm Local Sightings 2026 – Sugarfly film</a>
</body></html>
"""

NWFF_FREE_FORUM = """
<html><body>
  <h1>Free Forum 2026</h1>
  <p>A festival landing page with no member film links.</p>
</body></html>
"""


def fixture_pages() -> dict[str, str]:
    return {
        "https://www.siff.net/programs-and-events": SIFF_INDEX,
        "https://www.siff.net/programs-and-events/nouvelles-femmes": SIFF_NOUVELLES,
        "https://www.siff.net/programs-and-events/movie-club": SIFF_MOVIE_CLUB,
        "https://thebeacon.film/series": BEACON_SERIES_INDEX,
        "https://thebeacon.film/programs": BEACON_PROGRAMS_INDEX,
        "https://thebeacon.film/series/time-as-a-symptom": BEACON_SERIES_PAGE,
        "https://thebeacon.film/programs/shadowland-after-hours": BEACON_PROGRAM_PAGE,
        "https://nwfilmforum.org/series/": NWFF_SERIES_INDEX,
        "https://nwfilmforum.org/series/sfcs-at-10/": NWFF_SERIES_PAGE,
        "https://nwfilmforum.org/series/disabled-list/": NWFF_EMPTY_SERIES,
        "https://nwfilmforum.org/films/sfcs-10-mariners/": NWFF_FILM_PAGE,
        "https://nwfilmforum.org/festivals/": NWFF_FESTIVALS_INDEX,
        "https://nwfilmforum.org/festivals/local-sightings-film-festival-pacific-nw/": NWFF_LOCAL_SIGHTINGS_FESTIVAL,
        "https://nwfilmforum.org/festivals/local-sightings-film-festival-2026-short-film-programs/": NWFF_LOCAL_SIGHTINGS_SHORT_PROGRAMS,
        "https://nwfilmforum.org/festivals/local-sightings-film-festival-2026-feature-films/": NWFF_LOCAL_SIGHTINGS_FEATURES,
        "https://nwfilmforum.org/festivals/free-forum-2026/": NWFF_FREE_FORUM,
    }


def fixture_fetch(url: str) -> str | None:
    pages = fixture_pages()
    if url in pages:
        return pages[url]
    # Resolve Local Sightings shortlink catalogues used by the festival page.
    if url in {
        "http://bit.ly/locosight2026shorts",
        "https://bit.ly/locosight2026shorts",
    }:
        return pages[
            "https://nwfilmforum.org/festivals/local-sightings-film-festival-2026-short-film-programs/"
        ]
    if url in {
        "http://bit.ly/locosight2026features",
        "https://bit.ly/locosight2026features",
    }:
        return pages[
            "https://nwfilmforum.org/festivals/local-sightings-film-festival-2026-feature-films/"
        ]
    return None


def fixture_fetch_resolved(url: str) -> tuple[str, str] | None:
    if url in {
        "http://bit.ly/locosight2026shorts",
        "https://bit.ly/locosight2026shorts",
    }:
        final = "https://nwfilmforum.org/festivals/local-sightings-film-festival-2026-short-film-programs/"
        return final, fixture_pages()[final]
    if url in {
        "http://bit.ly/locosight2026features",
        "https://bit.ly/locosight2026features",
    }:
        final = "https://nwfilmforum.org/festivals/local-sightings-film-festival-2026-feature-films/"
        return final, fixture_pages()[final]
    html = fixture_fetch(url)
    if html is None:
        return None
    return url, html

