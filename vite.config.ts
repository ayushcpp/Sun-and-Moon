import { defineConfig } from 'vite';

// Relative base so `npm run build` output can be hosted from any sub-folder.
export default defineConfig({
  base: './',
  server: { port: 5173, strictPort: true },
  build: { target: 'es2022', assetsInlineLimit: 0 },
});
