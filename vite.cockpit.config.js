import { createReadStream, existsSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const repoRoot = fileURLToPath(new URL('.', import.meta.url))
const cockpitRoot = fileURLToPath(new URL('./cockpit', import.meta.url))
const cockpitOutDir = fileURLToPath(new URL('./dist-cockpit', import.meta.url))

/**
 * Explicit allowlist only — never a wildcard filesystem map.
 * Key: request path, Value: absolute path under public/data/.
 */
const ALLOWED_DATA_ROUTES = Object.freeze({
  '/data/pipeline_report.json': fileURLToPath(
    new URL('./public/data/pipeline_report.json', import.meta.url),
  ),
  '/data/theaters.json': fileURLToPath(
    new URL('./public/data/theaters.json', import.meta.url),
  ),
})

/**
 * Serve a fixed set of committed public/data artifacts into the cockpit dev server.
 * Any other /data/* path returns 404 so Vite SPA HTML cannot masquerade as JSON.
 * Does not enable publicDir or expose the rest of public/.
 */
function serveAllowedPublicData() {
  return {
    name: 'cockpit-serve-allowed-public-data',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url || '').split('?')[0]
        if (!path.startsWith('/data/')) {
          next()
          return
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
  // Do not serve/copy the public site `public/` directory into this app.
  publicDir: false,
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
    fs: {
      // Allow resolving React from the repo-root node_modules while keeping root=cockpit/.
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
