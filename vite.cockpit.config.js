import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const cockpitRoot = fileURLToPath(new URL('./cockpit', import.meta.url))
const cockpitOutDir = fileURLToPath(new URL('./dist-cockpit', import.meta.url))

/**
 * Isolated local developer cockpit. Not used by `npm run build` or Pages deploy.
 * Start with: npm run cockpit → http://localhost:5174/
 */
export default defineConfig({
  root: cockpitRoot,
  plugins: [react()],
  // Do not serve/copy the public site `public/` directory into this app.
  publicDir: false,
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
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
