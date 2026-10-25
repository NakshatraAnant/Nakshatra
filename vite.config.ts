import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Override with NAKSHATRA_API when port 4000 is taken, e.g. NAKSHATRA_API=http://127.0.0.1:4400
const apiTarget = process.env.NAKSHATRA_API ?? 'http://127.0.0.1:4000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The root .env belongs to the server and sets NODE_ENV=development, which makes `vite build`
  // ship React's development build. The web app reads no VITE_* variables, so it loads no .env.
  envDir: 'src/web',
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: false },
      '/uploads': { target: apiTarget, changeOrigin: false },
    },
  },
  build: {
    outDir: 'dist/web',
    sourcemap: true,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // A function (not an object) so shared dependencies such as `scheduler` stay with React.
        // The object form let Rollup place them in the 3D chunk, which made every page preload three.js.
        manualChunks(id: string) {
          // Vite's lazy-import helper and CJS interop helpers are used by every page; keep them out of the 3D chunk.
          if (id.includes('vite/preload-helper') || id.includes('commonjsHelpers')) return 'react';
          if (!id.includes('node_modules')) return undefined;
          if (/node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/.test(id)) return 'react';
          if (/node_modules[\\/]three[\\/]/.test(id)) return 'three';
          if (/node_modules[\\/]@react-three[\\/]/.test(id)) return 'r3f';
          return undefined;
        },
      },
    },
  },
});
