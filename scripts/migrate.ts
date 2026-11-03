/** Applies pending database migrations. Usage: npm run db:migrate */
import { loadConfig } from '../src/api/config.ts';
import { openDatabase } from '../src/data/db.ts';
import { migrate } from '../src/data/migrate.ts';

const config = loadConfig();
const db = await openDatabase({ databaseUrl: config.databaseUrl, pgliteDir: config.pgliteDir });
try {
  const applied = await migrate(db);
  console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Database is up to date.');
} finally {
  await db.close();
}
