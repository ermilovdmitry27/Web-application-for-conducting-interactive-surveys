const fs = require("fs");
const path = require("path");
const { defineConfig } = require("@playwright/test");

const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH || "/snap/bin/chromium";
const launchOptions = {
  args: ["--no-sandbox"],
};

if (fs.existsSync(chromiumPath)) {
  launchOptions.executablePath = chromiumPath;
}

module.exports = defineConfig({
  testDir: path.join(__dirname, "e2e"),
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    headless: true,
    screenshot: "only-on-failure",
    trace: "on-first-retry",
    launchOptions,
  },
  webServer: {
    command: "npm run preview:e2e",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
