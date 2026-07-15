import { createReadStream, existsSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const repoRoot = fileURLToPath(new URL('.', import.meta.url))
const cockpitRoot = fileURLToPath(new URL('./cockpit', import.meta.url))
const cockpitOutDir = fileURLToPath(new URL('./dist-cockpit', import.meta.url))
const pipelineReportPath = fileURLToPath(
  new URL('./public/data/pipeline_report.json', import.meta.url),
)

/**
 * Serve only the committed pipeline report into the cockpit dev server.
 * Does not enable publicDir or expose the rest of public/.
 */
function servePipelineReportOnly() {
  return {
    name: 'cockpit-serve-pipeline-report',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url || '').split('?')[0]
        if (path !== '/data/pipeline_report.json') {
          next()
          return
        }

        if (!existsSync(pipelineReportPath)) {
          res.statusCode = 404
          res.setHeader('Content-Type', 'text/plain; charset=utf-8')
          res.end('public/data/pipeline_report.json not found')
          return
        }

        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        createReadStream(pipelineReportPath).pipe(res)
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
  plugins: [react(), servePipelineReportOnly()],
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
