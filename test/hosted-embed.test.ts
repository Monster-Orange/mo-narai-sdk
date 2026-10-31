import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startHarness, type Harness } from "../dist/harness/index.js";
import { toolOrigin } from "../src/host.js";
import { echo } from "./fixtures.js";

// An embed Narai hosts names one of the bundle's files by its path from the bundle's root: Narai serves the bundle at
// the tool's own origin, and the harness serves it the same way.
const f = (path: string) => ({ path, sha256: "0".repeat(64), size: 1 });
const HOSTED = { ...echo(), surfaces: { embed: { url: "app/index.html", sdk: "^1" } }, files: [f("app/index.html"), f("app/tool.js"), f("shared.js")] };
let dir: string;
let harness: Harness;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "narai-hosted-"));
  mkdirSync(join(dir, "app"));
  writeFileSync(join(dir, "app/index.html"), "the page");
  writeFileSync(join(dir, "app/tool.js"), "the tool");
  writeFileSync(join(dir, "shared.js"), "shared");
  harness = await startHarness({ manifest: HOSTED, toolDir: dir });
});

afterAll(async () => {
  await harness?.close();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe("an embed Narai hosts", () => {
  it("is served from the bundle's root, at its relative path", async () => {
    const origin = new URL(harness.toolUrl).origin;
    expect(harness.toolUrl).toBe(`${origin}/app/index.html`);
    const text = async (path: string) => { const r = await fetch(`${origin}${path}`); return r.ok ? r.text() : r.status; };
    expect(await text("/app/index.html")).toBe("the page");
    expect(await text("/app/tool.js")).toBe("the tool");
    expect(await text("/shared.js")).toBe("shared");
  });

  it("has no origin until it's resolved: the host is handed the URL the launch frames", () => {
    expect(() => toolOrigin(HOSTED)).toThrow("narai-dev/echo's embed url app/index.html is relative: mount it with the URL Narai resolved it to");
    expect(toolOrigin(echo())).toBe("https://echo.example");
  });
});
