import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
const backendPort = process.env.BACKEND_PORT ?? '8080'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: `http://localhost:${backendPort}`,
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (err, _req, res) => {
            if ((err as NodeJS.ErrnoException).code === 'ECONNREFUSED') {
              const serverRes = res as import('http').ServerResponse;
              if (serverRes.writeHead && !serverRes.headersSent) {
                serverRes.writeHead(503, { 'Content-Type': 'application/json' });
                serverRes.end(JSON.stringify({ error: 'Backend not available' }));
              }
            }
          });
        },
      },
    },
  },
})
