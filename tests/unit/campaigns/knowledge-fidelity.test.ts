import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("Campaign Brain knowledge fidelity", () => {
  const workflow = read("../../../src/server/campaigns/workflow.ts");
  const briefs = read("../../../src/server/agents/briefs.ts");
  const seed = read("../../../supabase/seed/spectro-knowledge.sql");
  const migration = read("../../../supabase/migrations/202608300008_refresh_spectro_product_knowledge.sql");

  it("passes rich tenant records and bounded knowledge content to every strategy stage", () => {
    expect(workflow).toContain("title,content,type,source,updated_at");
    expect(workflow).toContain("brandContext:brand.data??null");
    expect(workflow).toContain("products:products.data??[]");
    expect(workflow).toContain("personas:personas.data??[]");
    expect(workflow).toContain("knowledgeItems,constraints");
    expect(workflow).toContain("content.slice(0,KNOWLEDGE_CONTENT_LIMIT)");
  });

  it("teaches governed end-to-end automation without inventing live publishing", () => {
    for (const source of [briefs, seed, migration]) {
      const normalized = source.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      expect(normalized).toMatch(/automatizar[\s\S]{0,100}(punta a punta|todo el flujo)/i);
      expect(normalized).toMatch(/no (existe evidencia|hubo) (de )?una publicacion real/i);
    }
    expect(briefs).not.toContain("Spectro no publica en redes");
    expect(seed.includes("AUTOMATION_ENABLED") || seed.includes("cron siguen desactivados")).toBe(true);
  });

  it("keeps the production refresh scoped to managed knowledge for one organization", () => {
    expect(migration).toContain("where name = 'Spectro Marketing'");
    expect(migration).toContain("source = 'spectro:product-knowledge'");
    expect(migration).not.toMatch(/truncate\s+table/i);
  });
});
