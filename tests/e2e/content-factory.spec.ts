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
  // Scoped to the production view: the artwork panel lists the same slide names.
  const production = page.locator(".preview-carousel");
  await expect(production).toBeVisible();
  await expect(production.getByText("Portada", { exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "Láminas del carrusel" })).toBeVisible();
  await expect(production.getByText("DIRECCIÓN VISUAL").first()).toBeVisible();
});

test("a TikTok piece renders as a script with scenes and an estimated duration", async ({ page }) => {
  await page.goto("/content/00000000-0000-0000-0000-000000000602");
  await page.getByRole("tab", { name: "Producción" }).click();
  const production = page.locator(".preview-video");
  await expect(production).toBeVisible();
  await expect(production.getByText("Escena 1")).toBeVisible();
  await expect(production.getByText("Texto en pantalla").first()).toBeVisible();
  await expect(production.getByText("Transición").first()).toBeVisible();
  await expect(production.getByText(/Duración estimada: \d+s/)).toBeVisible();
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

// The pack is the deliverable that matters before any integration exists: the frames as real
// files at delivery size plus the copy to paste, so a piece can be posted by hand today.
test("a piece can be downloaded as a ready-to-post pack", async ({ page }) => {
  await page.goto("/content/00000000-0000-0000-0000-000000000601");
  const button = page.getByRole("button", { name: /Descargar/ });
  await expect(button).toBeVisible();

  const download = await Promise.all([page.waitForEvent("download"), button.click()]).then(([event]) => event);
  expect(download.suggestedFilename()).toMatch(/^instagram-.*\.zip$/);

  const stream = await download.createReadStream();
  const archive: Buffer = await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });

  // A real archive, not an empty file.
  expect(archive.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));

  // It carries the copy to paste and one image per composed slide, each a genuine PNG.
  // Read as latin1 so byte patterns survive; assertions stay ASCII for the same reason.
  const text = archive.toString("latin1");
  expect(text).toContain("copy.txt");
  expect(text).toContain("CAPTION");
  expect(text).toContain("Plataforma: instagram");
  expect(text).toContain("PNG");

  const images = new Set([...text.matchAll(/instagram-\d\d-[A-Za-z0-9 .-]+\.png/g)].map((match) => match[0]));
  expect(images.size, "expected one PNG per composed slide").toBeGreaterThanOrEqual(4);

  // Not a blank canvas: a solid-colour frame compresses to almost nothing.
  expect(archive.length).toBeGreaterThan(20_000);
});

// Choosing the voice of a brand. The screen keeps two lists apart on purpose: what the vendor
// account happens to hold, and what somebody decided to use and said where it is from.
test("the voice screen separates the account's voices from the brand's", async ({ page }) => {
  await page.goto("/settings/voice");
  await expect(page.getByRole("heading", { name: "La voz de la marca" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Las que Spectro puede usar" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Voces disponibles para cargar" })).toBeVisible();
});

test("every tone is offered with what it is for, not just its name", async ({ page }) => {
  await page.goto("/settings/voice");
  const tone = page.getByLabel("Tono");
  await expect(tone).toContainText("Reflexiva — pausada");
  await expect(tone).toContainText("Entusiasta — con energía");
});

test("a voice cannot be loaded without saying where it is from", async ({ page }) => {
  await page.goto("/settings/voice");
  // Guessing the region from a vendor label would put a Mexican voice on a Rioplatense brand.
  const row = page.locator(".voice-available li").filter({ hasText: "Voz de prueba 2" });
  await expect(row.getByRole("button", { name: "Cargar" })).toBeDisabled();
  await row.getByLabel(/Región para/).selectOption("mexicana");
  await expect(row.getByRole("button", { name: "Cargar" })).toBeEnabled();
});

test("an already loaded voice is not offered again", async ({ page }) => {
  await page.goto("/settings/voice");
  const row = page.locator(".voice-available li").filter({ hasText: "Voz de prueba 1" });
  await expect(row).toContainText("Cargada");
  await expect(row.getByRole("button", { name: "Cargar" })).toHaveCount(0);
});

test("the voice screen is reachable from the navigation", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Voz" }).click();
  await expect(page).toHaveURL(/\/settings\/voice$/);
});

// Hearing a voice before choosing it. The provider's own sample costs nothing to play.
test("each voice can be previewed before it is loaded", async ({ page }) => {
  await page.goto("/settings/voice");
  const row = page.locator(".voice-available li").filter({ hasText: "Voz de prueba 1" });
  const player = row.locator("audio");
  await expect(player).toHaveAttribute("src", /.+/);
  // Not preloaded: opening the screen must not fetch a sample for every voice in the account.
  await expect(player).toHaveAttribute("preload", "none");
});

test("the language filter is built from the voices the account actually has", async ({ page }) => {
  await page.goto("/settings/voice");
  const filter = page.getByLabel("Idioma");
  await expect(filter).toContainText("Español");
  await expect(filter).toContainText("Inglés");

  await filter.selectOption("es");
  await expect(page.locator(".voice-available li")).toHaveCount(1);
  await expect(page.locator(".voice-available")).toContainText("Voz de prueba 1");
  await expect(page.locator(".voice-available")).not.toContainText("Voz de prueba 2");
});

