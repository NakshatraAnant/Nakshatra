import { defineConfig } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// The film is a separate page, not part of the web app bundle. It reads the app's own data and
// artwork (src/shared, src/web/lib, public/visual) so names, colours and worlds can never drift.
export default defineConfig({
  root: here,
  publicDir: resolve(here, '../../public'),
  resolve: { alias: { '@app': resolve(here, '../../src') } },
  server: { port: 5190, strictPort: true, fs: { allow: [resolve(here, '../..')] } },
});
