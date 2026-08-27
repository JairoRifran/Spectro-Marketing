import { defineConfig, devices } from "@playwright/test";

const demoWebServerEnv = process.env.TEST_ENVIRONMENT === "true"
  ? undefined
  : { DEMO_MODE: "true", NEXT_PUBLIC_DEMO_MODE: "true", AUTOMATION_ENABLED: "false" };

export default defineConfig({
  testDir: "./tests/e2e", fullyParallel: false, retries: process.env.CI ? 2 : 0,
  use: { baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000", trace: "on-first-retry" },
  webServer: { command: "pnpm dev", url: "http://localhost:3000", reuseExistingServer: !process.env.CI, env: demoWebServerEnv },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
