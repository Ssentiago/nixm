import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import * as path from 'path';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'node:fs';
import addLoggerContext from './vite-plugins/add-logger-context';
import { visualizer } from 'rollup-plugin-visualizer';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    addLoggerContext(),
    visualizer({ open: true }),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
        },
      },
    },
  },
});
