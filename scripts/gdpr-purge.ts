/**
 * Deletes all personal data after the campaign (SPEC §9). Dry run unless --confirm is given.
 *   npm run gdpr:purge                 – shows what would be deleted
 *   npm run gdpr:purge -- --confirm    – deletes users, completions and boards for good
 * Never run against a shared environment without explicit approval from the campaign owner.
 */
import { loadConfig } from '../src/api/config.ts';
import { openDatabase } from '../src/data/db.ts';
import { countPersonalData, purgePersonalData } from '../src/data/gdpr.ts';

const confirm = process.argv.includes('--confirm');
const config = loadConfig();
const db = await openDatabase({ databaseUrl: config.databaseUrl, pgliteDir: config.pgliteDir });

try {
  const counts = await countPersonalData(db);
  const target = config.databaseUrl ? `PostgreSQL (APP_ENV=${config.appEnv})` : config.pgliteDir;
  console.log(`Database: ${target}`);
  console.log(
    `Personal data: ${counts.users} users, ${counts.completions} completions, ` +
      `${counts.openings} opened luckor, ${counts.boardPieces} board pieces.`,
  );
  if (!confirm) {
    console.log('Dry run – nothing deleted. Re-run with --confirm to purge.');
  } else {
    const deleted = await purgePersonalData(db);
    console.log(
      `Purged ${deleted.users} users, ${deleted.completions} completions, ` +
        `${deleted.openings} opened luckor and ${deleted.boardPieces} board pieces. ` +
        'Anonymous per-lucka totals kept in campaign_summary.',
    );
  }
} finally {
  await db.close();
}
