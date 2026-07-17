"""Minimal HTML builders for Central Cinema prototype tests."""

from __future__ import annotations


def calendar_shell(*, body: str, title: str = "Central Cinema | Calendar") -> str:
    return f"""<!DOCTYPE html>
<html><head><title>{title}</title></head>
<body>
<div id="q-app">
  <h1>Calendar</h1>
  <h1>Explore Movies</h1>
  {body}
</div>
</body></html>
"""


def movie_link(title: str, href: str) -> str:
    return f'<p><a href="{href}">{title}</a></p>'


def movie_page(
    *,
    name: str,
    description_html: str = "A film.",
    duration: str = "PT2H0M",
    date_created: str = "2026-07-10",
    genre: str = "Action",
    content_rating: str = "R",
    country: str = "US",
    language: str = "en",
    language_prop: str = "originalLanguage",
    image: str = "https://example.com/poster.jpg",
    actors: list[str] | None = None,
    directors: list[str] | None = None,
    writers: list[str] | None = None,
    producers: list[str] | None = None,
    copyright_year: str | None = None,
    checkouts: list[tuple[str, str]] | None = None,
    include_schema: bool = True,
) -> str:
    actors = actors or []
    directors = directors or []
    writers = writers or []
    producers = producers or []
    checkouts = checkouts or []

    def person(prop: str, person_name: str) -> str:
        return (
            f'<div itemprop="{prop}" itemscope itemtype="https://schema.org/Person">'
            f'<span itemprop="name">{person_name}</span></div>'
        )

    people = "".join(person("actor", n) for n in actors)
    people += "".join(person("director", n) for n in directors)
    people += "".join(person("author", n) for n in writers)
    people += "".join(person("producer", n) for n in producers)
    copyright = (
        f'<meta itemprop="copyrightYear" content="{copyright_year}">' if copyright_year else ""
    )
    checkout_html = "".join(
        f'<p><a href="{href}">{label}</a></p>' for label, href in checkouts
    )
    if include_schema:
        body = f"""
<div itemscope itemtype="https://schema.org/Movie">
  <h1 itemprop="name">{name}</h1>
  <meta itemprop="dateCreated" content="{date_created}">
  <meta itemprop="duration" content="{duration}">
  <meta itemprop="genre" content="{genre}">
  <meta itemprop="contentRating" content="{content_rating}">
  <meta itemprop="countryOfOrigin" content="{country}">
  <meta itemprop="{language_prop}" content="{language}">
  <meta itemprop="image" content="{image}">
  {copyright}
  <div itemprop="description">{description_html}</div>
  {people}
</div>
{checkout_html}
"""
    else:
        body = f"<h1>{name}</h1>{checkout_html}"
    return f"""<!DOCTYPE html>
<html><head><title>Central Cinema | {name}</title></head>
<body>{body}</body></html>
"""
