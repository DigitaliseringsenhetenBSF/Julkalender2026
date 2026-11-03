import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import type { z } from 'zod';
import { buildApp } from '../../src/api/app.ts';
import { createContext, prepareDatabase } from '../../src/api/bootstrap.ts';
import type { Clock } from '../../src/api/clock.ts';
import { loadConfig } from '../../src/api/config.ts';
import type { AppContext } from '../../src/api/context.ts';
import { loadContent } from '../../src/data/content.ts';
import { createPgliteDb } from '../../src/data/db.ts';
import { mulberry32 } from '../../src/domain/unlockOrder.ts';
import { devUsersResponse } from '../../src/shared/contract.ts';

/** A clock the test can move: `clock.set('2026-12-10')`. */
export function testClock(initial: string): Clock & { set(value: string): void } {
  let instant = toInstant(initial);
  return {
    now: () => new Date(instant),
    simulated: true,
    set(value: string) {
      instant = toInstant(value);
    },
  };
}

function toInstant(value: string): Date {
  return new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00Z` : value);
}

export interface TestServer {
  app: FastifyInstance;
  ctx: AppContext;
  clock: ReturnType<typeof testClock>;
  close(): Promise<void>;
}

/** A fresh app on an in-memory PGlite database, migrated and seeded (no web build). */
export async function startTestServer(options: { today?: string } = {}): Promise<TestServer> {
  const config = loadConfig({ APP_ENV: 'test', PGLITE_DIR: 'memory://' });
  const db = await createPgliteDb('memory://');
  const clock = testClock(options.today ?? '2026-12-10');
  const ctx = createContext({ config, db, content: loadContent(), clock, random: mulberry32(42) });
  await prepareDatabase(ctx);
  const app = await buildApp(ctx, { webDistDir: '/nonexistent' });
  return {
    app,
    ctx,
    clock,
    async close() {
      await app.close();
      await db.close();
    },
  };
}

/** Signs in as the n-th seeded test user and returns the session cookie header. */
export async function signIn(server: TestServer, index = 0): Promise<string> {
  const list = devUsersResponse.parse(
    (await server.app.inject({ method: 'GET', url: '/api/dev-auth/users' })).json(),
  );
  const users = list.users.filter((u) => u.role === 'user');
  const user = users[index];
  if (!user) throw new Error(`No test user at index ${index}`);
  const response = await server.app.inject({
    method: 'POST',
    url: '/api/dev-auth/login',
    payload: { userId: user.id },
  });
  const setCookie = response.headers['set-cookie'];
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (!raw) throw new Error('No session cookie returned');
  return raw.split(';')[0] as string;
}

/** Creates extra users directly (for concurrency tests) and returns their session cookies. */
export async function createUsers(server: TestServer, count: number): Promise<string[]> {
  const cookies: string[] = [];
  for (let i = 0; i < count; i++) {
    const [row] = await server.ctx.db.query<{ id: number }>(
      `INSERT INTO users (external_id, display_name) VALUES ($1, $2) RETURNING id`,
      [`dev:extra-${i}`, `Extra ${i}`],
    );
    const response = await server.app.inject({
      method: 'POST',
      url: '/api/dev-auth/login',
      payload: { userId: row?.id },
    });
    const setCookie = response.headers['set-cookie'];
    const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    cookies.push((raw ?? '').split(';')[0] as string);
  }
  return cookies;
}

/** Parses a response body with a contract schema – fails the test on contract drift. */
export function body<T extends z.ZodType>(schema: T, response: LightMyRequestResponse): z.infer<T> {
  return schema.parse(response.json());
}
