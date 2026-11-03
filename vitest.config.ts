import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    environment: 'node',
    // PGlite boots a WASM Postgres per test file; give it time on slow machines.
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
