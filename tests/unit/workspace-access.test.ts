import { describe,expect,it } from "vitest";
import { hasOnboardedOrganization,resolveWorkspaceRedirect } from "@/features/organizations/access";

const newUser={authenticated:true,hasOnboardedOrganization:false};
const settled={authenticated:true,hasOnboardedOrganization:true};

describe("workspace access guard",()=>{
  it("sends a new user without membership to onboarding",()=>{
    expect(resolveWorkspaceRedirect("/",newUser)).toBe("/onboarding");
    expect(resolveWorkspaceRedirect("/tasks",newUser)).toBe("/onboarding");
    expect(resolveWorkspaceRedirect("/settings/company",newUser)).toBe("/onboarding");
  });
  it("keeps a user with an onboarded organization in the workspace",()=>{
    expect(resolveWorkspaceRedirect("/",settled)).toBeNull();
    expect(resolveWorkspaceRedirect("/approvals",settled)).toBeNull();
  });
  it("moves a settled user off the onboarding route",()=>{
    expect(resolveWorkspaceRedirect("/onboarding",settled)).toBe("/");
  });
  it("lets a user without an onboarded organization stay on onboarding",()=>{
    expect(resolveWorkspaceRedirect("/onboarding",newUser)).toBeNull();
  });
  it("never redirects a destination back to its origin",()=>{
    for(const access of [newUser,settled]){
      for(const path of ["/","/tasks","/onboarding","/approvals"]){
        const first=resolveWorkspaceRedirect(path,access);
        if(first)expect(resolveWorkspaceRedirect(first,access)).toBeNull();
      }
    }
  });
  it("ignores anonymous requests so the auth redirect keeps priority",()=>{
    expect(resolveWorkspaceRedirect("/",{authenticated:false,hasOnboardedOrganization:false})).toBeNull();
  });
  it("treats an organization without a completion timestamp as unfinished",()=>{
    expect(hasOnboardedOrganization([])).toBe(false);
    expect(hasOnboardedOrganization([{onboarding_completed_at:null}])).toBe(false);
    expect(hasOnboardedOrganization([{onboarding_completed_at:null},{onboarding_completed_at:"2026-08-27T00:00:00Z"}])).toBe(true);
  });
});
