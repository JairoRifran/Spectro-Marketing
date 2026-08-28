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

  // The production view renders the piece as its real shape, never as raw JSON.
  await page.getByRole("tab", { name: "Producción" }).click();
  await expect(page.locator(".content-preview")).toBeVisible();
  await expect(page.getByText(/^\{/)).toHaveCount(0);
});

test("an Instagram carousel renders as slides with a caption and visual direction", async ({ page }) => {
  await page.goto("/content/00000000-0000-0000-0000-000000000601");
  await page.getByRole("tab", { name: "Producción" }).click();
  await expect(page.locator(".preview-carousel")).toBeVisible();
  await expect(page.getByText("Portada", { exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "Láminas del carrusel" })).toBeVisible();
  await expect(page.getByText("DIRECCIÓN VISUAL").first()).toBeVisible();
});

test("a TikTok piece renders as a script with scenes and an estimated duration", async ({ page }) => {
  await page.goto("/content/00000000-0000-0000-0000-000000000602");
  await page.getByRole("tab", { name: "Producción" }).click();
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
  await expect(pipeline.getByText("Tu equipo está trabajando ahora")).toBeVisible();

  // The panel opens on whoever holds the work and names the real task, not a generic label.
  const explain = pipeline.locator(".pipeline-explain");
  await expect(explain).toContainText("Clara");
  await expect(explain).toContainText("Escribir tiktok: Proceso antes que herramienta");

  // Emilia has nothing queued in the fixture and must say so, not show a fabricated state.
  const emilia = pipeline.locator(".pipeline-stage", { hasText: "Emilia" });
  await expect(emilia).toContainText("Sin trabajo");
});

test("the pipeline reports counts, never predicted performance", async ({ page }) => {
  await page.goto("/campaigns/00000000-0000-0000-0000-000000000401");
  const pipeline = page.getByRole("region", { name: "Estado del trabajo de los agentes" });
  await expect(pipeline.locator(".pipeline-summary")).toContainText(/tareas? lista/);
  await expect(pipeline.getByText(/viral|probabilidad|alcance estimado|engagement/i)).toHaveCount(0);
});

test("the pipeline stays readable on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto("/campaigns/00000000-0000-0000-0000-000000000401");
  const pipeline = page.getByRole("region", { name: "Estado del trabajo de los agentes" });
  await expect(pipeline).toBeVisible();
  // The rail becomes a vertical list of people rather than disappearing; every stage stays
  // readable, which is the whole point of it being text and not a drawing.
  await expect(pipeline.locator(".pipeline-stage")).toHaveCount(9);
  await expect(pipeline.locator(".pipeline-stage").first()).toBeVisible();
  await expect(pipeline.locator(".pipeline-stage").last()).toBeVisible();
});

// The pipeline view was built but only mounted inside a campaign tab, so the person who lands on
// Marketing HQ never saw it. Its whole value is answering "where is my work?" on arrival, so its
// presence there — and the fact that it names who has the work — is worth asserting.
test("every count on the rail says what it is counting", async ({ page }) => {
  await page.goto("/");
  const pipeline = page.getByRole("region", { name: "Estado del trabajo de los agentes" });
  for (const name of ["Sofía", "Clara", "Emilia", "Vos"]) {
    const stage = pipeline.locator(".pipeline-stage", { hasText: name }).first();
    await expect(stage.locator(".pipeline-state")).not.toHaveText(/^\d+$/);
  }
  // Singular and plural are both produced, so neither reads as "1 tareas".
  await expect(pipeline.getByText("1 tarea lista").first()).toBeVisible();
});

test("Marketing HQ opens on where the work actually is", async ({ page }) => {
  await page.goto("/");
  const pipeline = page.getByRole("region", { name: "Estado del trabajo de los agentes" });
  await expect(pipeline).toBeVisible();
  await expect(pipeline.getByText("PIPELINE DEL EQUIPO")).toBeVisible();
  // Not a generic label: the real task title of the agent that currently holds the work.
  await expect(pipeline.locator(".pipeline-explain")).toContainText("Escribir tiktok: Proceso antes que herramienta");
});

