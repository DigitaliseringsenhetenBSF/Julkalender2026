import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  PORTAL_KEY_HEADER,
  PORTAL_NAME_HEADER,
  PORTAL_USER_HEADER,
  nameFromEmail,
} from '../../src/api/auth/portalAuth.ts';
import {
  boardResponse,
  calendarResponse,
  errorResponse,
  meResponse,
} from '../../src/shared/contract.ts';
import { body, startTestServer, type TestServer } from './helpers.ts';

/**
 * AUTH_MODE=portal under a base path (SPEC §8): the portal's proxy vouches for the person in
 * headers authenticated by the shared key; there is no cookie and no test-user picker.
 */
const KEY = 'portal-test-key-'.padEnd(40, 'x');
const BASE = '/julkalender';
const ANNA = 'Anna.Andersson@skola.lund.se';

function asPortal(email: string, name?: string) {
  const headers: Record<string, string> = { [PORTAL_KEY_HEADER]: KEY, [PORTAL_USER_HEADER]: email };
  if (name !== undefined) headers[PORTAL_NAME_HEADER] = encodeURIComponent(name);
  return headers;
}

describe('portal mode', () => {
  let server: TestServer;
  let webDistDir: string;

  beforeAll(async () => {
    // A minimal "web build", so the page fallback can be checked.
    webDistDir = mkdtempSync(join(tmpdir(), 'mjk-web-'));
    writeFileSync(join(webDistDir, 'index.html'), '<!doctype html><title>test</title>');
    server = await startTestServer({
      env: { AUTH_MODE: 'portal', PORTAL_KEY: KEY, BASE_PATH: BASE },
      webDistDir,
    });
  });

  afterAll(() => server.close());

  it('identifies the person from the portal headers and keeps their id', async () => {
    const first = await server.app.inject({
      method: 'GET',
      url: `${BASE}/api/me`,
      headers: asPortal(ANNA, 'Anna Åkesson-Andersson'),
    });
    expect(first.statusCode).toBe(200);
    const me = body(meResponse, first);
    expect(me.authMode).toBe('portal');
    expect(me.user.displayName).toBe('Anna Åkesson-Andersson');
    expect(me.user.role).toBe('user');
    expect(first.headers['set-cookie']).toBeUndefined();

    // The same address again, however it is cased: the same person, with a new name applied.
    const again = await server.app.inject({
      method: 'GET',
      url: `${BASE}/api/me`,
      headers: asPortal(ANNA.toUpperCase(), 'Anna Andersson'),
    });
    const me2 = body(meResponse, again);
    expect(me2.user.id).toBe(me.user.id);
    expect(me2.user.displayName).toBe('Anna Andersson');

    const [row] = await server.ctx.db.query<{ external_id: string; n: number }>(
      `SELECT external_id, (SELECT count(*)::int FROM users) AS n FROM users WHERE id = $1`,
      [me.user.id],
    );
    expect(row?.external_id).toBe('portal:anna.andersson@skola.lund.se');
    expect(row?.n).toBe(1); // no dev users are seeded in portal mode
  });

  it('makes a name from the address when the portal sent none, and survives a broken one', async () => {
    const noName = await server.app.inject({
      method: 'GET',
      url: `${BASE}/api/me`,
      headers: asPortal('bo.b-larsson@lund.se'),
    });
    expect(body(meResponse, noName).user.displayName).toBe('Bo B Larsson');
    expect(nameFromEmail('x@y')).toBe('X');

    const broken = await server.app.inject({
      method: 'GET',
      url: `${BASE}/api/me`,
      headers: { ...asPortal('cia@lund.se'), [PORTAL_NAME_HEADER]: '%E0%A4%A' },
    });
    expect(body(meResponse, broken).user.displayName).toBe('Cia');
  });

  it('refuses a request without the key, with a wrong key, or without a person', async () => {
    const cases: [Record<string, string>, string][] = [
      [{ [PORTAL_USER_HEADER]: ANNA }, 'UNAUTHENTICATED'],
      [
        { [PORTAL_KEY_HEADER]: 'wrong'.padEnd(40, 'x'), [PORTAL_USER_HEADER]: ANNA },
        'UNAUTHENTICATED',
      ],
      [{ [PORTAL_KEY_HEADER]: KEY }, 'PORTAL_SIGN_IN'],
      [{ [PORTAL_KEY_HEADER]: KEY, [PORTAL_USER_HEADER]: 'not-an-address' }, 'PORTAL_SIGN_IN'],
    ];
    for (const [headers, code] of cases) {
      const res = await server.app.inject({ method: 'GET', url: `${BASE}/api/calendar`, headers });
      expect(res.statusCode, JSON.stringify(headers)).toBe(401);
      expect(body(errorResponse, res).error.code, JSON.stringify(headers)).toBe(code);
    }
  });

  it('has no test-user picker', async () => {
    for (const url of [`${BASE}/api/dev-auth/users`, '/api/dev-auth/users']) {
      const res = await server.app.inject({ method: 'GET', url });
      expect(res.statusCode, url).toBe(404);
    }
    const login = await server.app.inject({
      method: 'POST',
      url: `${BASE}/api/dev-auth/login`,
      payload: { userId: 1 },
    });
    expect(login.statusCode).toBe(404);
  });

  it('serves everything under the base path, and the health check at the root', async () => {
    const calendar = await server.app.inject({
      method: 'GET',
      url: `${BASE}/api/calendar`,
      headers: asPortal(ANNA),
    });
    expect(calendar.statusCode).toBe(200);
    expect(body(calendarResponse, calendar).missions).toHaveLength(24);

    const tick = await server.app.inject({
      method: 'POST',
      url: `${BASE}/api/completions`,
      headers: asPortal(ANNA),
      payload: { day: 1 },
    });
    expect(tick.statusCode).toBe(200);

    const board = await server.app.inject({
      method: 'GET',
      url: `${BASE}/api/board`,
      headers: asPortal(ANNA),
    });
    // Piece images are addressed under the base path too (the browser asks for them as given).
    for (const piece of body(boardResponse, board).pieces) {
      expect(piece.image.startsWith(`${BASE}/api/pieces/`)).toBe(true);
    }

    expect(
      (await server.app.inject({ method: 'GET', url: `${BASE}/icons/lucka-01.svg` })).statusCode,
    ).toBe(200);
    expect(
      (await server.app.inject({ method: 'GET', url: '/icons/lucka-01.svg' })).statusCode,
    ).toBe(404);
    expect((await server.app.inject({ method: 'GET', url: '/api/calendar' })).statusCode).toBe(404);
    expect((await server.app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
  });

  it('serves the web app under the base path with the page fallback', async () => {
    const index = await server.app.inject({ method: 'GET', url: `${BASE}/` });
    expect(index.statusCode).toBe(200);
    expect(index.headers['content-type']).toContain('text/html');
    const deep = await server.app.inject({ method: 'GET', url: `${BASE}/nagon/sida` });
    expect(deep.statusCode).toBe(200);
    expect(deep.headers['content-type']).toContain('text/html');
    const missingApi = await server.app.inject({ method: 'GET', url: `${BASE}/api/nothing` });
    expect(missingApi.statusCode).toBe(404);
    expect(body(errorResponse, missingApi).error.code).toBe('NOT_FOUND');
    const outside = await server.app.inject({ method: 'GET', url: '/' });
    expect(outside.statusCode).toBe(404);
  });
});
