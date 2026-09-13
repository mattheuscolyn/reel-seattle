"""HTML fixtures for NWFF shorts-program discovery tests."""

LIKE_A_LOCAL = """
<html>
<head>
  <title>Local Sightings 2026 – Like a Local (Shorts) - Northwest Film Forum</title>
  <meta name="description" content="Shorts by Washington filmmakers.">
  <meta property="og:image" content="https://nwfilmforum.org/images/like-a-local.jpg">
  <meta itemprop="duration" content="PT68M">
</head>
<body>
  <main>
    <h1>Local Sightings 2026 – Like a Local (Shorts)</h1>
    <div class="module-list__item module-list__item--headline">
      <h2>About</h2>
    </div>
    <div class="module-list__item module-list__item--headline">
      <div class="large-title"><h2>Films in this program:</h2></div>
    </div>
    <div class="module-list__item module-list__item--copy-section">
      <h3 class="font-size-medium">Aurora Ave: Sunrise to Sunset</h3>
      <div class="media media--copy-section">
        <div class="background-image" component-graceful-image-load="https://nwfilmforum.org/images/aurora.png"></div>
      </div>
      <div class="text-editor">
        <p>(Dina Michelle Hercules Cruz, Seattle, 2026, 17min, in English)</p>
        <p>This documentary captures Seattle's infamous Aurora Avenue from morning to night.</p>
      </div>
    </div>
    <div class="module-list__item module-list__item--copy-section">
      <h3 class="font-size-medium">Dick's-A-Thon</h3>
      <div class="text-editor">
        <p>(Dylan Young, Seattle, 2025, 18 min, in English)</p>
        <p>26 Miles, 5 Meals, 1 Wild Tradition.</p>
      </div>
    </div>
    <div class="module-list__item module-list__item--copy-section">
      <h3 class="font-size-medium">Roll Modelz</h3>
      <div class="text-editor">
        <p>(Yahir Tzec-Carasco, Oliver Rodriguez Dickson, Seattle, 2025, 12 min, in English)</p>
        <p>A lowrider club in rural Washington.</p>
      </div>
    </div>
    <div class="module-list__item module-list__item--copy-section">
      <h3 class="font-size-medium">Broken Meta Short</h3>
      <div class="text-editor">
        <p>No parentheses metadata here, just a freeform description that should survive.</p>
      </div>
    </div>
    <div class="module-list__item module-list__item--headline">
      <h2>Festival Directory</h2>
    </div>
  </main>
</body>
</html>
"""

WAYS_OF_SEEING = """
<html>
<head><title>Local Sightings 2026 – Ways of Seeing (Shorts)</title></head>
<body>
  <h1>Local Sightings 2026 – Ways of Seeing (Shorts)</h1>
  <div class="module-list__item module-list__item--headline">
    <h2>Films in this program:</h2>
  </div>
  <div class="module-list__item module-list__item--copy-section">
    <h3>Dick's-A-Thon</h3>
    <div class="text-editor">
      <p>(Dylan Young, Seattle, 2025, 18 min, in English)</p>
      <p>Same short with strong metadata for cross-program merge.</p>
    </div>
  </div>
  <div class="module-list__item module-list__item--copy-section">
    <h3>Other Vision</h3>
    <div class="text-editor">
      <p>(Ada Director, Tacoma, 2024, 9 min, in English)</p>
      <p>Unique to this program.</p>
    </div>
  </div>
  <div class="module-list__item module-list__item--headline">
    <h2>Festival Directory</h2>
  </div>
</body>
</html>
"""

SAME_TITLE_DIFFERENT_WORK = """
<html>
<head><title>Local Sightings 2026 – Origin Story (Shorts)</title></head>
<body>
  <h1>Local Sightings 2026 – Origin Story (Shorts)</h1>
  <div class="module-list__item module-list__item--headline">
    <h2>Films in this program:</h2>
  </div>
  <div class="module-list__item module-list__item--copy-section">
    <h3>Dick's-A-Thon</h3>
    <div class="text-editor">
      <p>(Other Person, Portland, 2019, 7 min, in English)</p>
      <p>Same title but different year/director/runtime — must not merge.</p>
    </div>
  </div>
  <div class="module-list__item module-list__item--headline">
    <h2>Festival Directory</h2>
  </div>
</body>
</html>
"""

NORMAL_FEATURE = """
<html>
<head><title>Local Sightings 2026 – Sugarfly</title>
<meta itemprop="duration" content="PT88M">
</head>
<body>
  <h1>Local Sightings 2026 – Sugarfly</h1>
  <div class="module-list__item module-list__item--headline"><h2>About</h2></div>
  <div class="text-editor"><p>A feature film with no Films in this program section.</p></div>
</body>
</html>
"""


def fixture_pages() -> dict[str, str]:
    return {
        "https://nwfilmforum.org/films/local-sightings-2026-like-a-local/": LIKE_A_LOCAL,
        "https://nwfilmforum.org/films/local-sightings-2026-ways-of-seeing/": WAYS_OF_SEEING,
        "https://nwfilmforum.org/films/local-sightings-2026-origin-story/": SAME_TITLE_DIFFERENT_WORK,
        "https://nwfilmforum.org/films/local-sightings-2026-sugarfly/": NORMAL_FEATURE,
    }


def fixture_fetch(url: str) -> str | None:
    return fixture_pages().get(url)
