import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The API runs on its own port in development; Vite proxies API calls to it.
const apiPort = process.env.API_PORT ?? '3001';
const apiTarget = `http://localhost:${apiPort}`;
// Behind Verktygsportalen the app is served under a path (the server's BASE_PATH); the build
// must know it so that assets, API calls and icons use the same prefix.
const basePath = process.env.BASE_PATH ?? '';

export default defineConfig({
  root: 'src/web',
  base: `${basePath}/`,
  plugins: [react()],
  build: {
    outDir: '../../dist/web',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      // Trailing slash matters: "/api" would also capture the module /api.ts.
      [`${basePath}/api/`]: apiTarget,
      '/health': apiTarget,
      [`${basePath}/icons/`]: apiTarget,
    },
  },
});
