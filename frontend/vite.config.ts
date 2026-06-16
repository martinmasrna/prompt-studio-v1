// Proxy /api/* to the backend so the frontend never hard-codes the backend port.
// The port is read from backend/config.json (the single source of truth) so it
// only ever needs to be set in one place. In production, a real reverse proxy
// (nginx etc.) would handle this routing instead.
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Read the backend port from config.json once at startup; fall back to 4701 if
// the file is missing or has no port. (Change the port there and restart.)
function backendPort(): number {
  try {
    const configPath = fileURLToPath(new URL('../backend/config.json', import.meta.url));
    const cfg = JSON.parse(readFileSync(configPath, 'utf-8')) as { port?: number };
    return cfg.port ?? 4701;
  } catch {
    return 4701;
  }
}

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 4700,
    proxy: {
      '/api': {
        target: `http://localhost:${backendPort()}`,
        changeOrigin: true,
      },
    },
  },
});
