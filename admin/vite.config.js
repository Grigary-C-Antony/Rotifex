import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    outDir: 'dist',
  },
  server: {
    proxy: {
      '/admin/api': 'http://localhost:3000',
      '/api':       'http://localhost:3000',
      '/files':     'http://localhost:3000',
      '/health':    'http://localhost:3000',
      '/storage':   'http://localhost:3000',
    },
  },
});
