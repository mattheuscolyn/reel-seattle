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
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolveAllowedV2DataRoute } from './v2/data/allowedDataRoutes.js'
import { copyAllowedV2DataArtifacts } from './v2/data/copyAllowedV2Data.js'

const repoRoot = fileURLToPath(new URL('.', import.meta.url))
const v2Root = fileURLToPath(new URL('./v2', import.meta.url))
const v2OutDir = fileURLToPath(new URL('./dist-v2', import.meta.url))
const theaterImagesRoot = fileURLToPath(
  new URL('./public/theater-images', import.meta.url),
)

const THEATER_IMAGE_CONTENT_TYPES = Object.freeze({
  '.svg': 'image/svg+xml; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
})

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
  plugins: [react(), serveAllowedV2PublicData(), serveAllowedV2TheaterImages()],
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
