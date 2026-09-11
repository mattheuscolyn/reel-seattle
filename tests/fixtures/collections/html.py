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
    }


def fixture_fetch(url: str) -> str | None:
    return fixture_pages().get(url)
