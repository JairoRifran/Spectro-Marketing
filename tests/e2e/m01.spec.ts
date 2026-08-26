import { test, expect } from "@playwright/test";

test("Marketing HQ renders real operational surfaces", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Marketing HQ" })).toBeVisible();
  await expect(page.getByText("Equipo en operación")).toBeVisible();
  await expect(page.getByText("DEMO MODE")).toBeVisible();
});

test("agent A exposes delegated work for agent B", async ({ page }) => {
  await page.goto("/tasks");
  await expect(page.getByText("Revisión diaria de marketing", { exact: true })).toBeVisible();
  await expect(page.getByText("Revisar señales de mercado", { exact: true })).toBeVisible();
});

test("approval can be decided in isolated demo mode", async ({ page }) => {
  await page.goto("/approvals");
  await page.getByRole("button", { name: "Aprobar" }).click();
  await expect(page.getByText("Solicitud aprobada.")).toBeVisible();
});

test("signup to onboarding to HQ", async ({ page }) => {
  test.skip(!process.env.E2E_SUPABASE_CONFIGURED, "requires isolated Supabase test project");
  await page.goto("/signup");
  await page.getByLabel("Nombre completo").fill("M01 Test");
  await page.getByLabel("Email").fill(`m01-${Date.now()}@example.com`);
  await page.getByLabel("Contraseña").fill("test-password-123");
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page).toHaveURL(/onboarding/);
});
