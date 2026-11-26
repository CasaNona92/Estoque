import { defineConfig, devices } from "@playwright/test";

/**
 * E2E contra um Supabase/R2 de TESTE (nunca o de produção), com o seed.sql aplicado.
 * Variáveis: as do .env.local + E2E_USUARIO/E2E_SENHA (admin) e
 * E2E_VENDEDOR_USUARIO/E2E_VENDEDOR_SENHA (vendedor sem permissão de entrada).
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  reporter: process.env.CI ? [["html", { open: "never" }], ["list"]] : "list",
  use: {
    baseURL: process.env.E2E_URL ?? "http://localhost:3000",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "pc", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 800 } } },
    { name: "tablet", use: { ...devices["Galaxy Tab S4"] }, testMatch: /modo-cliente/ },
  ],
  webServer: process.env.E2E_URL
    ? undefined
    : { command: "npm run start", url: "http://localhost:3000/login", reuseExistingServer: true, timeout: 120_000 },
});
