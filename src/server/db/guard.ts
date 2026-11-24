import { existsSync, readFileSync } from 'node:fs';
import { get } from 'node:http';
import { resolve } from 'node:path';

/** True when the recorded local server answers its health check. Plain http (no keep-alive) so the CLI can exit cleanly. */
function healthy(port: number): Promise<boolean> {
  return new Promise((done) => {
    const req = get({ host: '127.0.0.1', port, path: '/api/health', agent: false, timeout: 2000 }, (res) => {
      res.resume();
      res.on('end', () => done(res.statusCode === 200));
    });
    req.on('timeout', () => { req.destroy(); done(false); });
    req.on('error', () => done(false));
  });
}

/**
 * The embedded PGlite database must only be opened by one process. Database CLIs call this first and stop if the
 * local server started by scripts/start-local.ps1 is still running against the same data directory.
 */
export async function refuseIfLocalServerRunning(usingExternalDb: boolean) {
  if (usingExternalDb) return;
  const portFile = resolve(process.cwd(), '.data/server.port');
  if (!existsSync(portFile)) return;
  const port = Number(readFileSync(portFile, 'utf8').trim());
  if (await healthy(port)) {
    console.error(`The Nakshatra server is running on port ${port} and has the embedded database open. Stop it first: npm run local:stop`);
    process.exit(1);
  }
}
