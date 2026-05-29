import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

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
export default defineConfig({
  plugins: [react(), marathonStaticRoute()],
  base: '/',
})
