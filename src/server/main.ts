import { loadConfig } from './config';
import { buildApp } from './app';
import { startScheduler } from './services/scheduler';

async function main() {
  const config = loadConfig();
  const { app, ctx, dbHandle } = await buildApp(config);
  const stopScheduler = startScheduler(ctx);
  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    app.log.info({ signal }, 'shutting down');
    // Never hang on a stuck connection: the host would kill the process anyway.
    setTimeout(() => process.exit(1), 10_000).unref();
    await stopScheduler();
    await app.close();
    await dbHandle.close();
    process.exit(0);
  };
  process.on('unhandledRejection', (err) => app.log.error({ err }, 'unhandled rejection'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  await app.listen({ port: config.PORT, host: config.HOST });
  app.log.info(`Nakshatra API listening on http://${config.HOST}:${config.PORT} (database: ${dbHandle.kind})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
