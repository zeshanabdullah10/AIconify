/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// BASE_PATH lets the GitHub Pages workflow serve the app from /<repo>/.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), tailwindcss()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: process.env.LIVE ? ['src/**/*.live.test.ts'] : ['src/**/*.test.{ts,tsx}'],
    exclude: process.env.LIVE ? [] : ['src/**/*.live.test.ts', 'node_modules/**'],
  },
});
