import { defineConfig } from 'vitest/config';

// Standalone config — deliberately NOT extending vite.config.ts, which is set up
// for the React renderer. Tests run against the Express server in plain Node.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
  },
});
