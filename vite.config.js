import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const api = `http://localhost:${process.env.PORT || 3001}`;

export default defineConfig({
  root: 'client',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': api,
      '/uploads': api,
      '/socket.io': { target: api, ws: true },
    },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
