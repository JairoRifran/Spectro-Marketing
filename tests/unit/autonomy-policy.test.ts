import { describe,expect,it } from "vitest";
import { canAgentAct,needsApproval } from "@/server/policies/autonomy";
describe("autonomy guardrails",()=>{it("keeps observers read-only",()=>{expect(canAgentAct(0,"low")).toBe(false)});it("requires deterministic approval for high risk",()=>{expect(needsApproval(3,"high")).toBe(true);expect(canAgentAct(3,"high",false)).toBe(false);expect(canAgentAct(3,"high",true)).toBe(true)});it("allows autonomous level to handle medium risk",()=>{expect(needsApproval(3,"medium")).toBe(false);expect(needsApproval(2,"medium")).toBe(true)})});
