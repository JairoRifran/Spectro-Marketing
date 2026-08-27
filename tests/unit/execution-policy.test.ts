import {describe,expect,it} from "vitest";
import {executionAllowed} from "@/server/policies/execution";

describe("runtime execution policy",()=>{
  it("prevents provider output from replacing deterministic approval checks",()=>{
    expect(executionAllowed({autonomyLevel:3,riskLevel:"high",requiresApproval:true,hasApproval:false})).toBe(false);
    expect(executionAllowed({autonomyLevel:3,riskLevel:"high",requiresApproval:true,hasApproval:true})).toBe(true);
  });
  it("keeps observer agents non-executable",()=>expect(executionAllowed({autonomyLevel:0,riskLevel:"low",requiresApproval:false,hasApproval:false})).toBe(false));
});
