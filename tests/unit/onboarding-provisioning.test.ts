import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";

const migration=readFileSync(new URL("../../supabase/migrations/202608270001_onboarding_idempotency.sql",import.meta.url),"utf8");

const roster=[
  ["cmo","Sofía","Chief Marketing Officer"],
  ["market_intelligence","Mateo","Market Intelligence"],
  ["social_media_director","Valentina","Social Media Director"],
  ["content_strategist","Bruno","Content Strategist"],
  ["copywriter","Clara","Copywriter"],
  ["creative_director","Emilia","Creative Director"],
  ["analytics","Tomás","Analytics"],
  ["marketing_auditor","Vera","Marketing Auditor"],
];

describe("onboarding provisioning contract",()=>{
  it("declares the eight M01 agents with stable roles",()=>{
    for(const [role,name,description] of roster)expect(migration).toContain(`'${role}','${name}','${description}'`);
    expect(roster).toHaveLength(8);
  });
  it("never keys the roster on display name alone",()=>{
    for(const [role] of roster)expect(migration).toContain(`'${role}'`);
  });
  it("makes every provisioning write safe to retry",()=>{
    expect(migration).toContain("on conflict (organization_id,role) do nothing");
    expect(migration).toContain("on conflict (agent_id) do nothing");
    expect(migration).toContain("on conflict (agent_id,capability) do nothing");
    expect(migration).toContain("on conflict (organization_id,name) do nothing");
  });
  it("reuses the onboarding objective instead of creating a second one",()=>{
    expect(migration).toContain("select id into first_objective from public.objectives");
    expect(migration).toContain("if created_objective then");
  });
  it("preserves the original completion timestamp on retry",()=>{
    expect(migration).toContain("onboarding_completed_at=coalesce(onboarding_completed_at,now())");
  });
  it("guards brand, product and persona inserts against duplicates",()=>{
    expect(migration).toContain("where not exists(select 1 from public.brands where organization_id=org_id)");
    expect(migration).toContain("where not exists(select 1 from public.products where organization_id=org_id and name=item->>'name')");
    expect(migration).toContain("where not exists(select 1 from public.personas where organization_id=org_id and name=item->>'name')");
  });
});
