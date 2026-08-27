import {afterEach,describe,expect,it} from "vitest";
import {POST} from "@/app/api/internal/jobs/dispatch/route";

const original={...process.env};afterEach(()=>{process.env={...original}});
function configure(enabled=true){process.env.AUTOMATION_ENABLED=enabled?"true":"false";process.env.DEPLOYMENT_ENVIRONMENT="development";delete process.env.VERCEL_ENV;process.env.NEXT_PUBLIC_SUPABASE_URL="https://example.supabase.co";process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="anon";process.env.SUPABASE_SERVICE_ROLE_KEY="service";process.env.CRON_SECRET="01234567890123456789012345678901";}
describe("dispatcher endpoint security",()=>{
  it("stops before secrets or database when automation is disabled",async()=>{configure(false);const response=await POST(new Request("http://localhost/api/internal/jobs/dispatch",{method:"POST"}));expect(response.status).toBe(503);expect(await response.json()).toEqual({error:"automation_disabled"})});
  it("uses the same response for missing and incorrect secrets",async()=>{configure();const missing=await POST(new Request("http://localhost/api/internal/jobs/dispatch",{method:"POST"}));const wrong=await POST(new Request("http://localhost/api/internal/jobs/dispatch",{method:"POST",headers:{authorization:"Bearer not-the-secret"}}));expect(missing.status).toBe(401);expect(wrong.status).toBe(401);expect(await missing.json()).toEqual(await wrong.json())});
});
