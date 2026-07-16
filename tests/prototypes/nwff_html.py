"""Minimal NWFF HTML fixture builders for prototype tests."""

from __future__ import annotations


def calendar_shell(*, heading: str, body: str) -> str:
    return f"""<!DOCTYPE html>
<html><head><title>Calendar — Northwest Film Forum</title></head>
<body>
<div class="calendar">
  <h1 class="calendar__heading">{heading}</h1>
  <div class="calendar__grid">
{body}
  </div>
</div>
</body></html>
"""


def film_item(
    *,
    title: str,
    href: str,
    start_iso: str,
    location: str = "Northwest Film Forum",
    ticket_url: str | None = None,
    css_extra: str = "calendar__item--film",
) -> str:
    offer = ""
    if ticket_url:
        offer = f"""
    <div itemprop="offers" itemscope itemtype="https://schema.org/Offer">
      <meta itemprop="url" content="{ticket_url}" />
    </div>"""
    return f"""
  <div class="calendar__item {css_extra}" data-calendar-item itemscope itemtype="https://schema.org/ScreeningEvent">
    <meta itemprop="name" content="{title}" />
    <meta itemprop="startDate" content="{start_iso}" />
    <div itemprop="location" itemscope itemtype="https://schema.org/Place">
      <meta itemprop="name" content="{location}" />
    </div>
    <a class="calendar__item__link" href="{href}">{title}</a>{offer}
  </div>
"""


def workshop_item(
    *,
    title: str,
    href: str,
    start_iso: str,
) -> str:
    return f"""
  <div class="calendar__item calendar__item--workshop" data-calendar-item itemscope itemtype="https://schema.org/Event">
    <meta itemprop="name" content="{title}" />
    <meta itemprop="startDate" content="{start_iso}" />
    <a class="calendar__item__link" href="{href}">{title}</a>
  </div>
"""


def program_page(
    *,
    title: str,
    director: str | None = "Ada Director",
    country: str | None = "USA",
    year: str | None = "2024",
    duration: str | None = "PT90M",
    description_html: str | None = "<p>First paragraph.</p><p>Second&nbsp;paragraph with <em>emphasis</em>.</p>",
    schedule_times: list[str] | None = None,
    schedule_prose: str | None = None,
    ticket_url: str | None = "https://nwfilmforum.eventive.org/tickets/example",
    image_url: str | None = "https://nwfilmforum.org/images/example.jpg",
) -> str:
    meta = []
    if director:
        meta.append(f'<meta itemprop="director" content="{director}" />')
    if country:
        meta.append(f'<meta itemprop="country" content="{country}" />')
    if year:
        meta.append(f'<meta itemprop="copyrightYear" content="{year}" />')
    if duration:
        meta.append(f'<meta itemprop="duration" content="{duration}" />')
    if image_url:
        meta.append(f'<meta property="og:image" content="{image_url}" />')
    times = ""
    for value in schedule_times or []:
        times += f'<time datetime="{value}">{value}</time>\n'
    prose = f"<p>{schedule_prose}</p>" if schedule_prose else ""
    ticket = (
        f'<a class="button" href="{ticket_url}">Tickets</a>' if ticket_url else ""
    )
    about = f'<div itemprop="about">{description_html or ""}</div>'
    return f"""<!DOCTYPE html>
<html><head><title>{title} - Northwest Film Forum</title>
{chr(10).join(meta)}
</head>
<body>
<main>
  <h1>{title}</h1>
  {about}
  <div class="showtimes">{times}{prose}</div>
  {ticket}
</main>
</body></html>
"""
