import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 4410);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  // One retry, reported as "flaky" (never hidden), so a failure can be re-run with a trace.
  retries: 1,
  timeout: 240_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    // Uses the installed Microsoft Edge so no browser download is needed. Set E2E_CHANNEL=chromium to use Playwright's bundle.
    channel: process.env.E2E_CHANNEL === 'chromium' ? undefined : (process.env.E2E_CHANNEL ?? 'msedge'),
    // Journeys run with reduced motion: 3D scenes render on demand instead of continuously, which keeps headless
    // software-WebGL from starving the server of CPU. Full-motion 3D is covered in a-new-user and resilience specs.
    reducedMotion: 'reduce',
    // Tracing makes multi-user journeys 4-5x slower with software WebGL (Journey I: 19 s untraced vs ~90 s traced),
    // so traces are recorded only on the retry of a failed test.
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Edge'], viewport: { width: 1366, height: 900 } }, testIgnore: [/mobile\.spec/, /g-wedding\.spec/] },
    // The four-user wedding journey runs in its own project (fresh worker + browser): after ~15 min of software-WebGL
    // work in one headless browser it intermittently stalled loading a route chunk, while passing alone and after E/F.
    { name: 'desktop-isolated', use: { ...devices['Desktop Edge'], viewport: { width: 1366, height: 900 } }, testMatch: /g-wedding\.spec/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec/ },
  ],
  webServer: {
    command: 'npx tsx scripts/e2e-server.ts',
    url: `http://127.0.0.1:${PORT}/api/health`,
    timeout: 180_000,
    reuseExistingServer: false,
    stdout: 'pipe',
  },
});
