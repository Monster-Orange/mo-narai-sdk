import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startHarness, type Harness } from "../dist/harness/index.js";
import type { ToolManifest } from "../src/index.js";
import { echo } from "./fixtures.js";

// `narai dev --subject`: the harness starts the tool as Narai starts it for a learner who linked their account with
// the tool's publisher and chose to let its tools know them. As in a lesson, only a manifest that declares
// surfaces.account_link gets it; and the start the host sent is in the harness's events.
const SUBJECT = "a".repeat(40) + "_-Z";
const LINK = { url: "https://echo.example/connect", client_id: "https://echo.example/oauth/client.json", webhook: "https://echo.example/narai/unlinked" };
const withLink = () => { const m = echo(); m.surfaces = { ...m.surfaces, account_link: LINK }; return m; };

let browser: Browser;
const runs: { harness: Harness; dir: string }[] = [];

async function open(manifest: ToolManifest) {
  const dir = mkdtempSync(join(tmpdir(), "narai-subject-"));
  cpSync(new URL("./fixtures/echo-tool", import.meta.url), dir, { recursive: true });
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest));
  const harness = await startHarness({ manifest, toolDir: dir, subject: SUBJECT });
  runs.push({ harness, dir });
  const page = await browser.newPage();
  await page.goto(harness.hostUrl);
  await page.waitForFunction(() => (window as unknown as { __narai?: { ready: boolean } }).__narai?.ready === true, undefined, { timeout: 10_000 });
  const tool = page.frames().find((f) => f.url().startsWith(harness.toolUrl));
  if (!tool) throw new Error("the tool's frame didn't load");
  return { harness, tool };
}

beforeAll(async () => { browser = await chromium.launch({ headless: true }); }, 30_000);
afterAll(async () => {
  await browser?.close();
  for (const { harness, dir } of runs) { await harness.close(); rmSync(dir, { recursive: true, force: true }); }
});

describe("the harness, for a linked learner", () => {
  it("starts a tool that declares account linking with the subject, and records the start it sent", async () => {
    const { harness, tool } = await open(withLink());
    expect(await tool.locator("#subject").textContent()).toBe(SUBJECT);
    expect(harness.events.find((e) => e.type === "narai.tool.start")).toMatchObject({ direction: "out", ok: true, message: { subject: SUBJECT } });
  }, 30_000);

  it("drops it for a tool that declares none, as a lesson does", async () => {
    const { harness, tool } = await open(echo());
    expect(await tool.locator("#subject").textContent()).toBe("none");
    expect(harness.events.find((e) => e.type === "narai.tool.start")?.message).not.toHaveProperty("subject");
  }, 30_000);
});
