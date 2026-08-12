import {
  createReadStream,
  existsSync,
  cpSync,
  mkdirSync,
  statSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { extname, join, normalize, relative, resolve } from 'node:path'
import { env } from 'node:process'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { resolveAllowedV2DataRoute } from './v2/data/allowedDataRoutes.js'
import { copyAllowedV2DataArtifacts } from './v2/data/copyAllowedV2Data.js'
import {
  runTmdbMovieDetail,
  runTmdbSearch,
} from './supabase/functions/_shared/tmdbProxyContract.js'

const repoRoot = fileURLToPath(new URL('.', import.meta.url))
const v2Root = fileURLToPath(new URL('./v2', import.meta.url))
const v2OutDir = fileURLToPath(new URL('./dist-v2', import.meta.url))
const theaterImagesRoot = fileURLToPath(
  new URL('./public/theater-images', import.meta.url),
)

// Shell env wins; merge gitignored .env / .env.local for local TMDB proxy only.
const fileEnv = loadEnv(env.MODE || 'development', repoRoot, '')
const v2ServerEnv = { ...fileEnv, ...env }

const THEATER_IMAGE_CONTENT_TYPES = Object.freeze({
  '.svg': 'image/svg+xml; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
})

function sendJson(res, status, payload, extraHeaders = {}) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  for (const [key, value] of Object.entries(extraHeaders)) {
    res.setHeader(key, value)
  }
  res.end(JSON.stringify(payload))
}

/**
 * Local-only TMDB search/detail proxy for v2 Search Phase 1.
 * Shares whitelist/shaping with the production Supabase Edge Function.
 * Secrets never ship to the browser bundle.
 */
function serveV2TmdbProxy() {
  return {
    name: 'v2-serve-tmdb-proxy',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = (req.url || '').split('?')[0]
        if (!path.startsWith('/api/tmdb/')) {
          next()
          return
        }
        if (req.method !== 'GET') {
          sendJson(res, 405, { error: 'Method not allowed' })
          return
        }
        try {
          if (path === '/api/tmdb/search') {
            const url = new URL(req.url || '', 'http://127.0.0.1')
            const result = await runTmdbSearch(
              {
                query: url.searchParams.get('query'),
                limit: url.searchParams.get('limit'),
              },
              v2ServerEnv,
            )
            sendJson(res, result.status, result.body, {
              ...(result.cacheControl
                ? { 'Cache-Control': result.cacheControl }
                : {}),
            })
            return
          }

          const movieMatch = path.match(/^\/api\/tmdb\/movie\/(\d+)$/)
          if (movieMatch) {
            const result = await runTmdbMovieDetail(
              { id: movieMatch[1] },
              v2ServerEnv,
            )
            sendJson(res, result.status, result.body, {
              ...(result.cacheControl
                ? { 'Cache-Control': result.cacheControl }
                : {}),
            })
            return
          }

          sendJson(res, 404, { error: 'Unknown TMDB proxy path' })
        } catch (error) {
          const status = Number(error?.status) || 502
          sendJson(res, status, {
            error: status === 503 ? 'tmdb_unconfigured' : 'tmdb_unavailable',
          })
        }
      })
    },
  }
}

/**
 * Serve allowlisted public/data artifacts into the v2 Vite server only.
 * Does not enable publicDir or expose the rest of public/.
 * Build copy uses the same allowlist via `copyAllowedV2DataArtifacts`.
 */
function serveAllowedV2PublicData() {
  return {
    name: 'v2-serve-allowed-public-data',
    configureServer(server) {
      attachAllowedDataMiddleware(server.middlewares)
    },
    configurePreviewServer(server) {
      attachAllowedDataMiddleware(server.middlewares)
    },
    closeBundle() {
      const result = copyAllowedV2DataArtifacts({ outDir: v2OutDir })
      const names = result.copied.map((c) => c.destRelative).join(', ')
      console.log(
        `[v2-data] copied ${result.copied.length} allowlisted artifact(s) → dist-v2/data/` +
          (names ? ` (${names})` : ''),
      )
      if (result.skippedOptional.length) {
        console.log(
          `[v2-data] skipped optional missing: ${result.skippedOptional.join(', ')}`,
        )
      }

      // Domain-root Pages custom domain (also set via deploy.yml cname).
      const cnameSources = [
        join(repoRoot, 'public', 'CNAME'),
        join(repoRoot, 'CNAME'),
      ]
      const cnameSrc = cnameSources.find((p) => existsSync(p))
      const cnameDest = join(v2OutDir, 'CNAME')
      if (cnameSrc) {
        cpSync(cnameSrc, cnameDest)
      } else {
        writeFileSync(cnameDest, 'www.reelseattle.com\n', 'utf8')
      }
      console.log(`[v2-data] wrote dist-v2/CNAME (${readFileSync(cnameDest, 'utf8').trim()})`)
    },
  }
}

