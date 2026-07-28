/**
 * Centralized placeholder imagery for the v2 Home visual slice.
 * Prefer these constants over ad-hoc URLs in components.
 *
 * Landscape frames are controlled remote placeholders (Picsum, fixed seeds).
 * Poster frames use local SVG data URIs so shelves remain self-contained.
 */

function posterSvg({ title, from, to }) {
  const safe = String(title).replace(/[<>&]/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${from}"/>
      <stop offset="100%" stop-color="${to}"/>
    </linearGradient>
  </defs>
  <rect width="400" height="600" fill="url(#g)"/>
  <rect x="0" y="420" width="400" height="180" fill="rgba(0,0,0,0.45)"/>
  <text x="24" y="520" fill="#f5f5f7" font-family="Georgia, serif" font-size="28">${safe}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Cinematic landscape placeholders for Top Opportunity stages. */
export const PLACEHOLDER_BACKDROPS = Object.freeze({
  horizon: 'https://picsum.photos/seed/reelseattle-horizon/960/540',
  nocturne: 'https://picsum.photos/seed/reelseattle-nocturne/960/540',
  estuary: 'https://picsum.photos/seed/reelseattle-estuary/960/540',
});

/** Theater exterior placeholders for Stage 1 Theaters list mockup. */
export const PLACEHOLDER_THEATER_THUMBS = Object.freeze({
  siffDowntown: 'https://picsum.photos/seed/reelseattle-siff-dt/320/400',
  beacon: 'https://picsum.photos/seed/reelseattle-beacon/320/400',
  central: 'https://picsum.photos/seed/reelseattle-central/320/400',
  nwff: 'https://picsum.photos/seed/reelseattle-nwff/320/400',
  grandIllusion: 'https://picsum.photos/seed/reelseattle-gi/320/400',
  siffUptown: 'https://picsum.photos/seed/reelseattle-siff-up/320/400',
  egyptian: 'https://picsum.photos/seed/reelseattle-egyptian/320/400',
  pacificPlace: 'https://picsum.photos/seed/reelseattle-amc-pp/320/400',
});

/** Compact poster placeholders for shelf cards. */
export const PLACEHOLDER_POSTERS = Object.freeze({
  longHorizon: posterSvg({ title: 'Long Horizon', from: '#2a3348', to: '#6b4a3a' }),
  quietCity: posterSvg({ title: 'Quiet City', from: '#1a2744', to: '#5b3a6e' }),
  blueHour: posterSvg({ title: 'Blue Hour', from: '#14233a', to: '#3d6ea5' }),
  lastRehearsal: posterSvg({ title: 'Last Rehearsal', from: '#2a2418', to: '#7a5a3a' }),
  saltwaterRoad: posterSvg({ title: 'Saltwater Road', from: '#14243a', to: '#3d6ea5' }),
  harbor: posterSvg({ title: 'Harbor Light', from: '#1c2a24', to: '#4a7c59' }),
  north: posterSvg({ title: 'Northbound', from: '#2a1c14', to: '#8a5a3c' }),
  perfect: posterSvg({ title: 'Perfect Moment', from: '#241828', to: '#6e3d5b' }),
  winter: posterSvg({ title: 'Winter Light', from: '#1a222c', to: '#6a7b8c' }),
  river: posterSvg({ title: 'River Song', from: '#14201c', to: '#3f6b5a' }),
  midnight: posterSvg({ title: 'Midnight Run', from: '#1c1420', to: '#4a3a6e' }),
  memories: posterSvg({ title: 'Memories', from: '#1a1a1a', to: '#5a4a3a' }),
  budapest: posterSvg({ title: 'Budapest', from: '#5a2a3a', to: '#d4a0a8' }),
  perfectBlue: posterSvg({ title: 'Perfect Blue', from: '#1a2040', to: '#6a3a8a' }),
  rashomon: posterSvg({ title: 'Rashomon', from: '#111111', to: '#888888' }),
  spaceOdyssey: posterSvg({ title: '2001', from: '#101018', to: '#c0392b' }),
  memoriesOfMurder: posterSvg({
    title: 'Memories',
    from: '#1a1a1a',
    to: '#5a4a3a',
  }),
  minionsMonsters: posterSvg({
    title: 'Minions',
    from: '#1a3a5a',
    to: '#f0c040',
  }),
  moana: posterSvg({ title: 'Moana', from: '#0a3a4a', to: '#2a8a9a' }),
});