// Motion has to mean one specific thing. A pulsing green node and a flowing link mean an agent
// genuinely holds the work; waiting on a person is drawn differently, because the system is not
// doing anything at that point and must not look like it is.
test("only a stage an agent is genuinely working is animated", async ({ page }) => {
  await page.goto("/");
  const pipeline = page.getByRole("region", { name: "Estado del trabajo de los agentes" });

  // Clara is the only agent mid-task in the demo snapshot.
  await expect(pipeline.locator(".pipeline-stage.is-working")).toHaveCount(1);
  await expect(pipeline.locator(".pipeline-stage.is-working")).toContainText("Clara");

  // The pending human decision is present, but as waiting rather than as work in flight.
  await expect(pipeline.locator(".pipeline-stage.is-waiting")).toHaveCount(1);
});

// The explanation is the point of the rail: a count says how many, never what or why.
test("the panel explains what an agent is for and what they actually delivered", async ({ page }) => {
  await page.goto("/");
  const pipeline = page.getByRole("region", { name: "Estado del trabajo de los agentes" });
  const explain = pipeline.locator(".pipeline-explain");

  // It opens on the work without being asked.
  await expect(explain).toContainText("Clara");
  await expect(explain).toContainText(/AHORA MISMO|Ahora mismo/i);

  // Picking someone else explains them instead, including what they last produced.
  await pipeline.locator(".pipeline-stage", { hasText: "Mateo" }).getByRole("button").click();
  await expect(explain).toContainText("Mateo");
  await expect(explain).toContainText(/mercado/i);
  await expect(explain).toContainText("Investigar oportunidad");

  // And it can be handed back to the work.
  await explain.getByRole("button", { name: "seguir el trabajo" }).click();
  await expect(explain).toContainText("Clara");
});

test("a stage that never ran says so instead of inventing a delivery", async ({ page }) => {
  await page.goto("/");
  const pipeline = page.getByRole("region", { name: "Estado del trabajo de los agentes" });
  await pipeline.locator(".pipeline-stage", { hasText: "Emilia" }).getByRole("button").click();
  const explain = pipeline.locator(".pipeline-explain");
  await expect(explain).toContainText("Emilia");
  await expect(explain).toContainText("Todavía no le tocó trabajar en esto.");
});

// The simulation exists to make an unpublished piece tangible. Its hard rule is that it must not
// invent the one thing it cannot know: how the piece performed. Nothing is published, so any
// like, view or reach count on screen would be fabricated.
test("the platform simulation never shows an engagement number", async ({ page }) => {
  await page.goto("/content?view=feed");
  const gallery = page.locator(".content-gallery");
  await expect(gallery).toBeVisible();

  const mockups = gallery.locator(".platform-mockup");
  await expect(mockups.first()).toBeVisible();

  const text = await mockups.first().innerText();
  // No counts next to the affordances, and no metric vocabulary at all.
  expect(text).not.toMatch(/\d[\d.,]*\s*(me gusta|likes?|vistas|views|reproducciones|comentarios|compartidos|seguidores|alcance|impresiones)/i);
  expect(text).not.toMatch(/\b\d[\d.,]*\s*[KMkm]\b/);
  await expect(mockups.first()).toContainText(/cualquier número acá sería inventado/i);
});

test("each piece is simulated inside the chrome of its own platform", async ({ page }) => {
  await page.goto("/content?view=feed");
  const gallery = page.locator(".content-gallery");

  // The demo set is one Instagram carousel and one TikTok vertical video: two different shapes,
  // so a single generic card would be the wrong answer for at least one of them.
  await expect(gallery.locator(".platform-mockup.on-instagram")).toHaveCount(1);
  await expect(gallery.locator(".platform-mockup.on-tiktok")).toHaveCount(1);
  await expect(gallery.locator(".platform-mockup.on-tiktok .mock-phone")).toBeVisible();
  await expect(gallery.locator(".platform-mockup.on-instagram .mock-dots")).toBeVisible();
});

