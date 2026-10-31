import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser, type Frame, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startHarness, type Harness, type HarnessEvent } from "../dist/harness/index.js";
import { ECHO, TASK } from "./fixtures.js";

// The local harness, headless: Narai's host page on localhost, the tool on 127.0.0.1 in a sandboxed iframe, the
// real SDK on both sides, as `narai dev` runs it.
let browser: Browser;
let harness: Harness;
let page: Page;
let tool: Frame;
let dir: string;

const events = () => page.evaluate(() => window.__narai.events) as Promise<HarnessEvent[]>;
const until = (type: string, n = 1) => expect.poll(async () => (await events()).filter((e) => e.type === type).length, { timeout: 5000 }).toBeGreaterThanOrEqual(n);

declare global { interface Window { __narai: { events: HarnessEvent[]; ready: boolean } } }

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "narai-echo-"));
  cpSync(new URL("./fixtures/echo-tool", import.meta.url), dir, { recursive: true });
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(ECHO));
  harness = await startHarness({ manifest: ECHO, toolDir: dir, locale: "ja", fallback: ["en"], task: TASK });
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage();
  // what either page said, to show when the tool never gets ready
  const said: string[] = [];
  page.on("console", (m) => said.push(`${m.type()}: ${m.text()}`));
  page.on("pageerror", (e) => said.push(`error: ${e.message}`));
  await page.goto(harness.hostUrl);
  await page.waitForFunction(() => window.__narai?.ready === true, undefined, { timeout: 10_000 })
    .catch((error: Error) => { throw new Error(`${error.message}\n${said.join("\n")}`); });
  const frame = page.frames().find((f) => f.url().startsWith(harness.toolUrl));
  if (!frame) throw new Error("the tool's frame didn't load");
  tool = frame;
}, 30_000);

afterAll(async () => {
  await browser?.close();
  await harness?.close();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe("the harness", () => {
  it("answers at localhost whichever address it resolves to: the IPv4 one every client falls back to too", async () => {
    // where localhost resolves to ::1 first (macOS, Docker), a host bound to "localhost" refused 127.0.0.1
    const port = new URL(harness.hostUrl).port;
    expect((await fetch(`http://127.0.0.1:${port}/`)).status).toBe(200);
  });
  it("mounts the tool on another origin, sandboxed, where it can't reach the host", async () => {
    expect(new URL(harness.hostUrl).hostname).toBe("localhost");
    expect(new URL(tool.url()).hostname).toBe("127.0.0.1");
    expect(await page.locator("iframe#tool").getAttribute("sandbox")).toBe("allow-scripts allow-same-origin");
    expect(await tool.locator("#isolated").textContent()).toBe("isolated");
  });

  it("starts the tool on the task, and it says it's ready in the host's locale", async () => {
    expect(await tool.locator("#prompt").textContent()).toBe(TASK.prompt);
    const ready = (await events()).find((e) => e.type === "tool.ready");
    expect(ready).toMatchObject({ ok: true, message: { tool: "narai-dev/echo", locale: "ja" } });
  });

  it("carries the learner's answer and practice to the host, each checked in Node against the manifest", async () => {
    await tool.locator("#say").click();
    await tool.locator("#drill").click();
    await until("tool.practice");
    const got = await events();
    expect(got.find((e) => e.type === "tool.answer")).toMatchObject({ ok: true, message: { task: TASK.id, payload: { text: "hello" } } });
    expect(got.find((e) => e.type === "tool.practice")).toMatchObject({ ok: true, message: { activity: "drill" } });
    expect(harness.events.map((e) => e.type)).toEqual(expect.arrayContaining(["tool.ready", "tool.answer", "tool.practice"]));
  });

  it("the SDK in the tool won't send a verdict", async () => {
    await tool.locator("#cheat").click();
    expect(await tool.locator("#error").textContent()).toMatch(/never a verdict/);
  });

  it("sends a declared command as the Tutor, and the tool acts on it", async () => {
    await page.locator("#commands select").selectOption("highlight");
    await page.locator("#commands textarea").fill('{"word": "こんにちは"}');
    await page.locator("#commands button").click();
    await expect.poll(() => tool.locator("#highlighted").textContent()).toBe("こんにちは");
    await until("narai.tool.command");
  });

  it("refuses a body its declared schema doesn't allow (checked in Node)", async () => {
    await tool.locator("#text").fill("x".repeat(300));
    await tool.locator("#say").click();
    await expect.poll(async () => (await events()).filter((e) => e.type === "tool.answer" && !e.ok).length).toBe(1);
    const refused = (await events()).find((e) => e.type === "tool.answer" && !e.ok);
    expect(refused?.reason).toMatch(/^echo.answer@1: \/text must NOT have more than 200 characters/);
  });
});

describe("a reloaded tool frame (sdk#19)", () => {
  it("says hello again and gets the same launch: a second tool.ready", async () => {
    const before = (await events()).filter((e) => e.type === "tool.ready").length;
    await tool.goto(tool.url());
    await until("tool.ready", before + 1);
    const ready = (await events()).filter((e) => e.type === "tool.ready");
    expect(ready.at(-1)).toMatchObject({ ok: true });
  }, 20_000);
});
