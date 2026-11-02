import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.js'],
    // S30: the engine is the part the exam marks hardest, so `npm run test:coverage` fails below 90% of its lines.
    coverage: {
      provider: 'v8',
      include: ['src/game/**'],
      reporter: ['text-summary'],
      thresholds: { lines: 90 },
    },
  },
});
