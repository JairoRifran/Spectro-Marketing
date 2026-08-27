import {afterEach,describe,expect,it} from "vitest";
import {automationIsEnabled,getServerEnv} from "@/lib/env";

const original={...process.env};
afterEach(()=>{process.env={...original};});
describe("automation environment guard",()=>{
  it("defaults to disabled",()=>{delete process.env.AUTOMATION_ENABLED;expect(automationIsEnabled()).toBe(false)});
  it("treats empty Vercel form values as unset defaults",()=>{process.env.AUTOMATION_ENABLED="";process.env.DEPLOYMENT_ENVIRONMENT="";process.env.VERCEL_ENV="";expect(automationIsEnabled()).toBe(false)});
  it("treats empty optional worker settings as server defaults",()=>{process.env.NEXT_PUBLIC_SUPABASE_URL="https://test.supabase.co";process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="anon";process.env.SUPABASE_SERVICE_ROLE_KEY="service";process.env.CRON_SECRET="123456789012345678901234";process.env.AI_PROVIDER="";process.env.DISPATCH_BATCH_SIZE="";process.env.TASK_LEASE_SECONDS="";expect(getServerEnv()).toMatchObject({AI_PROVIDER:"mock",DISPATCH_BATCH_SIZE:5,TASK_LEASE_SECONDS:120})});
  it("never runs in preview",()=>{process.env.AUTOMATION_ENABLED="true";process.env.VERCEL_ENV="preview";expect(automationIsEnabled()).toBe(false)});
  it("requires explicit enablement outside preview/test",()=>{process.env.AUTOMATION_ENABLED="true";process.env.VERCEL_ENV="production";expect(automationIsEnabled()).toBe(true)});
});
