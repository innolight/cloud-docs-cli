import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      thresholds: {
        statements: 90,
        branches: 85,
        functions: 82,
        lines: 92,
      },
    },
  },
});
