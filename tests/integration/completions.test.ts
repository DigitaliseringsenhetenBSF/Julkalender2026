import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  calendarResponse,
  completionResponse,
  errorResponse,
  progressSchema,
} from '../../src/shared/contract.ts';
import { body, createUsers, signIn, startTestServer, type TestServer } from './helpers.ts';

let server: TestServer;
let cookie: string;

beforeEach(async () => {
  server = await startTestServer({ today: '2026-12-10' });
  cookie = await signIn(server, 0);
});
afterEach(() => server.close());

const tick = (day: number, as = cookie) =>
  server.app.inject({
    method: 'POST',
    url: '/api/completions',
    payload: { day },
    headers: { cookie: as },
  });
const untick = (day: number, as = cookie) =>
  server.app.inject({ method: 'DELETE', url: `/api/completions/${day}`, headers: { cookie: as } });
const get = (url: string, as = cookie) =>
  server.app.inject({ method: 'GET', url, headers: { cookie: as } });

describe('GET /api/calendar', () => {
  it('shows 24 luckor with today highlighted and future content hidden', async () => {
    const calendar = body(calendarResponse, await get('/api/calendar'));
    expect(calendar).toMatchObject({ today: '2026-12-10', phase: 'active', simulated: true });
    expect(calendar.missions).toHaveLength(24);
    expect(calendar.missions[0]).toMatchObject({ day: 1, status: 'open', title: 'Uppdrag 1' });
    expect(calendar.missions[9]).toMatchObject({ day: 10, status: 'today', title: 'Uppdrag 10' });
    expect(calendar.missions[10]).toMatchObject({
      day: 11,
      status: 'locked',
      title: null,
      description: null,
      opensOn: '2026-12-11',
    });
  });

  it('follows the server clock across midnight', async () => {
    server.clock.set('2026-11-30T23:59:59+01:00');
    let calendar = body(calendarResponse, await get('/api/calendar'));
    expect(calendar.phase).toBe('before');
    expect(calendar.missions.every((m) => m.status === 'locked')).toBe(true);

    server.clock.set('2026-12-01T00:00:00+01:00');
    calendar = body(calendarResponse, await get('/api/calendar'));
    expect(calendar.missions[0]?.status).toBe('today');
  });
});

describe('POST /api/completions', () => {
  it('accepts today and earlier luckor', async () => {
    const today = await tick(10);
    expect(today.statusCode).toBe(200);
    expect(body(completionResponse, today)).toMatchObject({ day: 10, completed: true });
    expect((await tick(1)).statusCode).toBe(200);

    const calendar = body(calendarResponse, await get('/api/calendar'));
    expect(calendar.missions.filter((m) => m.completed).map((m) => m.day)).toEqual([1, 10]);
  });

  it('rejects future luckor in the API, not just the UI', async () => {
    const response = await tick(11);
    expect(response.statusCode).toBe(409);
    expect(body(errorResponse, response).error.code).toBe('MISSION_LOCKED');
  });

  it('rejects everything before 1 December', async () => {
    server.clock.set('2026-11-30T23:59:00+01:00');
    expect(body(errorResponse, await tick(1)).error.code).toBe('MISSION_LOCKED');
  });

  it('accepts catch-up until the close date and rejects after it', async () => {
    server.clock.set('2027-01-10T23:59:00+01:00');
    expect((await tick(24)).statusCode).toBe(200);
    server.clock.set('2027-01-11T00:00:00+01:00');
    const response = await tick(23);
    expect(response.statusCode).toBe(409);
    expect(body(errorResponse, response).error.code).toBe('CAMPAIGN_CLOSED');
    expect(body(errorResponse, await untick(24)).error.code).toBe('CAMPAIGN_CLOSED');
  });

  it('is idempotent – the same tick-off twice counts once', async () => {
    await tick(3);
    const second = body(completionResponse, await tick(3));
    expect(second.progress.totalCompletions).toBe(1);
    expect(second.newlyUnlockedPieces).toBe(0);
  });

  it('validates the day', async () => {
    expect((await tick(25)).statusCode).toBe(400);
    expect((await tick(0)).statusCode).toBe(400);
    const bad = await server.app.inject({
      method: 'POST',
      url: '/api/completions',
      payload: { day: 'tre' },
      headers: { cookie },
    });
    expect(body(errorResponse, bad).error.code).toBe('VALIDATION_ERROR');
  });
});

describe('pieces and un-tick', () => {
  it('unlocks a piece on every 15th completion and never takes it back', async () => {
    const colleagues = await createUsers(server, 15);
    for (const [i, c] of colleagues.slice(0, 14).entries()) {
      const r = body(completionResponse, await tick(1, c));
      expect(r.progress.totalCompletions).toBe(i + 1);
      expect(r.newlyUnlockedPieces).toBe(0);
    }
    const fifteenth = body(completionResponse, await tick(1, colleagues[14]));
    expect(fifteenth.newlyUnlockedPieces).toBe(1);
    expect(fifteenth.progress).toMatchObject({
      totalCompletions: 15,
      unlockedPieces: 1,
      remainingToNextPiece: 15,
    });

    // Un-tick: the total drops, the piece stays (high-water mark).
    const undone = body(completionResponse, await untick(1, colleagues[14]));
    expect(undone.completed).toBe(false);
    expect(undone.progress).toMatchObject({
      totalCompletions: 14,
      unlockedPieces: 1,
      remainingToNextPiece: 16,
    });

    // Re-ticking does not unlock a second piece.
    const again = body(completionResponse, await tick(1, colleagues[14]));
    expect(again.newlyUnlockedPieces).toBe(0);
    expect(again.progress.unlockedPieces).toBe(1);
  });

  it('un-ticking something never ticked is a harmless no-op', async () => {
    const response = await untick(5);
    expect(response.statusCode).toBe(200);
    expect(body(completionResponse, response).progress.totalCompletions).toBe(0);
  });

  it('rejects un-ticking a future lucka', async () => {
    expect(body(errorResponse, await untick(12)).error.code).toBe('MISSION_LOCKED');
  });
});

describe('GET /api/progress', () => {
  it('reports personal and collective statistics consistently', async () => {
    const other = await signIn(server, 1);
    await tick(1);
    await tick(2);
    await tick(2, other);

    const progress = body(progressSchema, await get('/api/progress'));
    expect(progress).toMatchObject({
      totalCompletions: 3,
      participants: 2,
      unlockedPieces: 0,
      totalPieces: 24,
      completionsPerPiece: 15,
      remainingToNextPiece: 12,
      mine: { completed: 2, possible: 10 },
    });
    expect(progress.perDay).toHaveLength(10);
    expect(progress.perDay.slice(0, 3)).toEqual([
      { day: 1, completions: 1 },
      { day: 2, completions: 2 },
      { day: 3, completions: 0 },
    ]);
  });
});
