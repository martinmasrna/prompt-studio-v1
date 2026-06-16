// Proxy /api/* to the backend so the frontend never hard-codes the backend port.
// In production, a real reverse proxy (nginx etc.) would do this instead.
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 4700,
    proxy: {
      '/api': {
        target: 'http://localhost:4701',
        changeOrigin: true,
      },
    },
  },
});
