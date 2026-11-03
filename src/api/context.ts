import type { CalendarConfig } from '../domain/calendar.ts';
import type { PieceRules } from '../data/completions.ts';
import type { Content } from '../data/content.ts';
import type { Db } from '../data/db.ts';
import type { Clock } from './clock.ts';
import type { AppConfig } from './config.ts';

/** Everything route handlers need, injected so tests can swap the clock, DB and randomness. */
export interface AppContext {
  config: AppConfig;
  db: Db;
  content: Content;
  clock: Clock;
  random: () => number;
  calendar: CalendarConfig;
  rules: PieceRules;
}
