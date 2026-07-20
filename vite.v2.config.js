import { createReadStream, existsSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { ALLOWED_V2_DATA_ROUTES } from './v2/data/allowedDataRoutes.js'

const repoRoot = fileURLToPath(new URL('.', import.meta.url))
const v2Root = fileURLToPath(new URL('./v2', import.meta.url))
const v2OutDir = fileURLToPath(new URL('./dist-v2', import.meta.url))

/**
 * Serve allowlisted public/data artifacts into the v2 Vite server only.
 * Does not enable publicDir or expose the rest of public/.
 */
function serveAllowedV2PublicData() {
  return {
    name: 'v2-serve-allowed-public-data',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url || '').split('?')[0]
        if (!path.startsWith('/data/')) {
          next()
          return
        }

        const filePath = ALLOWED_V2_DATA_ROUTES[path]
        if (!filePath) {
          res.statusCode = 404
          res.setHeader('Content-Type', 'text/plain; charset=utf-8')
          res.end(`Unsupported v2 data path: ${path}`)
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
 * Isolated local v2 application (I-01 shell + I-02 Home data adapter).
 * Not used by `npm run build` or Pages deploy.
 * Start with: npm run v2 → http://127.0.0.1:5175/
 */
export default defineConfig({
  root: v2Root,
  plugins: [react(), serveAllowedV2PublicData()],
  // Do not serve/copy the public site `public/` directory into this app.
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
