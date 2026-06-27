import { cpSync, existsSync, mkdirSync, readdirSync } from 'fs'
import { dirname, join, relative } from 'path'
import { fileURLToPath } from 'url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const ROOT = fileURLToPath(new URL('.', import.meta.url))
const PUBLIC_DIR = join(ROOT, 'public')

/** Archived scrape CSVs (~GB). Kept in repo but not shipped to GitHub Pages. */
const PUBLIC_SKIP = ['data/daily_logs']

/** Legacy full history CSV — canonical copy lives under data/history/, not in dist/. */
const PUBLIC_SKIP_FILES = ['data/showtimes_history.csv']

function shouldSkipPublicPath(relPath) {
  const normalized = relPath.replace(/\\/g, '/')
  if (PUBLIC_SKIP_FILES.includes(normalized)) return true
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

/** In dev/preview, React owns /marathon/; standalone UI stays at /marathon/index.html. */
function marathonSpaRoute() {
  const handler = (req, _res, next) => {
    const path = req.url?.split('?')[0] ?? ''
    if (path === '/marathon/') {
      req.url = '/'
    }
    next()
  }
  return {
    name: 'marathon-spa-route',
    configureServer(server) {
      server.middlewares.use(handler)
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler)
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    marathonSpaRoute(),
    command === 'build' && selectivePublicCopy(),
  ].filter(Boolean),
  publicDir: command === 'serve' ? 'public' : false,
  base: '/',
}))
