/**
 * Calendar rules: which luckor are open on a given day, and which campaign phase we are in.
 * See docs/SPEC.md §5.1. Pure functions – the caller supplies "now" (the server clock).
 */

export interface CalendarConfig {
  /** IANA time zone that defines "today", e.g. "Europe/Stockholm". */
  timezone: string;
  /** Date the first lucka opens (YYYY-MM-DD). */
  firstMissionDate: string;
  /** Number of luckor/uppdrag. */
  totalMissions: number;
  /** Last date (inclusive) on which tick-offs are accepted (YYYY-MM-DD). */
  lastTickOffDate: string;
}

/** ISO calendar date, YYYY-MM-DD. String comparison equals chronological comparison. */
export type IsoDate = string;

export type CampaignPhase = 'before' | 'active' | 'catch_up' | 'closed';
export type MissionStatus = 'locked' | 'open' | 'today';

const MS_PER_DAY = 86_400_000;

/**
 * The calendar date of `instant` as seen on a wall clock in `timeZone`.
 * Uses Intl so the conversion follows the zone's real UTC offset (incl. DST), never the
 * machine's local zone.
 */
export function localDateInZone(instant: Date, timeZone: string): IsoDate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function toUtcMidnight(date: IsoDate): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1);
}

/** Whole days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtcMidnight(to) - toUtcMidnight(from)) / MS_PER_DAY);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return new Date(toUtcMidnight(date) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/** The date lucka `day` (1-based) opens. */
export function missionOpenDate(day: number, config: CalendarConfig): IsoDate {
  return addDays(config.firstMissionDate, day - 1);
}

export function lastMissionDate(config: CalendarConfig): IsoDate {
  return missionOpenDate(config.totalMissions, config);
}

/** How many luckor are open on `today` (0 before the first, all after the last). */
export function openMissionCount(today: IsoDate, config: CalendarConfig): number {
  const elapsed = daysBetween(config.firstMissionDate, today) + 1;
  return Math.max(0, Math.min(config.totalMissions, elapsed));
}

export function campaignPhase(today: IsoDate, config: CalendarConfig): CampaignPhase {
  if (today < config.firstMissionDate) return 'before';
  if (today > config.lastTickOffDate) return 'closed';
  if (today > lastMissionDate(config)) return 'catch_up';
  return 'active';
}

export function isCampaignClosed(today: IsoDate, config: CalendarConfig): boolean {
  return campaignPhase(today, config) === 'closed';
}

export function isMissionOpen(day: number, today: IsoDate, config: CalendarConfig): boolean {
  return day >= 1 && day <= openMissionCount(today, config);
}

export function missionStatus(day: number, today: IsoDate, config: CalendarConfig): MissionStatus {
  if (!isMissionOpen(day, today, config)) return 'locked';
  return missionOpenDate(day, config) === today ? 'today' : 'open';
}

export type TickOffDecision = 'ok' | 'mission_locked' | 'campaign_closed';

/** Whether a tick-off (or un-tick) of lucka `day` is allowed on `today`. */
export function canChangeCompletion(
  day: number,
  today: IsoDate,
  config: CalendarConfig,
): TickOffDecision {
  if (isCampaignClosed(today, config)) return 'campaign_closed';
  if (!isMissionOpen(day, today, config)) return 'mission_locked';
  return 'ok';
}
