import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

/**
 * vite.config.web.ts — Second Vite config for the standalone web app.
 *
 * Builds the React web app (without @crxjs/vite-plugin) into dist-web/.
 * The chrome-shim polyfills chrome.* globals so existing src/ modules work unchanged.
 *
 * Run:
 *   npm run dev:web     → development server at http://localhost:6611
 *   npm run build:web   → production build into dist-web/
 *   npm run preview:web → preview the dist-web/ build
 */
export default defineConfig({
  root: resolve(__dirname, 'apps/web'),

  // Resolve src/ imports relative to repo root
  resolve: {
    alias: {
      // Allow ../../src/ imports from apps/web/ to resolve correctly
      '@src': resolve(__dirname, 'src'),
    },
  },

  plugins: [
    react(),
  ],

  build: {
    outDir: resolve(__dirname, 'dist-web'),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'apps/web/index.html'),
    },
  },

  // Use the repo-root postcss.config.js (Tailwind) automatically
  // Vite resolves postcss config by walking up from the config file location
  css: {
    postcss: resolve(__dirname, 'postcss.config.js'),
  },

  server: {
    port: 6611,
    strictPort: true,
    open: false,
  },

  preview: {
    port: 6611,
    strictPort: true,
  },
});
