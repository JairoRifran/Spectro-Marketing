import { readFileSync, writeFileSync } from "node:fs";
const path = "tests/unit/content/adapters.test.ts";
let s = readFileSync(path, "utf8");
const before = s;

const block = `
  // A LinkedIn concept asking for a document_post used to reach production and fail with
  // shape_mismatch: the adapter advertised a format its draft could not build. An adapter must
  // never choose a format it cannot produce, whatever the concept or the channel config asks for.
  it("only ever chooses a format it can actually produce", () => {
    for (const platform of SUPPORTED_PLATFORMS) {
      const adapter = getAdapter(platform);
      for (const format of CONTENT_FORMATS) {
        if (!supportsFormat(platform, format)) continue;
        const concept = { ...context.concept, format, platforms: [platform] as typeof context.concept.platforms };
        const chosen = adapter.chooseFormat(concept);
        expect(supportsFormat(platform, chosen), \`\${platform} chose unsupported \${chosen}\`).toBe(true);
        const variant = adapter.draft({ ...context, concept });
        expect(variant.detail.shape, \`\${platform}/\${format} -> \${chosen}\`).toBe(shapeOf(chosen));
        expect(variant.format).toBe(chosen);
      }
    }
  });
});
`;

// Close the "platform adapters" describe with the new case.
const anchor = `  it("prepares Shorts metadata without integrating any platform API", () => {
    const shorts = draftsFor(context).find((variant) => variant.platform === "youtube_shorts")!;
    expect(shorts.metadata.title).toBeTruthy();
    expect(shorts.metadata.description).toBeTruthy();
  });
});`;
if (!s.includes(anchor)) throw new Error("adapters anchor missing");
s = s.replace(anchor, anchor.replace(/\}\);$/, "});") .replace(/\n\}\);$/, "\n") + block);

s = s.replace(
  'import { shapeOf, supportsFormat } from "@/server/content/platforms";',
  'import { CONTENT_FORMATS, shapeOf, SUPPORTED_PLATFORMS, supportsFormat } from "@/server/content/platforms";',
);

if (s === before) throw new Error("no change");
writeFileSync(path, s);
console.log("regression test added");
