import { loadContent } from '../data/content.ts';
import { openDatabase } from '../data/db.ts';
import { buildApp } from './app.ts';
import { createContext, prepareDatabase } from './bootstrap.ts';
import { clockFromFakeToday } from './clock.ts';
import { loadConfig } from './config.ts';

const config = loadConfig();
const content = loadContent();
const clock = clockFromFakeToday(config.fakeToday);
const db = await openDatabase({ databaseUrl: config.databaseUrl, pgliteDir: config.pgliteDir });
const ctx = createContext({ config, db, content, clock });

await prepareDatabase(ctx);

const app = await buildApp(ctx, {
  logger: config.appEnv === 'test' ? false : { level: 'info' },
});

if (clock.simulated) {
  app.log.warn(`Date simulation active: server time is ${clock.now().toISOString()}`);
}

async function shutdown(signal: string) {
  app.log.info(`${signal} received, shutting down`);
  await app.close();
  await db.close();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ port: config.port, host: config.host });