test("switching to the simulation keeps the filters you already applied", async ({ page }) => {
  await page.goto("/content?platform=tiktok");
  await page.getByRole("link", { name: "Cómo se va a ver" }).click();
  await expect(page).toHaveURL(/platform=tiktok/);
  await expect(page).toHaveURL(/view=feed/);
  await expect(page.locator(".platform-mockup.on-tiktok")).toHaveCount(1);
  await expect(page.locator(".platform-mockup.on-instagram")).toHaveCount(0);
});

test("a caption is shown truncated the way a feed would truncate it", async ({ page }) => {
  await page.goto("/content?view=feed&platform=instagram");
  const caption = page.locator(".platform-mockup.on-instagram .mock-caption");
  await expect(caption.getByRole("button", { name: "más" })).toBeVisible();
  await caption.getByRole("button", { name: "más" }).click();
  await expect(caption.getByRole("button", { name: "ver menos" })).toBeVisible();
});

test("the detail page offers the simulation and the production view of the same piece", async ({ page }) => {
  await page.goto("/content/00000000-0000-0000-0000-000000000602");
  // It opens on the simulation, which is the one a person can judge without being briefed.
  await expect(page.locator(".platform-mockup .mock-phone")).toBeVisible();
  await page.getByRole("tab", { name: "Producción" }).click();
  await expect(page.getByText("HOOK").first()).toBeVisible();
  await expect(page.locator(".platform-mockup")).toHaveCount(0);
});

// The filter bar used to be inert in demo mode: it rendered, accepted a choice and returned the
// full list regardless. A control that silently ignores you is worse than no control.
test("the filter bar actually filters", async ({ page }) => {
  await page.goto("/content");
  const allRows = await page.locator("tbody tr").count();
  expect(allRows).toBeGreaterThan(1);

  await page.goto("/content?platform=tiktok");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody")).toContainText("TikTok");
  await expect(page.locator("tbody")).not.toContainText("Instagram");
});

// The filter bar is a GET form. Without the view travelling with it, applying a filter from the
// simulation silently dropped you back into the table.
test("applying a filter does not throw you out of the simulation", async ({ page }) => {
  await page.goto("/content?view=feed");
  await page.locator("select[name='platform']").selectOption("tiktok");
  await page.getByRole("button", { name: "Aplicar" }).click();
  await expect(page).toHaveURL(/view=feed/);
  await expect(page.locator(".platform-mockup.on-tiktok")).toHaveCount(1);
  await expect(page.locator("table")).toHaveCount(0);
});

// Three cards side by side used to read as three copies of one card: the platform was only tiny
// grey text. Each simulation now names its platform and carries that platform's accent.
test("every simulation names the platform it is headed for", async ({ page }) => {
  await page.goto("/content?view=feed");

  const instagram = page.locator(".platform-mockup.on-instagram");
  await expect(instagram.locator(".mock-tag")).toContainText("Instagram");
  await expect(instagram.locator(".mock-tag")).toContainText("Carrusel");

  const tiktok = page.locator(".platform-mockup.on-tiktok");
  await expect(tiktok.locator(".mock-tag")).toContainText("TikTok");
  await expect(tiktok.locator(".mock-tag")).toContainText("Video corto");

  // The accent is a real difference, not the same colour twice.
  const colourOf = (selector: string) => page.locator(selector).evaluate((node) => getComputedStyle(node).getPropertyValue("--net").trim());
  expect(await colourOf(".platform-mockup.on-instagram")).not.toBe(await colourOf(".platform-mockup.on-tiktok"));
});

test("the platform is named on the detail page simulation too", async ({ page }) => {
  await page.goto("/content/00000000-0000-0000-0000-000000000602");
  await expect(page.locator(".platform-mockup .mock-tag")).toContainText("TikTok");
});
