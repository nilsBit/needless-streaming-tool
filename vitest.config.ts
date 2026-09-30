import { defineConfig } from 'vitest/config';

// Standalone config — deliberately NOT extending vite.config.ts, which is set up
// for the React renderer. Tests run against the Express server in plain Node.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    // Binds every test server to loopback, so no other program on the machine
    // can take its port away — see setup/loopback.ts.
    setupFiles: ['./src/server/__tests__/setup/loopback.ts'],
  },
});
