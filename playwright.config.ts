import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: {
    timeout: 7_500
  },
  use: {
    baseURL: "http://127.0.0.1:3000",
    browserName: "chromium",
    channel: "msedge",
    trace: "retain-on-failure"
  },
  projects: [
    {
      name: "edge-desktop",
      use: { ...devices["Desktop Edge"] }
    }
  ],
  webServer: {
    command: "npm run serve:out",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: true,
    timeout: 30_000
  }
});
