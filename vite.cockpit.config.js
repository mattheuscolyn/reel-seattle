import { spawnSync } from 'node:child_process'
import {
  appendFileSync,
  createReadStream,
  existsSync,
  mkdtempSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { env } from 'node:process'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { ALLOWED_DATA_ROUTES } from './cockpit/allowedDataRoutes.js'

const repoRoot = fileURLToPath(new URL('.', import.meta.url))
const cockpitRoot = fileURLToPath(new URL('./cockpit', import.meta.url))
const cockpitOutDir = fileURLToPath(new URL('./dist-cockpit', import.meta.url))

// Shell env wins; merge gitignored .env / .env.local so local Search/Validate works
// without exporting TMDB_* every session. Never commit those files.
const fileEnv = loadEnv(env.MODE || 'development', repoRoot, '')
const cockpitEnv = { ...fileEnv, ...env }

export { ALLOWED_DATA_ROUTES }

function isLocalHost(req) {
  const host = String(req.headers.host || '')
    .split(':')[0]
    .toLowerCase()
  return host === '127.0.0.1' || host === 'localhost' || host === '[::1]' || host === '::1'
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8') || '{}'
        resolve(JSON.parse(raw))
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

function pythonBin() {
  return cockpitEnv.REEL_SEATTLE_PYTHON || 'python'
}

function applyDecisionPatch(patchDoc) {
  const dir = mkdtempSync(join(tmpdir(), 'reel-filmid-'))
  const patchPath = join(dir, 'patch.json')
  writeFileSync(patchPath, JSON.stringify(patchDoc), 'utf8')
  const result = spawnSync(
    pythonBin(),
    ['scripts/apply_tmdb_match_decisions.py', '--patch', patchPath],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...cockpitEnv,
        // Windows consoles often use cp1252; keep apply-script stdout ASCII-safe.
        PYTHONIOENCODING: 'utf-8',
        PYTHONUTF8: '1',
      },
    },
  )
  if (result.status !== 0) {
    const message = (result.stderr || result.stdout || 'apply failed')
      .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
      .replace(/api_key=[^&\s]+/gi, 'api_key=[redacted]')
    throw new Error(message.trim() || 'apply_tmdb_match_decisions failed')
  }
  return { ok: true }
}

async function tmdbFetch(path, query = {}) {
  const bearer = (cockpitEnv.TMDB_READ_ACCESS_TOKEN || '').trim()
  const apiKey = (cockpitEnv.TMDB_API_KEY || '').trim()
  if (!bearer && !apiKey) {
    const error = new Error(
      'Missing TMDB credentials on the cockpit server. Set TMDB_READ_ACCESS_TOKEN or TMDB_API_KEY in the shell that runs npm run cockpit, or in a gitignored .env.local at the repo root, then restart the cockpit.',
    )
    error.status = 503
    throw error
  }
  const url = new URL(`https://api.themoviedb.org/3${path}`)
  for (const [key, value] of Object.entries(query)) {
    if (value != null && value !== '') url.searchParams.set(key, String(value))
  }
  const headers = { Accept: 'application/json' }
  if (bearer) {
    headers.Authorization = `Bearer ${bearer}`
  } else {
    url.searchParams.set('api_key', apiKey)
  }
  const response = await fetch(url, { headers })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(`TMDB HTTP ${response.status}`)
    error.status = response.status
    throw error
  }
  return body
}

/**
 * Serve a fixed set of committed artifacts into the cockpit dev server.
 * Any other /data/* path returns 404 so Vite SPA HTML cannot masquerade as JSON.
 * Local-only film-identity write + TMDB proxy endpoints are also mounted here.
 */
function serveAllowedPublicData() {
  return {
    name: 'cockpit-serve-allowed-public-data',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = (req.url || '').split('?')[0]

        if (path.startsWith('/api/film-identity/')) {
          if (!isLocalHost(req)) {
            sendJson(res, 403, { error: 'Film identity API is local-only' })
            return
          }
          try {
            if (req.method === 'POST' && path === '/api/film-identity/decisions') {
              const body = await readJsonBody(req)
              applyDecisionPatch(body)
              sendJson(res, 200, { ok: true })
              return
            }
            if (req.method === 'GET' && path === '/api/film-identity/tmdb/search') {
              const url = new URL(req.url || '', 'http://127.0.0.1')
              const body = await tmdbFetch('/search/movie', {
                query: url.searchParams.get('query') || '',
                year: url.searchParams.get('year') || undefined,
                include_adult: 'false',
                language: 'en-US',
                page: '1',
              })
              sendJson(res, 200, {
                results: (body.results || []).slice(0, 10).map((row) => ({
                  id: row.id,
                  title: row.title,
                  original_title: row.original_title,
                  release_date: row.release_date,
                  overview: row.overview,
                  poster_path: row.poster_path,
                  popularity: row.popularity,
                })),
              })
              return
            }
            const movieMatch = path.match(/^\/api\/film-identity\/tmdb\/movie\/(\d+)$/)
            if (req.method === 'GET' && movieMatch) {
              const body = await tmdbFetch(`/movie/${movieMatch[1]}`, {
                language: 'en-US',
                append_to_response: 'external_ids,credits',
              })
              sendJson(res, 200, {
                id: body.id,
                title: body.title,
                original_title: body.original_title,
                release_date: body.release_date,
                runtime: body.runtime,
                overview: body.overview,
                poster_path: body.poster_path,
                external_ids: body.external_ids
                  ? { imdb_id: body.external_ids.imdb_id }
                  : null,
              })
              return
            }
            sendJson(res, 404, { error: `Unknown film identity API path: ${path}` })
          } catch (error) {
            sendJson(res, error.status || 500, {
              error: error instanceof Error ? error.message : String(error),
            })
          }
          return
        }

        if (!path.startsWith('/data/')) {
          next()
          return
        }

        const logPath = env.COCKPIT_DATA_REQUEST_LOG
        if (logPath) {
          try {
            appendFileSync(logPath, `${path}\n`, 'utf8')
          } catch {
            // Smoke instrumentation only — never break the server.
          }
        }

        const filePath = ALLOWED_DATA_ROUTES[path]
        if (!filePath) {
          res.statusCode = 404
          res.setHeader('Content-Type', 'text/plain; charset=utf-8')
          res.end(`Unsupported cockpit data path: ${path}`)
          return
        }

        if (!existsSync(filePath)) {
          res.statusCode = 404
          res.setHeader('Content-Type', 'text/plain; charset=utf-8')
          res.end(`Artifact not found for ${path}`)
          return
        }

        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        createReadStream(filePath).pipe(res)
      })
    },
  }
}

/**
 * Isolated local developer cockpit. Not used by `npm run build` or Pages deploy.
 * Start with: npm run cockpit → http://127.0.0.1:5174/
 */
export default defineConfig({
  root: cockpitRoot,
  plugins: [react(), serveAllowedPublicData()],
  publicDir: false,
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
    fs: {
      allow: [repoRoot],
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
  },
  build: {
    outDir: cockpitOutDir,
    emptyOutDir: true,
  },
})
