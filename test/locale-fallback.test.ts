import { describe, expect, it } from "vitest";
import { defineTool } from "../src/index.js";
import { launch } from "../src/testing.js";
import { echo } from "./fixtures.js";

// An English-only tool is a v1 tool (`locales: ["en"]`): the learner's locale isn't its, so it renders English, and the
// host is told, to show its fallback notice.
describe("a locale the tool doesn't have", () => {
  const englishOnly = () => { const m = echo(); m.locales = ["en"]; return m; };

  it("is fine in a manifest: English alone is a v1 tool", () => {
    expect(defineTool(englishOnly()).locales).toEqual(["en"]);
  });

  it("is reported when the tool renders another, and not when it renders the learner's", async () => {
    const ja = await launch(englishOnly(), { locale: "ja", fallback: ["en"] });
    ja.tool.ready("en");
    await ja.settle();
    expect(ja.received.fallbacks).toEqual([{ requested: "ja", rendered: "en" }]);
    const en = await launch(englishOnly(), { locale: "en" });
    en.tool.ready("en");
    await en.settle();
    expect(en.received.fallbacks).toEqual([]);
    ja.close(); en.close();
  });
});
