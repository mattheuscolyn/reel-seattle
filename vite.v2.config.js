import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const repoRoot = fileURLToPath(new URL('.', import.meta.url))
const v2Root = fileURLToPath(new URL('./v2', import.meta.url))
const v2OutDir = fileURLToPath(new URL('./dist-v2', import.meta.url))

/**
 * Isolated local v2 application shell (I-01).
 * Not used by `npm run build` or Pages deploy.
 * Start with: npm run v2 → http://127.0.0.1:5175/
 */
export default defineConfig({
  root: v2Root,
  plugins: [react()],
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
