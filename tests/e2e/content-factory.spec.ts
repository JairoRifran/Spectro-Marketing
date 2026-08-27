import { expect, test } from "@playwright/test";

// Demo-mode coverage of the Content Studio surfaces. The full persisted chain needs a real
// database and lives in tests/integration/content-factory.test.ts, which is guarded by
// TEST_ENVIRONMENT. What is asserted here is what a reviewer actually sees and can act on.

test("Content Studio lists real pieces with their editorial context", async ({ page }) => {
  await page.goto("/content");
  await expect(page.getByRole("heading", { name: "Contenido" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Pilar" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Calidad" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Proceso antes que herramienta/ }).first()).toBeVisible();
});

test("Contenido is reachable from the main navigation", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Contenido" }).click();
  await expect(page).toHaveURL(/\/content$/);
});

test("content detail shows context, native preview, quality and lineage", async ({ page }) => {
  await page.goto("/content");
  await page.getByRole("link", { name: /Proceso antes que herramienta/ }).first().click();
  await expect(page).toHaveURL(/\/content\/[0-9a-f-]+$/);

  await expect(page.getByText("Por qué existe esta pieza")).toBeVisible();
  await expect(page.getByText("Cómo se va a consumir")).toBeVisible();
  await expect(page.getByText("Control determinístico")).toBeVisible();
  await expect(page.getByText("Cómo llegó hasta acá")).toBeVisible();

  // The preview renders the piece as its real shape, never as raw JSON.
  await expect(page.locator(".content-preview")).toBeVisible();
  await expect(page.getByText(/^\{/)).toHaveCount(0);
});

test("an Instagram carousel renders as slides with a caption and visual direction", async ({ page }) => {
  await page.goto("/content/00000000-0000-0000-0000-000000000601");
  await expect(page.locator(".preview-carousel")).toBeVisible();
  await expect(page.getByText("Portada", { exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "Láminas del carrusel" })).toBeVisible();
  await expect(page.getByText("DIRECCIÓN VISUAL").first()).toBeVisible();
});

test("a TikTok piece renders as a script with scenes and an estimated duration", async ({ page }) => {
  await page.goto("/content/00000000-0000-0000-0000-000000000602");
  await expect(page.locator(".preview-video")).toBeVisible();
  await expect(page.getByText("Escena 1")).toBeVisible();
  await expect(page.getByText("Texto en pantalla").first()).toBeVisible();
  await expect(page.getByText("Transición").first()).toBeVisible();
  await expect(page.getByText(/Duración estimada: \d+s/)).toBeVisible();
});

test("quality is reported as checks passed, never as a performance prediction", async ({ page }) => {
  await page.goto("/content/00000000-0000-0000-0000-000000000602");
  await expect(page.getByText(/\d+ \/ \d+ checks/)).toBeVisible();
  await expect(page.getByText(/viral|probabilidad|alcance estimado|engagement|impresiones|ROAS/i)).toHaveCount(0);
});

test("a weakly differentiated variant is explained in plain language", async ({ page }) => {
  await page.goto("/content/00000000-0000-0000-0000-000000000602");
  await expect(page.getByText(/adaptación demasiado similar/)).toBeVisible();
});

test("requesting a revision demands feedback before it can be sent", async ({ page }) => {
  await page.goto("/content/00000000-0000-0000-0000-000000000601");
  await page.getByRole("button", { name: "Pedir revisión" }).click();

  const submit = page.getByRole("button", { name: "Enviar revisión" });
  await expect(submit).toBeDisabled();

  await page.getByLabel("Qué hay que cambiar").fill("El hook es demasiado corporativo. Quiero algo más directo y natural.");
  await expect(submit).toBeEnabled();
  await expect(page.getByText(/La actual queda intacta en el historial/)).toBeVisible();
});

test("a piece that is not waiting for approval offers no decision", async ({ page }) => {
  await page.goto("/content/00000000-0000-0000-0000-000000000602");
  await expect(page.getByRole("button", { name: "Aprobar" })).toHaveCount(0);
});

test("a campaign without an approved strategy cannot generate content", async ({ page }) => {
  await page.goto("/campaigns/00000000-0000-0000-0000-000000000401");
  await expect(page.getByRole("button", { name: "Generate Content Plan" })).toHaveCount(0);
  await expect(page.getByText("Producción editorial")).toBeVisible();
  await expect(page.getByText(/El contenido se genera cuando la estrategia está aprobada/)).toBeVisible();
});

test("the version history is navigable and never overwritten", async ({ page }) => {
  await page.goto("/content/00000000-0000-0000-0000-000000000601");
  await expect(page.getByRole("navigation", { name: "Versiones" })).toBeVisible();
  await expect(page.getByRole("link", { name: "v1" })).toBeVisible();
});