function attachAllowedDataMiddleware(middlewares) {
  middlewares.use((req, res, next) => {
    const path = (req.url || '').split('?')[0]
    if (!path.startsWith('/data/')) {
      next()
      return
    }

    const filePath = resolveAllowedV2DataRoute(path)
    if (!filePath) {
      // App modules may live under v2/data/ and be requested as /data/*.js —
      // let Vite serve those. Unknown JSON paths stay blocked.
      if (path.endsWith('.json')) {
        res.statusCode = 404
        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        res.end(`Unsupported v2 data path: ${path}`)
        return
      }
      next()
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
}

/**
 * WS-TIMG: serve + copy only `public/theater-images/**` (rights-cleared assets).
 * Still does not enable the full site `public/` directory.
 */
function serveAllowedV2TheaterImages() {
  return {
    name: 'v2-serve-theater-images',
    configureServer(server) {
      attachTheaterImagesMiddleware(server.middlewares)
    },
    configurePreviewServer(server) {
      attachTheaterImagesMiddleware(server.middlewares)
    },
    writeBundle() {
      if (!existsSync(theaterImagesRoot)) return
      const dest = join(v2OutDir, 'theater-images')
      mkdirSync(dest, { recursive: true })
      cpSync(theaterImagesRoot, dest, { recursive: true })
    },
  }
}

function attachTheaterImagesMiddleware(middlewares) {
  middlewares.use((req, res, next) => {
    const path = (req.url || '').split('?')[0]
    if (!path.startsWith('/theater-images/')) {
      next()
      return
    }

    if (path.includes('..') || path.includes('\\')) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      res.end('Invalid theater image path')
      return
    }

    const relativePath = path.slice('/theater-images/'.length)
    const filePath = resolve(theaterImagesRoot, relativePath)
    const rootNormalized = normalize(theaterImagesRoot + '/')
    if (
      !normalize(filePath).startsWith(rootNormalized) &&
      normalize(filePath) !== normalize(theaterImagesRoot)
    ) {
      res.statusCode = 403
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      res.end('Forbidden theater image path')
      return
    }

    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      res.statusCode = 404
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      res.end(`Theater image not found: ${path}`)
      return
    }

    // README and other non-image docs under this tree stay unserved.
    const ext = extname(filePath).toLowerCase()
    const contentType = THEATER_IMAGE_CONTENT_TYPES[ext]
    if (!contentType) {
      res.statusCode = 404
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      res.end(`Unsupported theater image type: ${ext || '(none)'}`)
      return
    }

    res.statusCode = 200
    res.setHeader('Content-Type', contentType)
    res.setHeader(
      'Cache-Control',
      'public, max-age=300, stale-while-revalidate=86400',
    )
    // Keep relative() for clearer debugging without leaking absolute paths.
    res.setHeader('X-Theater-Image', relative(theaterImagesRoot, filePath))
    createReadStream(filePath).pipe(res)
  })
}

/**
 * Isolated local v2 application (I-01 shell + I-02 Home data adapter).
 * Not used by `npm run build` or Pages deploy.
 * Start with: npm run v2 → http://127.0.0.1:5175/
 */
export default defineConfig({
  root: v2Root,
  envDir: repoRoot,
  // Domain-root Pages deploy (matches main site vite.config.js). Absolute
  // `/data/...` URLs and BASE_URL=`/` stay aligned; resolveV2DataUrl honors BASE_URL.
  base: '/',
  plugins: [
    react(),
    serveAllowedV2PublicData(),
    serveAllowedV2TheaterImages(),
    serveV2TmdbProxy(),
  ],
  // Do not serve/copy the public site `public/` directory into this app.
  // Allowlisted JSON is copied explicitly in closeBundle (see serveAllowedV2PublicData).
  publicDir: false,
  server: {
    host: '127.0.0.1',
    port: 5175,
    strictPort: true,
    fs: {
      // Allow resolving React from the repo-root node_modules while keeping root=v2/.
      allow: [repoRoot],
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 5175,
    strictPort: true,
  },
  build: {
    outDir: v2OutDir,
    emptyOutDir: true,
  },
})
