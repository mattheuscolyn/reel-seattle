/**
 * Capture Personal Film Collections QC screenshots at 393px.
 * Run: node scripts/capture_personal_collections_qc.mjs
 * Requires v2 at http://127.0.0.1:5175/
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'tmp-v2-qc');
const BASE = 'http://127.0.0.1:5175/';
const VIEWPORT = { width: 393, height: 852 };

mkdirSync(OUT, { recursive: true });

async function clearPrefs(page) {
  await page.evaluate(() => {
    for (const key of [
      'reel-seattle.v2.savedFilms',
      'reel-seattle.v2.seenFilms',
      'reel-seattle.v2.dismissedFilms',
    ]) {
      localStorage.removeItem(key);
    }
  });
}

async function seedMixedPrefs(page) {
  await page.evaluate(async () => {
    const response = await fetch('/data/showtimes_current.json');
    const data = response.ok ? await response.json() : null;
    const films = Array.isArray(data?.films) ? data.films : [];
    const withOpp = [];
    const opps = Array.isArray(data?.showtimes)
      ? data.showtimes
      : Array.isArray(data?.opportunities)
        ? data.opportunities
        : [];
    const keysWithShow = new Set(
      opps.map((o) => o.film_key || o.filmKey || o.showtime_film_key).filter(Boolean),
    );
    for (const f of films) {
      const key = f.showtime_film_key || f.film_key || f.filmKey || f.id;
      if (!key) continue;
      if (keysWithShow.has(key) && withOpp.length < 3) withOpp.push(f);
    }
    // Fallback: first films if opportunity keys don't match
    while (withOpp.length < 3 && withOpp.length < films.length) {
      const f = films[withOpp.length];
      if (f) withOpp.push(f);
      else break;
    }

    const now = Date.now();
    const savedItems = [];
    for (let i = 0; i < withOpp.length; i += 1) {
      const f = withOpp[i];
      const key = f.showtime_film_key || f.film_key || f.filmKey || f.id;
      savedItems.push({
        filmRef: {
          filmId: f.film_id || f.filmId || null,
          showtimeFilmKey: String(key),
          sourceFilmId: null,
          source: null,
        },
        savedAt: new Date(now - i * 3600_000).toISOString(),
        title: f.title || f.display_title || 'Untitled',
        posterUrl: f.poster_url || f.posterUrl || null,
        year: f.year || f.release_year || null,
      });
    }
    // TMDB-only / watching snapshots
    savedItems.push(
      {
        filmRef: {
          filmId: 'tmdb:693134',
          showtimeFilmKey: 'tmdb:693134',
          sourceFilmId: null,
          source: null,
        },
        savedAt: new Date(now - 10_000_000).toISOString(),
        title: 'Dune: Part Three',
        posterUrl: null,
        year: 2026,
      },
      {
        filmRef: {
          filmId: 'tmdb:62',
          showtimeFilmKey: 'tmdb:62',
          sourceFilmId: null,
          source: null,
        },
        savedAt: new Date(now - 11_000_000).toISOString(),
        title: '2001: A Space Odyssey',
        posterUrl: null,
        year: 1968,
      },
      {
        filmRef: {
          filmId: 'tmdb:508947',
          showtimeFilmKey: 'tmdb:508947',
          sourceFilmId: null,
          source: null,
        },
        savedAt: new Date(now - 12_000_000).toISOString(),
        title: 'The Boy and the Heron',
        posterUrl: null,
        year: 2023,
      },
    );

    localStorage.setItem(
      'reel-seattle.v2.savedFilms',
      JSON.stringify({ version: 2, items: savedItems }),
    );

    const seenBase = withOpp.slice(0, 2);
    localStorage.setItem(
      'reel-seattle.v2.seenFilms',
      JSON.stringify({
        version: 2,
        items: seenBase.map((f, i) => {
          const key = f.showtime_film_key || f.film_key || f.filmKey || f.id;
          return {
            filmRef: {
              filmId: f.film_id || f.filmId || null,
              showtimeFilmKey: String(key),
              sourceFilmId: null,
              source: null,
            },
            seenAt: new Date(now - (i + 1) * 86_400_000).toISOString(),
            seenAtSource: 'user-recorded',
            showtimeRef: null,
            title: f.title || f.display_title || 'Untitled',
            posterUrl: f.poster_url || f.posterUrl || null,
          };
        }),
      }),
    );

    const niBase = withOpp.slice(0, Math.min(4, withOpp.length));
    const niItems = niBase.map((f, i) => {
      const key = f.showtime_film_key || f.film_key || f.filmKey || f.id;
      return {
        filmRef: {
          filmId: f.film_id || f.filmId || null,
          showtimeFilmKey: String(key),
          sourceFilmId: null,
          source: null,
        },
        markedAt: new Date(now - (i + 2) * 86_400_000).toISOString(),
        markedAtSource: 'user-recorded',
        reason: null,
        title: f.title || f.display_title || 'Untitled',
        posterUrl: f.poster_url || f.posterUrl || null,
      };
    });
    niItems.push({
      filmRef: {
        filmId: 'tmdb:823464',
        showtimeFilmKey: 'tmdb:823464',
        sourceFilmId: null,
        source: null,
      },
      markedAt: new Date(now - 5 * 86_400_000).toISOString(),
      markedAtSource: 'user-recorded',
      reason: null,
      title: 'Godzilla x Kong: The New Empire',
      posterUrl: null,
      year: 2024,
    });
    localStorage.setItem(
      'reel-seattle.v2.dismissedFilms',
      JSON.stringify({ version: 2, items: niItems }),
    );
  });
}

async function openCollection(page, label) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  // Home Quick Paths: Saved / Seen rows
  const row = page.locator('.v2-explore-row', {
    has: page.locator('.v2-explore-row-label', { hasText: new RegExp(`^${label}$`, 'i') }),
  });
  if (await row.first().isVisible().catch(() => false)) {
    await row.first().scrollIntoViewIfNeeded();
    await row.first().click();
  } else if (label === 'Seen') {
    await page.locator('.v2-nav-button', { hasText: 'Explore' }).click();
    await page.getByRole('button', { name: /Seen,/i }).click();
  } else if (/not interested/i.test(label)) {
    await page.locator('.v2-nav-button', { hasText: 'Explore' }).click();
    await page.getByRole('button', { name: /Not interested,/i }).click();
  } else {
    throw new Error(`Could not find entry point for ${label}`);
  }
  await page.waitForSelector('.v2-pfc', { timeout: 15_000 });
}

async function captureState(page, name) {
  await page.screenshot({
    path: join(OUT, `pfc-${name}-393-viewport.png`),
    fullPage: false,
  });
  await page.screenshot({
    path: join(OUT, `pfc-${name}-393-full.png`),
    fullPage: true,
  });
}

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: 2,
});
const page = await context.newPage();

try {
  // --- Empty Saved ---
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await clearPrefs(page);
  await page.reload({ waitUntil: 'networkidle' });
  await openCollection(page, 'Saved');
  await captureState(page, '01-saved-empty');

  // --- Mixed Saved ---
  await clearPrefs(page);
  await seedMixedPrefs(page);
  await page.reload({ waitUntil: 'networkidle' });
  await openCollection(page, 'Saved');
  await captureState(page, '02-saved-mixed');

  // Measure landmarks for the report
  const landmarks = await page.evaluate(() => {
    const q = (sel) => document.querySelector(sel);
    const box = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        height: Math.round(r.height),
        width: Math.round(r.width),
        left: Math.round(r.left),
      };
    };
    return {
      header: box(q('.v2-header')),
      wordmark: box(q('.v2-wordmark')),
      title: box(q('.v2-pfc-title')),
      subtitle: box(q('.v2-pfc-subtitle')),
      segments: box(q('.v2-pfc-segments')),
      toolbar: box(q('.v2-pfc-toolbar')),
      firstSection: box(q('.v2-pfc-section-title')),
      firstRow: box(q('.v2-pfc-row')),
      privacy: box(q('.v2-pfc-privacy')),
      nav: box(q('.v2-nav')),
      shellPad: getComputedStyle(q('.v2-main')).paddingLeft,
      rowInner: (() => {
        const el = q('.v2-pfc-row-inner');
        if (!el) return null;
        const cs = getComputedStyle(el);
        const poster = q('.v2-pfc-row-poster');
        return {
          padding: cs.padding,
          radius: cs.borderRadius,
          border: cs.borderColor,
          poster: poster ? box(poster) : null,
        };
      })(),
      segmentActive: (() => {
        const el = q('.v2-pfc-segment-active');
        if (!el) return null;
        return { ...box(el), fontSize: getComputedStyle(el).fontSize };
      })(),
    };
  });
  console.log('LANDMARKS', JSON.stringify(landmarks, null, 2));

  // --- Seen ---
  await page.getByRole('tab', { name: /Seen/i }).click();
  await page.waitForSelector('.v2-pfc[data-pfc-kind="seen"]');
  await captureState(page, '03-seen-populated');

  // --- Not Interested ---
  await page.getByRole('tab', { name: /Not Interested/i }).click();
  await page.waitForSelector('.v2-pfc[data-pfc-kind="hidden"]');
  await captureState(page, '04-not-interested');

  console.log('Wrote screenshots to', OUT);
} catch (err) {
  console.error(err);
  await page.screenshot({
    path: join(OUT, 'pfc-error.png'),
    fullPage: true,
  }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
