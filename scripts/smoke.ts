/**
 * Smoke verification against a running server (local or staging).
 *   npm run smoke -- http://localhost:3000
 *   npm run smoke -- https://<staging>.onrender.com
 * Checks /health and the page, then – when dev sign-in is available – signs in as a test user,
 * ticks off an open lucka and verifies the shared counter and piece formula.
 */
import {
  calendarResponse,
  completionResponse,
  devUsersResponse,
  healthResponse,
  progressSchema,
} from '../src/shared/contract.ts';

const base = (process.argv[2] ?? process.env.SMOKE_URL ?? 'http://localhost:3000').replace(
  /\/$/,
  '',
);
let cookie = '';
let failed = false;

function check(ok: boolean, label: string, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` – ${detail}` : ''}`);
  if (!ok) failed = true;
}

async function call(path: string, init: RequestInit = {}) {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), ...(cookie ? { cookie } : {}) },
  });
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0] ?? '';
  return response;
}

const health = await call('/health');
check(health.ok && healthResponse.parse(await health.json()).status === 'ok', 'GET /health');

const page = await call('/');
const html = await page.text();
check(page.ok && html.includes('<div id="root">'), 'GET / serves the app');

const devUsers = await call('/api/dev-auth/users');
if (devUsers.status === 404) {
  console.log('SKIP  tick-off check (dev sign-in disabled – use a real test account manually)');
} else {
  const { users } = devUsersResponse.parse(await devUsers.json());
  const user = users.find((u) => u.role === 'user');
  if (!user) throw new Error('No test user available');
  const login = await call('/api/dev-auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: user.id }),
  });
  check(login.ok, `sign in as ${user.displayName}`);

  const calendar = calendarResponse.parse(await (await call('/api/calendar')).json());
  const open = calendar.missions.filter((m) => m.status !== 'locked');
  console.log(`INFO  today=${calendar.today} phase=${calendar.phase} open luckor=${open.length}`);

  if (open.length === 0 || calendar.phase === 'closed') {
    console.log('SKIP  tick-off check (no lucka open – set FAKE_TODAY in staging to test)');
  } else {
    const before = progressSchema.parse(await (await call('/api/progress')).json());
    const target = open.find((m) => !m.completed) ?? open[0];
    if (!target) throw new Error('unreachable');
    const tick = await call('/api/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ day: target.day }),
    });
    const result = completionResponse.parse(await tick.json());
    const expectedTotal = before.totalCompletions + (target.completed ? 0 : 1);
    check(
      result.progress.totalCompletions === expectedTotal,
      `tick off lucka ${target.day}`,
      `total ${before.totalCompletions} → ${result.progress.totalCompletions}`,
    );
    const formula = Math.min(
      Math.floor(result.progress.totalCompletions / result.progress.completionsPerPiece),
      result.progress.totalPieces,
    );
    check(
      result.progress.unlockedPieces >= formula &&
        result.progress.unlockedPieces >= before.unlockedPieces,
      'pieces follow the formula and never decrease',
      `${result.progress.unlockedPieces} unlocked`,
    );
  }
}

console.log(failed ? '\nSmoke verification FAILED' : '\nSmoke verification passed');
process.exit(failed ? 1 : 0);
