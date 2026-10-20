import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.js'],
    // One shared emulator, so test files must not run in parallel.
    fileParallelism: false,
  },
});
