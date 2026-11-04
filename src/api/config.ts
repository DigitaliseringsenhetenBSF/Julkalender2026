import { isAbsolute, join } from 'node:path';
import { z } from 'zod';
import { ROOT_DIR } from '../data/paths.ts';

/**
 * Runtime configuration from environment variables (documented in .env.example).
 * Safety rules are enforced here, at start-up, so a misconfigured production server never runs:
 * no date simulation, no dev sign-in, no demo data, real secrets and a real database.
 */

export type AppEnv = 'development' | 'test' | 'staging' | 'production';

/**
 * Who identifies the person (SPEC §8):
 * - `dev`: the test-user picker; refused in production.
 * - `portal`: Verktygsportalen's login. The portal proxies the calendar under BASE_PATH and
 *   vouches for the signed-in person in request headers, authenticated by PORTAL_KEY.
 */
export type AuthMode = 'dev' | 'portal';

export interface AppConfig {
  appEnv: AppEnv;
  port: number;
  host: string;
  databaseUrl: string | undefined;
  pgliteDir: string;
  sessionSecret: string;
  secureCookies: boolean;
  authMode: AuthMode;
  /** The shared secret the portal's proxy sends; set only in portal mode. */
  portalKey: string | undefined;
  /** The path the app is served under, '' at the root or e.g. '/julkalender' (no trailing slash). */
  basePath: string;
  fakeToday: string | undefined;
  seedDemo: boolean;
}

const DEV_SESSION_SECRET = 'development-only-session-secret-do-not-use-in-staging';
const MIN_SECRET_LENGTH = 32;
const BASE_PATH_PATTERN = /^(\/[a-z0-9-]+)+$/;

// Treat empty strings (e.g. "DATABASE_URL=" in .env) as unset.
const optionalString = z.preprocess((v) => (v === '' ? undefined : v), z.string().optional());

const envSchema = z.object({
  APP_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: optionalString,
  DATABASE_URL: optionalString,
  PGLITE_DIR: optionalString,
  SESSION_SECRET: optionalString,
  AUTH_MODE: z.enum(['dev', 'portal']).default('dev'),
  PORTAL_KEY: optionalString,
  BASE_PATH: optionalString,
  FAKE_TODAY: optionalString,
  SEED_DEMO: optionalString,
});

export class ConfigError extends Error {
  override name = 'ConfigError';
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new ConfigError(`Invalid environment: ${z.prettifyError(parsed.error)}`);
  }
  const e = parsed.data;
  const isLocal = e.APP_ENV === 'development' || e.APP_ENV === 'test';
  const isProduction = e.APP_ENV === 'production';
  const seedDemo = e.SEED_DEMO === 'true';

  if (isProduction && e.FAKE_TODAY) {
    throw new ConfigError('FAKE_TODAY (date simulation) is not allowed in production.');
  }
  if (isProduction && seedDemo) {
    throw new ConfigError('SEED_DEMO is not allowed in production.');
  }
  if (isProduction && e.AUTH_MODE === 'dev') {
    throw new ConfigError(
      'AUTH_MODE=dev is not allowed in production. Run behind Verktygsportalen with AUTH_MODE=portal.',
    );
  }
  // The key is what makes a portal header trustworthy, so portal mode never runs without one,
  // not even locally: an open portal mode would let anyone claim any identity.
  if (e.AUTH_MODE === 'portal' && (!e.PORTAL_KEY || e.PORTAL_KEY.length < MIN_SECRET_LENGTH)) {
    throw new ConfigError(
      `PORTAL_KEY of at least ${MIN_SECRET_LENGTH} characters is required when AUTH_MODE=portal.`,
    );
  }
  if (e.BASE_PATH && !BASE_PATH_PATTERN.test(e.BASE_PATH)) {
    throw new ConfigError(
      'BASE_PATH must be empty or a path such as /julkalender (lower-case letters, digits and hyphens, no trailing slash).',
    );
  }
  if (!isLocal && !e.DATABASE_URL) {
    throw new ConfigError(`DATABASE_URL is required when APP_ENV=${e.APP_ENV}.`);
  }
  if (!isLocal && (!e.SESSION_SECRET || e.SESSION_SECRET.length < MIN_SECRET_LENGTH)) {
    throw new ConfigError(
      `SESSION_SECRET of at least ${MIN_SECRET_LENGTH} characters is required when APP_ENV=${e.APP_ENV}.`,
    );
  }

  const pgliteDir = e.PGLITE_DIR ?? '.data/pglite';
  return {
    appEnv: e.APP_ENV,
    port: e.PORT,
    // Bind to localhost on developer machines; hosts like Render need all interfaces.
    host: e.HOST ?? (isLocal ? '127.0.0.1' : '0.0.0.0'),
    databaseUrl: e.DATABASE_URL,
    pgliteDir:
      pgliteDir.startsWith('memory://') || isAbsolute(pgliteDir)
        ? pgliteDir
        : join(ROOT_DIR, pgliteDir),
    sessionSecret: e.SESSION_SECRET ?? DEV_SESSION_SECRET,
    secureCookies: !isLocal,
    authMode: e.AUTH_MODE,
    portalKey: e.AUTH_MODE === 'portal' ? e.PORTAL_KEY : undefined,
    basePath: e.BASE_PATH ?? '',
    fakeToday: e.FAKE_TODAY,
    seedDemo,
  };
}
