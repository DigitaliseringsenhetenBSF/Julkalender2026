import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../../src/api/config.ts';

const KEY = 'k'.repeat(32);
const PRODUCTION = {
  APP_ENV: 'production',
  DATABASE_URL: 'postgres://example',
  SESSION_SECRET: 's'.repeat(32),
};

describe('loadConfig', () => {
  it('defaults to dev sign-in at the root with no portal key', () => {
    const config = loadConfig({ APP_ENV: 'test' });
    expect(config.authMode).toBe('dev');
    expect(config.basePath).toBe('');
    expect(config.portalKey).toBeUndefined();
  });

  it('refuses dev sign-in in production, and accepts portal mode there', () => {
    expect(() => loadConfig({ ...PRODUCTION, AUTH_MODE: 'dev' })).toThrow(ConfigError);
    const config = loadConfig({
      ...PRODUCTION,
      AUTH_MODE: 'portal',
      PORTAL_KEY: KEY,
      BASE_PATH: '/julkalender',
    });
    expect(config.authMode).toBe('portal');
    expect(config.portalKey).toBe(KEY);
    expect(config.basePath).toBe('/julkalender');
  });

  it('never runs portal mode without a long enough key, locally included', () => {
    expect(() => loadConfig({ APP_ENV: 'development', AUTH_MODE: 'portal' })).toThrow(/PORTAL_KEY/);
    expect(() =>
      loadConfig({ APP_ENV: 'development', AUTH_MODE: 'portal', PORTAL_KEY: 'short' }),
    ).toThrow(/PORTAL_KEY/);
  });

  it('ignores a portal key in dev mode', () => {
    expect(loadConfig({ APP_ENV: 'test', PORTAL_KEY: KEY }).portalKey).toBeUndefined();
  });

  it('accepts only a clean base path', () => {
    for (const bad of ['julkalender', '/julkalender/', '/Jul', '/a b', '//x']) {
      expect(() => loadConfig({ APP_ENV: 'test', BASE_PATH: bad }), bad).toThrow(/BASE_PATH/);
    }
    expect(loadConfig({ APP_ENV: 'test', BASE_PATH: '/lab/jul-2026' }).basePath).toBe(
      '/lab/jul-2026',
    );
    expect(loadConfig({ APP_ENV: 'test', BASE_PATH: '' }).basePath).toBe('');
  });
});
