import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Forward API calls to Express. The browser only ever talks to one origin
    // (localhost:5173), so cookies and CSRF work without any CORS setup.
    proxy: {
      '/api': { target: process.env.API_URL ?? 'http://localhost:4000', changeOrigin: false },
    },
  },
});
