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

test("the pipeline shows who is working and on what, without inventing activity", async ({ page }) => {
  await page.goto("/campaigns/00000000-0000-0000-0000-000000000401");
  const pipeline = page.getByRole("region", { name: "Estado del trabajo de los agentes" });
  await expect(pipeline).toBeVisible();
  await expect(pipeline.getByText("Los agentes están trabajando")).toBeVisible();

  // Clara is mid-task, so the "right now" band names the real task rather than a generic label.
  await expect(pipeline.locator(".pipeline-now").getByText("Escribir tiktok: Proceso antes que herramienta")).toBeVisible();

  // Emilia has nothing queued in the fixture and must read Idle, not a fabricated state.
  const emilia = pipeline.locator("li", { hasText: "Emilia" });
  await expect(emilia).toContainText("Idle");
});

test("the pipeline reports counts, never predicted performance", async ({ page }) => {
  await page.goto("/campaigns/00000000-0000-0000-0000-000000000401");
  const pipeline = page.getByRole("region", { name: "Estado del trabajo de los agentes" });
  await expect(pipeline.getByText(/\d+ completadas · \d+ en curso/)).toBeVisible();
  await expect(pipeline.getByText(/viral|probabilidad|alcance estimado|engagement/i)).toHaveCount(0);
});

test("the pipeline stays readable on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto("/campaigns/00000000-0000-0000-0000-000000000401");
  const pipeline = page.getByRole("region", { name: "Estado del trabajo de los agentes" });
  await expect(pipeline).toBeVisible();
  // The drawing is decorative and hidden on narrow screens; the list carries the information.
  await expect(pipeline.locator(".pipeline-canvas")).toBeHidden();
  await expect(pipeline.locator(".pipeline-list li").first()).toBeVisible();
});

// The pipeline view was built but only mounted inside a campaign tab, so the person who lands on
// Marketing HQ never saw it. Its whole value is answering "where is my work?" on arrival, so its
// presence there — and the fact that it names who has the work — is worth asserting.
test("Marketing HQ opens on where the work actually is", async ({ page }) => {
  await page.goto("/");
  const pipeline = page.getByRole("region", { name: "Estado del trabajo de los agentes" });
  await expect(pipeline).toBeVisible();
  await expect(pipeline.getByText("PIPELINE DEL EQUIPO")).toBeVisible();
  // Not a generic label: the real task title of the agent that currently holds the work.
  const now = pipeline.locator(".pipeline-now");
  await expect(now.getByText(/Escribir tiktok: Proceso antes que herramienta/)).toBeVisible();
  await expect(now.getByText(/1 pieza espera tu decisión/)).toBeVisible();
});

// Motion has to mean one specific thing. A pulsing green node and a flowing link mean an agent
// genuinely holds the work; waiting on a person is drawn differently, because the system is not
// doing anything at that point and must not look like it is.
test("only a stage an agent is genuinely working is animated", async ({ page }) => {
  await page.goto("/");
  const pipeline = page.getByRole("region", { name: "Estado del trabajo de los agentes" });

  // Clara is the only agent mid-task in the demo snapshot.
  await expect(pipeline.locator(".pipeline-node.is-working")).toHaveCount(1);
  await expect(pipeline.locator(".pipeline-flow.is-flowing")).toHaveCount(1);

  // The pending human decision is present, but as waiting rather than as work in flight.
  await expect(pipeline.locator(".pipeline-node.is-waiting")).toHaveCount(1);
  await expect(pipeline.locator(".pipeline-now li.is-human")).toHaveCount(1);
});
