import { describe, expect, it } from "vitest";
import { defineTool, ManifestError, manifestProblems } from "../src/index.js";
import { ECHO, echo } from "./fixtures.js";

describe("defineTool", () => {
  it("returns the manifest, frozen all the way down", () => {
    const tool = defineTool(ECHO);
    expect(tool).toEqual(ECHO);
    expect(tool).not.toBe(ECHO);
    expect(Object.isFrozen(tool.surfaces.embed)).toBe(true);
    expect(() => { (tool.commands as Record<string, string>)["navigate"] = "x@1"; }).toThrow(TypeError);
  });

  it("throws every reason a manifest doesn't match", () => {
    const m = echo();
    m.id = "Not An Id";
    m.sdk = "1";
    try {
      defineTool(m);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ManifestError);
      expect((error as ManifestError).problems).toEqual(expect.arrayContaining([expect.stringMatching(/^\/id /), expect.stringMatching(/^\/sdk /)]));
    }
  });

  it("refuses a property the schema doesn't have", () => {
    const m = { ...echo(), permissions: ["everything"] };
    expect(manifestProblems(m)).toEqual([expect.stringContaining("(permissions)")]);
  });
});

describe("the registry's rules, checked before an upload", () => {
  it("every payload a manifest names is declared", () => {
    const m = echo();
    m.commands = { highlight: "echo.highlight@1", jump: "echo.jump@1" };
    m.conventions = ["echo.notation@1"];
    expect(manifestProblems(m)).toEqual([
      "/commands/jump names echo.jump@1, which isn't declared under /payloads",
      "/conventions/0 names echo.notation@1, which isn't declared under /payloads",
    ]);
  });

  it.each([
    ["at the top", { type: "object", properties: { text: { type: "string" }, correct: { type: "boolean" } } }, "/payloads/echo.answer@1/properties/correct"],
    ["nested, in any case", { type: "object", properties: { take: { type: "object", properties: { Score: { type: "number" } } } } }, "/payloads/echo.answer@1/properties/take/properties/Score"],
    ["as a pattern", { type: "object", patternProperties: { verdict: { type: "string" } } }, "/payloads/echo.answer@1/patternProperties/verdict"],
  ])("no answer payload carries a verdict (%s)", (_, schema, where) => {
    const m = echo();
    (m.payloads as Record<string, unknown>)["echo.answer@1"] = schema;
    expect(manifestProblems(m)).toEqual([`${where}: an answer carries what the learner did, never a verdict (Narai judges)`]);
  });

  it("a practice payload may count what it likes; only answers are judged", () => {
    const m = echo();
    (m.payloads as Record<string, unknown>)["echo.drill@1"] = { type: "object", properties: { score: { type: "number" } } };
    expect(manifestProblems(m)).toEqual([]);
  });

  it.each([
    ["no embed", { link: { url: "https://echo.example/" } }],
    ["a passive embed", { embed: { url: "https://echo.example/", sdk: "none" } }],
  ])("commands and answers need an embed that runs the SDK (%s)", (_, surfaces) => {
    const m = echo();
    m.surfaces = surfaces;
    expect(manifestProblems(m)).toEqual(["/surfaces/embed: commands and answers need an embed that runs the SDK (sdk: ^1)"]);
  });

  it("files are sorted by path, each once", () => {
    const m = echo();
    const f = (path: string) => ({ path, sha256: "0".repeat(64), size: 1 });
    m.files = [f("index.html"), f("app.js")];
    expect(manifestProblems(m)).toEqual(["/files aren't sorted by path (each once)"]);
    m.files = [f("app.js"), f("app.js")];
    expect(manifestProblems(m)).toHaveLength(1);
    m.files = [f("app.js"), f("index.html")];
    expect(manifestProblems(m)).toEqual([]);
  });
});
