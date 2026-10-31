import { describe, expect, it } from "vitest";
import { pickLocale } from "../src/index.js";

// The host sends the learner's locale and its fallbacks; a tool shows the first of them it has.
describe("pickLocale", () => {
  const declared = ["en", "ja", "pt-BR"] as const;

  it("takes the first entry of the chain the tool declares, the exact tag before its base language", () => {
    expect(pickLocale(["ja-JP", "ja", "en"], declared)).toBe("ja");
    expect(pickLocale(["pt-BR", "pt"], declared)).toBe("pt-BR");
    expect(pickLocale(["fr", "en"], declared)).toBe("en");
  });

  it("matches case-insensitively, and answers in the tool's own spelling", () => {
    expect(pickLocale(["PT-br"], declared)).toBe("pt-BR");
    expect(pickLocale(["JA-jp"], declared)).toBe("ja");
  });

  it("never matches a region the tool doesn't have to another region", () => {
    expect(pickLocale(["pt-PT"], declared, "en")).toBe("en");
  });

  it("falls back to the default given, else the manifest's first locale", () => {
    expect(pickLocale(["fr"], declared, "ja")).toBe("ja");
    expect(pickLocale(["fr"], declared)).toBe("en");
    expect(pickLocale([], declared)).toBe("en");
  });

  it("reads the start or a locale switch as it comes: the locale, then its fallbacks", () => {
    expect(pickLocale({ locale: "fr", fallback: ["ja", "en"] }, declared)).toBe("ja");
    expect(pickLocale({ locale: "ja-JP" }, declared)).toBe("ja");
  });

  it("takes a manifest without locales as an English tool", () => {
    expect(pickLocale(["ja", "en"], undefined)).toBe("en");
    expect(pickLocale(["ja"], undefined)).toBe("en");
  });

  it("needs a locale to fall back to", () => {
    expect(() => pickLocale(["fr"], [])).toThrow(/no locale to fall back to/);
  });
});
