import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { countPersonalData, purgePersonalData } from '../../src/data/gdpr.ts';
import { createUsers, signIn, startTestServer, type TestServer } from './helpers.ts';

let server: TestServer;
beforeAll(async () => {
  server = await startTestServer({ today: '2026-12-10' });
});
afterAll(() => server.close());

describe('GDPR purge', () => {
  it('deletes all personal data but keeps anonymous totals and unlocked pieces', async () => {
    const cookies = [...(await createUsers(server, 15)), await signIn(server, 0)];
    for (const cookie of cookies) {
      await server.app.inject({
        method: 'POST',
        url: '/api/completions',
        payload: { day: 2 },
        headers: { cookie },
      });
    }
    await server.app.inject({ method: 'GET', url: '/api/board', headers: { cookie: cookies[0] } });
    await server.app.inject({
      method: 'POST',
      url: '/api/openings',
      payload: { day: 1 },
      headers: { cookie: cookies[0] },
    });

    const before = await countPersonalData(server.ctx.db);
    expect(before.completions).toBe(16);
    expect(before.boardPieces).toBe(1);
    expect(before.openings).toBe(1);

    await purgePersonalData(server.ctx.db);

    expect(await countPersonalData(server.ctx.db)).toEqual({
      users: 0,
      completions: 0,
      openings: 0,
      boardPieces: 0,
    });
    const summary = await server.ctx.db.query<{ day: number; completions: number }>(
      'SELECT day::int AS day, completions FROM campaign_summary WHERE completions > 0',
    );
    expect(summary).toEqual([{ day: 2, completions: 16 }]);
    const [state] = await server.ctx.db.query<{ unlocked: number }>(
      'SELECT unlocked_pieces AS unlocked FROM campaign_state',
    );
    expect(state?.unlocked).toBe(1);

    // Old sessions no longer resolve to a user.
    const me = await server.app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { cookie: cookies[0] },
    });
    expect(me.statusCode).toBe(401);
  });
});
