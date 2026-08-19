import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: { ...devices["iPhone 13"], browserName: "chromium", baseURL: "http://127.0.0.1:4173/google-home/", serviceWorkers: "allow" },
  webServer: {
    command: "npm run build && npm run preview -- --host 127.0.0.1",
    port: 4173,
    reuseExistingServer: false,
  },
});
