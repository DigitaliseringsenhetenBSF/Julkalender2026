import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The API runs on its own port in development; Vite proxies API calls to it.
const apiPort = process.env.API_PORT ?? '3001';
const apiTarget = `http://localhost:${apiPort}`;

export default defineConfig({
  root: 'src/web',
  plugins: [react()],
  build: {
    outDir: '../../dist/web',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      // Trailing slash matters: "/api" would also capture the module /api.ts.
      '/api/': apiTarget,
      '/health': apiTarget,
      '/icons/': apiTarget,
    },
  },
});
