import { cpSync, existsSync, mkdirSync, readdirSync } from 'fs'
import { dirname, join, relative } from 'path'
import { fileURLToPath } from 'url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const ROOT = fileURLToPath(new URL('.', import.meta.url))
const PUBLIC_DIR = join(ROOT, 'public')

/** Archived scrape CSVs (~GB). Kept in repo but not needed on GitHub Pages. */
const PUBLIC_SKIP = ['data/daily_logs']

function shouldSkipPublicPath(relPath) {
  const normalized = relPath.replace(/\\/g, '/')
  return PUBLIC_SKIP.some(
    (skip) => normalized === skip || normalized.startsWith(`${skip}/`),
  )
}

function copyPublicDir(srcDir, destDir, rootDir = srcDir) {
  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = join(srcDir, entry.name)
    const relPath = relative(rootDir, srcPath)
    if (shouldSkipPublicPath(relPath)) continue

    const destPath = join(destDir, entry.name)
    if (entry.isDirectory()) {
      mkdirSync(destPath, { recursive: true })
      copyPublicDir(srcPath, destPath, rootDir)
    } else {
      mkdirSync(dirname(destPath), { recursive: true })
      cpSync(srcPath, destPath)
    }
  }
}

/** On build, copy public/ except heavy archive dirs Vite would otherwise duplicate into dist/. */
function selectivePublicCopy() {
  return {
    name: 'selective-public-copy',
    apply: 'build',
    closeBundle() {
      if (!existsSync(PUBLIC_DIR)) return
      copyPublicDir(PUBLIC_DIR, join(ROOT, 'dist'), PUBLIC_DIR)
    },
  }
}

/** Serve public/marathon/index.html for /marathon/ (avoid SPA fallback to React). */
function marathonStaticRoute() {
  return {
    name: 'marathon-static-route',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const path = req.url?.split('?')[0] ?? ''
        if (path === '/marathon' || path === '/marathon/') {
          req.url = '/marathon/index.html'
        }
        next()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    marathonStaticRoute(),
    command === 'build' && selectivePublicCopy(),
  ].filter(Boolean),
  publicDir: command === 'serve' ? 'public' : false,
  base: '/',
}))
