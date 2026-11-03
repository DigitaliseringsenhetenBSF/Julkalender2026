import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { progressSchema } from '../../src/shared/contract.ts';
import { body, createUsers, signIn, startTestServer, type TestServer } from './helpers.ts';

// Note: PGlite executes one query at a time, so this proves the transaction logic and the
// idempotency constraint, not true Postgres parallelism. Re-run against PostgreSQL in staging.

let server: TestServer;
beforeAll(async () => {
  server = await startTestServer({ today: '2026-12-10' });
});
afterAll(() => server.close());

describe('concurrent tick-offs', () => {
  it('N parallel tick-offs from different users give exactly N completions', async () => {
    const N = 30;
    const cookies = await createUsers(server, N);
    const responses = await Promise.all(
      cookies.map((cookie) =>
        server.app.inject({
          method: 'POST',
          url: '/api/completions',
          payload: { day: 4 },
          headers: { cookie },
        }),
      ),
    );
    expect(responses.every((r) => r.statusCode === 200)).toBe(true);

    const progress = body(
      progressSchema,
      await server.app.inject({
        method: 'GET',
        url: '/api/progress',
        headers: { cookie: cookies[0] },
      }),
    );
    expect(progress.totalCompletions).toBe(N);
    expect(progress.unlockedPieces).toBe(2);
  });

  it('parallel double clicks and tabs from one user count once', async () => {
    const cookie = await signIn(server, 2);
    const before = body(
      progressSchema,
      await server.app.inject({ method: 'GET', url: '/api/progress', headers: { cookie } }),
    ).totalCompletions;

    await Promise.all(
      Array.from({ length: 10 }, () =>
        server.app.inject({
          method: 'POST',
          url: '/api/completions',
          payload: { day: 7 },
          headers: { cookie },
        }),
      ),
    );

    const after = body(
      progressSchema,
      await server.app.inject({ method: 'GET', url: '/api/progress', headers: { cookie } }),
    );
    expect(after.totalCompletions).toBe(before + 1);
    expect(after.mine.completed).toBe(1);
  });
});
