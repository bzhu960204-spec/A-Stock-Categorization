import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
const backendPort = process.env.BACKEND_PORT ?? '8080'

export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          // Heavy libraries get their own long-lived chunks; they are only
          // fetched by the lazily loaded modules that actually use them.
          groups: [
            { name: 'vendor-tiptap', test: /node_modules[\\/](@tiptap|prosemirror-|@floating-ui|linkifyjs|orderedmap|rope-sequence|w3c-keyname|fast-deep-equal)/, priority: 10 },
            { name: 'vendor-katex', test: /node_modules[\\/]katex[\\/]/, priority: 30 },
            { name: 'vendor-echarts', test: /node_modules[\\/](echarts|zrender)[\\/]/, priority: 30 },
            { name: 'vendor-markdown', test: /node_modules[\\/](marked|dompurify)[\\/]/, priority: 30 },
            { name: 'vendor-react', test: /node_modules[\\/](react|react-dom|scheduler|react-router|cookie|set-cookie-parser)[\\/]/, priority: 40 },
          ],
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        // 127.0.0.1 (not "localhost") because the backend binds to IPv4 loopback only.
        target: `http://127.0.0.1:${backendPort}`,
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
