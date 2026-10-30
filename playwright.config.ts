import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  use: { channel: "chrome", baseURL: process.env.E2E_URL ?? "http://localhost:3100", locale: "de-DE", timezoneId: "Europe/Berlin" },
  reporter: "list",
});
