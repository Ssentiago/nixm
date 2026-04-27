import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import * as path from 'path';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'node:fs';
import addLoggerContext from './vite-plugins/add-logger-context';
import { visualizer } from 'rollup-plugin-visualizer';

import checker from 'vite-plugin-checker';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig({
  plugins: [
    react(),
    checker({ typescript: true }),
    tailwindcss(),
    addLoggerContext(),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      react: 'preact/compat',
      'react-dom/test-utils': 'preact/test-utils',
      'react-dom': 'preact/compat',
      'react/jsx-runtime': 'preact/jsx-runtime',
      '@': path.resolve(__dirname, './src'),
    },
  },
});
