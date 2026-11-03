/**
 * The server's notion of "now". The client clock is never trusted (SPEC §5.1).
 * Date simulation (FAKE_TODAY) is only possible because config refuses it in production.
 */
export interface Clock {
  now(): Date;
  /** True when time is simulated; the UI then shows a banner. */
  readonly simulated: boolean;
}

export const systemClock: Clock = { now: () => new Date(), simulated: false };

export function fixedClock(instant: Date): Clock {
  return { now: () => new Date(instant), simulated: true };
}

/**
 * Parses FAKE_TODAY. A bare date (YYYY-MM-DD) means 12:00 UTC that day, which is the same
 * calendar date in Stockholm all year. A full ISO timestamp is used as-is, which makes it
 * possible to test the 23:59 → 00:00 boundaries by hand.
 */
export function clockFromFakeToday(value: string | undefined): Clock {
  if (!value) return systemClock;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00Z` : value;
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) {
    throw new Error(`FAKE_TODAY is not a valid date or ISO timestamp: "${value}"`);
  }
  return fixedClock(instant);
}
