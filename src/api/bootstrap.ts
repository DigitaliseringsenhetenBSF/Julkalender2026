import { localDateInZone, openMissionCount, type CalendarConfig } from '../domain/calendar.ts';
import type { Content } from '../data/content.ts';
import type { Db } from '../data/db.ts';
import { migrate } from '../data/migrate.ts';
import { pieceRules, seedBase, seedDemo } from '../data/seed.ts';
import type { Clock } from './clock.ts';
import type { AppConfig } from './config.ts';
import type { AppContext } from './context.ts';

export function calendarConfig(content: Content): CalendarConfig {
  const { timezone, firstMissionDate, totalMissions, lastTickOffDate } = content.campaign;
  return { timezone, firstMissionDate, totalMissions, lastTickOffDate };
}

export function createContext(input: {
  config: AppConfig;
  db: Db;
  content: Content;
  clock: Clock;
  random?: () => number;
}): AppContext {
  return {
    ...input,
    random: input.random ?? Math.random,
    calendar: calendarConfig(input.content),
    rules: pieceRules(input.content),
  };
}

/**
 * Brings the database up to date on every start: migrations, then the idempotent content seed.
 * Until the admin UI exists, content/*.json is the source of truth for mission texts and is
 * re-applied here (SPEC §7). Demo data only when SEED_DEMO=true (refused in production).
 */
export async function prepareDatabase(ctx: AppContext): Promise<void> {
  await migrate(ctx.db);
  await seedBase(ctx.db, ctx.content, { includeDevUsers: ctx.config.authMode === 'dev' });
  if (ctx.config.seedDemo) {
    const today = localDateInZone(ctx.clock.now(), ctx.calendar.timezone);
    await seedDemo(ctx.db, ctx.content, openMissionCount(today, ctx.calendar));
  }
}

/** Test-only: wipe personal data and restore seed + demo state (used by e2e tests). */
export async function resetDatabase(ctx: AppContext): Promise<void> {
  await ctx.db.exec(`
    TRUNCATE board_pieces, completions, users RESTART IDENTITY CASCADE;
    UPDATE campaign_state SET unlocked_pieces = 0, updated_at = now() WHERE id = 1;
  `);
  await prepareDatabase(ctx);
}
