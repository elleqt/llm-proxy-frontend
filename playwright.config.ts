import { defineConfig, devices } from "@playwright/test";

// End-to-end tests against a running stack (see scripts/e2e-stack.sh, which
// brings one up and sets these). Files are `*.e2e.ts`, so Vitest never picks them up.
//   E2E_BASE_URL       the frontend, default http://localhost:8081
//   E2E_CHROMIUM_PATH  a Chromium/Chrome binary to use instead of Playwright's own
export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.e2e.ts",
  // One stack, one bootstrap administrator: the flows build on each other.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  outputDir: "test-results",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: process.env.E2E_BASE_URL || "http://localhost:8081",
    locale: "en-US",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: process.env.E2E_CHROMIUM_PATH ? { executablePath: process.env.E2E_CHROMIUM_PATH } : {},
  },
});
