import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    conditions: ['development', 'import', 'module', 'browser', 'default'],
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            if (id.includes('/packages/shared/') || id.includes('@titan/shared')) {
              return 'titan-shared';
            }
            if (id.includes('/packages/ui/') || id.includes('@titan/ui')) {
              return 'titan-ui';
            }
            return undefined;
          }
          if (
            id.includes('react-markdown') ||
            id.includes('remark-') ||
            id.includes('rehype-') ||
            id.includes('micromark')
          ) {
            return 'vendor-markdown';
          }
          if (id.includes('react-dom') || id.includes('/react/')) {
            return 'vendor-react';
          }
          if (id.includes('wouter')) {
            return 'vendor-router';
          }
          return undefined;
        },
      },
    },
  },
  server: {
    port: Number(process.env.VITE_DEV_PORT || 5173),
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
