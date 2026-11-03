import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../../src/api/config.ts';
import { errorResponse, meResponse } from '../../src/shared/contract.ts';
import { body, signIn, startTestServer, type TestServer } from './helpers.ts';

let server: TestServer;
beforeAll(async () => {
  server = await startTestServer();
});
afterAll(() => server.close());

describe('authentication', () => {
  it.each([
    ['GET', '/api/me'],
    ['GET', '/api/calendar'],
    ['GET', '/api/progress'],
    ['GET', '/api/board'],
    ['GET', '/api/pieces/1/image'],
    ['DELETE', '/api/completions/1'],
  ] as const)('rejects %s %s without a session', async (method, url) => {
    const response = await server.app.inject({ method, url });
    expect(response.statusCode).toBe(401);
    expect(body(errorResponse, response).error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects a POST without a session', async () => {
    const response = await server.app.inject({
      method: 'POST',
      url: '/api/completions',
      payload: { day: 1 },
    });
    expect(response.statusCode).toBe(401);
  });

  it('rejects a forged (unsigned) session cookie', async () => {
    const response = await server.app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { cookie: 'mjk_session=1' },
    });
    expect(response.statusCode).toBe(401);
  });

  it('signs in a test user with the dev provider', async () => {
    const cookie = await signIn(server, 0);
    const response = await server.app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(body(meResponse, response)).toMatchObject({
      user: { displayName: 'Testanvändare 1', role: 'user' },
      authMode: 'dev',
    });
  });

  it('only allows seeded test identities in dev sign-in', async () => {
    const [row] = await server.ctx.db.query<{ id: number }>(
      `INSERT INTO users (external_id, display_name) VALUES ('entra:someone', 'Real Person')
       RETURNING id`,
    );
    const response = await server.app.inject({
      method: 'POST',
      url: '/api/dev-auth/login',
      payload: { userId: row?.id },
    });
    expect(response.statusCode).toBe(404);
  });

  it('validates the sign-in body', async () => {
    const response = await server.app.inject({
      method: 'POST',
      url: '/api/dev-auth/login',
      payload: { userId: 'abc' },
    });
    expect(response.statusCode).toBe(400);
    expect(body(errorResponse, response).error.code).toBe('VALIDATION_ERROR');
  });

  it('clears the session on logout', async () => {
    const response = await server.app.inject({ method: 'POST', url: '/api/auth/logout' });
    expect(response.statusCode).toBe(204);
    expect(String(response.headers['set-cookie'])).toContain('mjk_session=;');
  });

  it('answers the health check without a session', async () => {
    const response = await server.app.inject({ method: 'GET', url: '/health' });
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('returns a JSON 404 for unknown API routes', async () => {
    const response = await server.app.inject({ method: 'GET', url: '/api/nope' });
    expect(response.statusCode).toBe(404);
    expect(body(errorResponse, response).error.code).toBe('NOT_FOUND');
  });
});

describe('production safety (config)', () => {
  const production = {
    APP_ENV: 'production',
    DATABASE_URL: 'postgres://x',
    SESSION_SECRET: 'x'.repeat(40),
  };

  it('refuses dev sign-in in production', () => {
    expect(() => loadConfig({ ...production, AUTH_MODE: 'dev' })).toThrow(ConfigError);
  });

  it('refuses date simulation in production', () => {
    expect(() => loadConfig({ ...production, FAKE_TODAY: '2026-12-10' })).toThrow(/FAKE_TODAY/);
  });

  it('requires a database and a strong secret outside development', () => {
    expect(() => loadConfig({ APP_ENV: 'staging', SESSION_SECRET: 'x'.repeat(40) })).toThrow(
      /DATABASE_URL/,
    );
    expect(() =>
      loadConfig({ APP_ENV: 'staging', DATABASE_URL: 'postgres://x', SESSION_SECRET: 'short' }),
    ).toThrow(/SESSION_SECRET/);
  });

  it('allows date simulation and dev sign-in in staging', () => {
    const config = loadConfig({
      APP_ENV: 'staging',
      DATABASE_URL: 'postgres://x',
      SESSION_SECRET: 'x'.repeat(40),
      FAKE_TODAY: '2026-12-10',
    });
    expect(config).toMatchObject({ authMode: 'dev', fakeToday: '2026-12-10', secureCookies: true });
  });
});
