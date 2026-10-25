import { loadConfig } from './config';
import { buildApp } from './app';
import { startScheduler } from './services/scheduler';

async function main() {
  const config = loadConfig();
  const { app, ctx, dbHandle } = await buildApp(config);
  const stopScheduler = startScheduler(ctx);
  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
    stopScheduler();
    await app.close();
    await dbHandle.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  await app.listen({ port: config.PORT, host: config.HOST });
  app.log.info(`Nakshatra API listening on http://${config.HOST}:${config.PORT} (database: ${dbHandle.kind})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
