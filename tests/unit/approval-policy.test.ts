import { describe,expect,it } from "vitest";
import { canDecideApproval,initialTaskStatus } from "@/server/approvals/policy";
describe("approval lifecycle",()=>{it("holds tasks when policy requires it",()=>{expect(initialTaskStatus(1,"medium")).toBe("waiting_approval");expect(initialTaskStatus(2,"high")).toBe("waiting_approval")});it("releases low-risk work",()=>{expect(initialTaskStatus(1,"low")).toBe("queued")});it("only decides requested approvals",()=>{expect(canDecideApproval("requested","approved")).toBe(true);expect(canDecideApproval("approved","rejected")).toBe(false)})});
