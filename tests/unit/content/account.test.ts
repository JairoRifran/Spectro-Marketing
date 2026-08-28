import { describe, expect, it } from "vitest";
import { accountFor } from "@/features/content/account";

// The handle is a placeholder until the real presences are connected, so it has to be derived
// from something true rather than invented, and it has to be a handle a platform would accept.
describe("simulated account handle", () => {
  it("derives the handle from the organization name", () => {
    expect(accountFor("Spectro Marketing")).toEqual({ name: "Spectro Marketing", handle: "@spectromarketing" });
  });

  it("strips accents rather than emitting them into a handle", () => {
    expect(accountFor("Panadería Ñandú").handle).toBe("@panaderianandu");
  });

  it("drops punctuation and spacing a platform would reject", () => {
    expect(accountFor("Acme, S.A. — Marketing & Co.").handle).toBe("@acmesamarketingco");
  });

  it("falls back to a usable handle when the name leaves nothing behind", () => {
    expect(accountFor("—").handle).toBe("@spectro");
    expect(accountFor("").handle).toBe("@spectro");
  });

  it("keeps the display name exactly as the organization wrote it", () => {
    expect(accountFor("Panadería Ñandú").name).toBe("Panadería Ñandú");
  });
});
