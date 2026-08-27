import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
import { PENDING_APPROVAL_STATUS,countPendingApprovals } from "@/features/approvals/count";

const shell=readFileSync(new URL("../../src/components/dashboard-shell.tsx",import.meta.url),"utf8");
const hq=readFileSync(new URL("../../src/features/dashboard/data.ts",import.meta.url),"utf8");

describe("pending approval counter",()=>{
  it("counts only requested approvals",()=>{
    expect(countPendingApprovals([])).toBe(0);
    expect(countPendingApprovals([{status:"requested"},{status:"approved"},{status:"rejected"},{status:"requested"}])).toBe(2);
  });
  it("does not cap the count at one",()=>{
    expect(countPendingApprovals(Array.from({length:7},()=>({status:PENDING_APPROVAL_STATUS})))).toBe(7);
  });
  it("keeps the sidebar badge free of hardcoded values",()=>{
    expect(shell).not.toMatch(/badge:\s*"\d+"/);
    expect(shell).toContain("getPendingApprovalCount");
  });
  it("derives the badge and Marketing HQ from the same status",()=>{
    expect(hq).toContain("PENDING_APPROVAL_STATUS");
    expect(hq).not.toContain("approvalResult.data?1:0");
  });
});
