import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";

const flow=readFileSync(new URL("../../src/components/onboarding-flow.tsx",import.meta.url),"utf8");

// The comma-separated fields used to render `array.join(", ")` straight back into a
// controlled input. Every separator the user typed was parsed away and re-serialised on
// the next keystroke, so "a, b" collapsed into the single entry "ab" as it was typed.
describe("onboarding list fields",()=>{
  it("never renders a parsed array back into the input",()=>{
    expect(flow).not.toContain('join(", ")');
  });
  it("keeps the raw text the user typed for every list field",()=>{
    for(const field of ["pains","needs","motivations","channels","personality","forbidden_claims"]){
      expect(flow).toContain(`raw.${field}??""`);
      expect(flow).toContain(`setRaw(r=>({...r,${field}:v}))`);
    }
  });
  it("still parses the raw text into the payload array",()=>{
    for(const field of ["pains","needs","motivations","channels","personality","forbidden_claims"]){
      expect(flow).toContain(`${field}:list(v)`);
    }
  });
});
