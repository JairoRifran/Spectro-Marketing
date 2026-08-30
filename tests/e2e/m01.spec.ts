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

test("health and automation endpoints expose no internals in demo",async({request})=>{
  const health=await request.get("/api/health");
  const body=await health.json();
  expect(Object.keys(body).sort()).toEqual([
    "agentProvider",
    "app",
    "commit",
    "credentialEncryption",
    "database",
    "status",
    "timestamp",
  ]);
  expect(typeof body.credentialEncryption).toBe("boolean");
  const dispatch=await request.post("/api/internal/jobs/dispatch",{data:{}});
  expect(dispatch.status()).toBe(503);
  expect(await dispatch.json()).toEqual({error:"automation_disabled"});
});

test("approval badge matches the pending decisions count",async({page})=>{
  await page.goto("/");
  const badge=page.locator("a.nav-item",{hasText:"Aprobaciones"}).locator("em");
  const pending=page.locator(".count-badge").first();
  await expect(pending).toBeVisible();
  await expect(badge).toBeVisible();
  expect((await badge.textContent())?.trim()).toBe((await pending.textContent())?.trim());
});
