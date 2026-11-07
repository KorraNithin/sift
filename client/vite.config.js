import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The dev server proxies /api to the Express server so cookies stay same-origin.
// Note: the proxy rewrites the Host header, so the API must not rely on Host/Origin checks.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:4000' } },
  build: { outDir: 'dist', sourcemap: false },
});