// The first place in Spectro where pressing something spends money, so the money is on screen
// before the button is.
test("the cost of each track is shown before it can be produced", async ({ page }) => {
  await page.goto("/content/00000000-0000-0000-0000-000000000602");
  const panel = page.locator(".voiceover-action");
  await expect(panel).toBeVisible();

  // Voice and music are separate decisions with separate prices; one control would hide which.
  await expect(panel.getByRole("button", { name: /Generar voz en off/ })).toBeVisible();
  await expect(panel.getByRole("button", { name: /Generar música/ })).toBeVisible();
  expect(await panel.locator(".voiceover-cost").count()).toBe(2);
  await expect(panel).toContainText(/costo estimado/);
  await expect(panel).toContainText(/Nada se publica/);
});

test("a piece read in silence is offered neither voice nor music", async ({ page }) => {
  // A carousel is read by the person scrolling it. Offering to narrate or score it would be
  // selling something nobody asked for.
  await page.goto("/content/00000000-0000-0000-0000-000000000601");
  await expect(page.getByText("Esta pieza no lleva audio.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Generar voz en off/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Generar música/ })).toHaveCount(0);
});

// The assembled view: the frames in sequence with the voice over them. Not a rendered video and
// it does not claim to be one.
test("a multi-frame piece can be played as an assembled sequence", async ({ page }) => {
  await page.goto("/content/00000000-0000-0000-0000-000000000602");
  await page.getByRole("tab", { name: "Ensamblado" }).click();

  const assembled = page.locator(".assembled");
  await expect(assembled).toBeVisible();
  await expect(assembled.getByRole("button", { name: "Reproducir" })).toBeVisible();
  await expect(assembled.getByRole("button", { name: "Volver al principio" })).toBeVisible();

  // One segment per frame, so the pacing is visible rather than only felt.
  const frames = await page.locator(".assembled-track span").count();
  expect(frames).toBeGreaterThan(1);
  await expect(assembled).toContainText(/0\.0s \/ \d+\.\ds/);
});

test("playing advances the sequence and the play control becomes pause", async ({ page }) => {
  await page.goto("/content/00000000-0000-0000-0000-000000000602");
  await page.getByRole("tab", { name: "Ensamblado" }).click();
  const assembled = page.locator(".assembled");

  await assembled.getByRole("button", { name: "Reproducir" }).click();
  await expect(assembled.getByRole("button", { name: "Pausar" })).toBeVisible();
  await expect(assembled).not.toContainText("0.0s /");
});

test("a playable piece opens ready to play, not behind a disclosure", async ({ page }) => {
  await page.goto("/content?view=feed");
  // Hidden behind a summary, the pieces that move looked exactly like the ones that do not.
  const assembled = page.locator(".gallery-assembled .assembled").first();
  await expect(assembled).toBeVisible();
  await expect(assembled.getByRole("button", { name: "Reproducir" })).toBeVisible();
  await expect(page.locator(".gallery-assembled summary")).toHaveCount(0);
});

test("a piece missing audio says which, and offers each with its cost", async ({ page }) => {
  await page.goto("/content?view=feed&platform=tiktok");
  const state = page.locator(".voiceover-compact").first();
  await expect(state).toContainText("Sin voz en off");
  await expect(state).toContainText("Sin música");
  // The price is on every button: nothing here spends without saying what it spends.
  expect(await state.getByRole("button", { name: /Generar ·/ }).count()).toBe(2);
});

// The assembled view has to show the piece as the platform will, not the artwork on its own:
// bare frames cannot answer whether the caption covers the last line of the headline.
test("the assembled playback wears the platform's own interface", async ({ page }) => {
  await page.goto("/content/00000000-0000-0000-0000-000000000602");
  await page.getByRole("tab", { name: "Ensamblado" }).click();

  const stage = page.locator(".assembled-stage");
  await expect(stage.locator(".mock-frame")).toBeVisible();
  await expect(stage.locator(".mock-rail")).toBeVisible();
  await expect(stage.locator(".mock-handle")).toContainText("@");
  // Still no invented engagement numbers, in this view either.
  await expect(stage).not.toHaveText(/\d[\d.,]*\s*(me gusta|vistas|likes)/i);
});

test("a carousel is assembled inside a feed post, not a phone frame", async ({ page }) => {
  await page.goto("/content/00000000-0000-0000-0000-000000000601");
  await page.getByRole("tab", { name: "Ensamblado" }).click();
  const stage = page.locator(".assembled-stage");
  await expect(stage.locator(".mock-post")).toBeVisible();
  await expect(stage.locator(".mock-frame")).toHaveCount(0);
});

// Artwork is asked for one frame at a time, because the free service rate limits to roughly one
// image every fifteen seconds and a button that generated all of them would be killed mid-flight.
test("artwork is offered per frame, with the wait explained", async ({ page }) => {
  await page.goto("/content/00000000-0000-0000-0000-000000000601");
  const panel = page.locator(".image-actions");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText(/una imagen cada 15 segundos/i);

  const slots = panel.locator(".image-slots li");
  expect(await slots.count()).toBeGreaterThan(1);
  await expect(slots.first()).toContainText("Portada");
  await expect(slots.first().getByRole("button", { name: /Generar/ })).toBeVisible();
});
