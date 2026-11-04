/**
 * Migrates and seeds the database from content/*.json (idempotent).
 * Usage: npm run db:seed              – missions, puzzle, test users (dev sign-in only)
 *        npm run db:seed:demo         – also demo completions (needs open luckor, e.g. FAKE_TODAY)
 *        npm run db:seed:all-pieces   – unlock every piece and add "Pusseltestare (alla bitar)"
 * Stop the dev server first when using the local PGlite database (one process at a time).
 */
import { createContext, prepareDatabase } from '../src/api/bootstrap.ts';
import { clockFromFakeToday } from '../src/api/clock.ts';
import { loadConfig } from '../src/api/config.ts';
import { localDateInZone, openMissionCount } from '../src/domain/calendar.ts';
import { loadContent } from '../src/data/content.ts';
import { openDatabase } from '../src/data/db.ts';
import { seedAllPieces } from '../src/data/seed.ts';

const demo = process.argv.includes('--demo');
const allPieces = process.argv.includes('--all-pieces');
const config = { ...loadConfig(), ...(demo ? { seedDemo: true } : {}) };
if ((demo || allPieces) && config.appEnv === 'production') {
  throw new Error('Demo data is not allowed in production.');
}

const db = await openDatabase({ databaseUrl: config.databaseUrl, pgliteDir: config.pgliteDir });
try {
  const ctx = createContext({
    config,
    db,
    content: loadContent(),
    clock: clockFromFakeToday(config.fakeToday),
  });
  await prepareDatabase(ctx);
  if (allPieces) {
    const today = localDateInZone(ctx.clock.now(), ctx.calendar.timezone);
    await seedAllPieces(db, ctx.content, openMissionCount(today, ctx.calendar));
  }
  const [state] = await db.query<{ unlocked: number; total: number }>(
    `SELECT s.unlocked_pieces AS unlocked, (SELECT count(*)::int FROM completions) AS total
     FROM campaign_state s WHERE s.id = 1`,
  );
  console.log(`Seeded. Completions: ${state?.total}, unlocked pieces: ${state?.unlocked}.`);
} finally {
  await db.close();
}
