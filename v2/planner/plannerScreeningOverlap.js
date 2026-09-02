/**
 * Overlap detection and conflict clustering for Planner Upcoming screenings.
 */

/**
 * @param {string | null | undefined} iso
 * @returns {number | null}
 */
export function parseScreeningMs(iso) {
  if (!iso || typeof iso !== 'string') return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * @param {{ startMs?: number | null, endMs?: number | null }} a
 * @param {{ startMs?: number | null, endMs?: number | null }} b
 */
export function screeningsOverlap(a, b) {
  if (
    a.startMs == null ||
    a.endMs == null ||
    b.startMs == null ||
    b.endMs == null
  ) {
    return false;
  }
  return a.startMs < b.endMs && b.startMs < a.endMs;
}

/**
 * Connected components of overlapping screenings (size >= 2).
 *
 * @param {Array<{ id: string, startMs?: number | null, endMs?: number | null, dateKey?: string }>} screenings
 * @returns {Array<{ id: string, dateKey: string, members: typeof screenings }>}
 */
export function findConflictClusters(screenings) {
  const list = Array.isArray(screenings) ? screenings : [];
  const n = list.length;
  if (n < 2) return [];

  /** @type {number[]} */
  const parent = Array.from({ length: n }, (_, i) => i);

  const find = (i) => {
    let root = i;
    while (parent[root] !== root) {
      parent[root] = parent[parent[root]];
      root = parent[root];
    }
    return root;
  };

  const union = (i, j) => {
    const ri = find(i);
    const rj = find(j);
    if (ri !== rj) parent[rj] = ri;
  };

  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      if (screeningsOverlap(list[i], list[j])) {
        union(i, j);
      }
    }
  }

  /** @type {Map<number, typeof list>} */
  const groups = new Map();
  for (let i = 0; i < n; i += 1) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(list[i]);
  }

  /** @type {Array<{ id: string, dateKey: string, members: typeof list }>} */
  const clusters = [];
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    const sorted = [...members].sort((a, b) => {
      const as = a.startMs ?? 0;
      const bs = b.startMs ?? 0;
      if (as !== bs) return as - bs;
      return String(a.id).localeCompare(String(b.id));
    });
    const ids = sorted.map((m) => m.id).sort();
    const dateKey =
      sorted.find((m) => m.dateKey)?.dateKey ??
      sorted[0]?.dateKey ??
      'unknown';
    clusters.push({
      id: `conflict-${ids.join('__')}`,
      dateKey,
      members: sorted,
    });
  }

  clusters.sort((a, b) => {
    const as = a.members[0]?.startMs ?? 0;
    const bs = b.members[0]?.startMs ?? 0;
    if (as !== bs) return as - bs;
    return a.id.localeCompare(b.id);
  });

  return clusters;
}

/**
 * @param {Array<{ title?: string }>} members
 */
export function formatConflictBody(members) {
  const titles = members
    .map((m) => (typeof m.title === 'string' ? m.title.trim() : ''))
    .filter(Boolean);
  if (titles.length === 0) return 'These screenings overlap.';
  if (titles.length === 1) return `${titles[0]} overlaps with another screening.`;
  if (titles.length === 2) return `${titles[0]} and ${titles[1]} overlap.`;
  if (titles.length === 3) {
    return `${titles[0]}, ${titles[1]}, and ${titles[2]} overlap.`;
  }
  const last = titles[titles.length - 1];
  const rest = titles.slice(0, -1).join(', ');
  return `${rest}, and ${last} overlap.`;
}
