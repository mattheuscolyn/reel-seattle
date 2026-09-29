import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import React from 'react';
import { renderToString } from 'react-dom/server';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const CSS = readFileSync(join(ROOT, 'v2/v2.css'), 'utf8');

async function loadV2Module(server, specifier) {
  return server.ssrLoadModule(specifier);
}

test('Home loading shell, deferred shelves, and image loading hints', async () => {
  const server = await createServer({
    configFile: join(ROOT, 'vite.v2.config.js'),
    logLevel: 'error',
  });
  try {
    const homeMod = await loadV2Module(server, '/HomeDestination.jsx');
    const shelfMod = await loadV2Module(server, '/home/FilmShelf.jsx');
    const stageMod = await loadV2Module(server, '/topOpportunities/OpportunityImageStage.jsx');

    const loadingHtml = renderToString(
      React.createElement(homeMod.default, {
        loadStatus: 'loading',
        homeData: null,
      }),
    );
    assert.match(loadingHtml, /data-home-loading="true"/);
    assert.match(loadingHtml, /aria-busy="true"/);
    assert.match(loadingHtml, /Loading current opportunities/);
    assert.match(loadingHtml, /v2-feature-skeleton/);
    assert.match(loadingHtml, /Leaving Soon/);
    assert.match(loadingHtml, /Special Presentations/);
    assert.match(loadingHtml, /Opening This Week/);
    assert.match(loadingHtml, /Just Announced/);
    assert.match(loadingHtml, /v2-shelf-card-skeleton/);
    assert.equal(
      loadingHtml.includes('Check back once showtimes finish loading'),
      false,
    );

    const unrevealedHtml = renderToString(
      React.createElement(homeMod.default, {
        loadStatus: 'ready',
        homeData: {
          films: [
            {
              filmKey: 'film-distinctive',
              title: 'Distinctive Unrevealed Film',
            },
          ],
          leavingSoon: { status: 'ready', entries: [] },
        },
      }),
    );
    assert.match(unrevealedHtml, /v2-shelf-card-skeleton/);
    assert.equal(unrevealedHtml.includes('Distinctive Unrevealed Film'), false);

    const films = ['one', 'two', 'three', 'four', 'five'].map((id) => ({
      filmKey: id,
      title: `Film ${id}`,
      posterUrl: `https://example.test/${id}.jpg`,
    }));
    const shelfHtml = renderToString(
      React.createElement(shelfMod.default, {
        id: 'v2-leaving',
        title: 'Leaving Soon',
        shelf: { status: 'ready', films },
        homeData: { films },
        expandedFilmKey: null,
        onExpandFilm: () => {},
        onMoreDetails: () => {},
        eagerPosterCount: 4,
      }),
    );
    assert.equal(shelfHtml.split('loading="lazy"').length - 1, 1);
    assert.equal(shelfHtml.split('loading="eager"').length - 1, 4);
    assert.ok(shelfHtml.includes('decoding="async"'));

    const heroHtml = renderToString(
      React.createElement(stageMod.default, {
        title: 'Hero',
        posterUrl: 'https://example.test/hero.jpg',
      }),
    );
    assert.equal(heroHtml.includes('loading="lazy"'), false);
    assert.ok(heroHtml.includes('loading="eager"'));
    assert.ok(heroHtml.includes('decoding="async"'));
    assert.match(heroHtml, /fetchpriority="high"/i);

    assert.match(CSS, /\.v2-feature-media\s*\{[^}]*aspect-ratio:\s*16\s*\/\s*9/s);
    assert.match(CSS, /\.v2-shelf-poster\s*\{[^}]*aspect-ratio:\s*2\s*\/\s*3/s);
  } finally {
    await server.close();
  }
});
