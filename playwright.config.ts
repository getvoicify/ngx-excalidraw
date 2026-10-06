import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env['E2E_PORT'] ?? 4310);
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  reporter: process.env['CI'] ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build:demo && node dist/demo/server/server.mjs',
    url: baseURL,
    env: { PORT: String(port) },
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000,
  },
});
