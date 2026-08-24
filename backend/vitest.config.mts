import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // src/config.ts parses DATABASE_URL at import time (new URL(raw)), which
    // throws on the empty string a bare test run would otherwise see — every
    // service module transitively imports config.ts, so this has to be set
    // before any test file's imports run, not inside a setup file.
    env: {
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    },
  },
});
