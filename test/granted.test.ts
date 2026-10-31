import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startHarness } from "../dist/harness/index.js";
import { checkMessage } from "../src/messages.js";
import { launch } from "../src/testing.js";
import { echo } from "./fixtures.js";

// What a step lets the tool use, for one launch (narai.tool.start's `granted`): the microphone, only. Narai grants what
// the step grants and the manifest declares, and drops the rest without refusing the launch; the SDK's host does too.
const withMic = () => { const m = echo(); m.capabilities = { ...m.capabilities, microphone: true }; return m; };

describe("a launch's grant", () => {
  it("reaches the tool on its start", async () => {
    const run = await launch(withMic(), { granted: ["microphone"] });
    expect(run.tool.start.granted).toEqual(["microphone"]);
    run.close();
  });

  it("is nothing when the step grants nothing", async () => {
    const run = await launch(withMic());
    expect(run.tool.start.granted ?? []).toEqual([]);
    run.close();
  });

  it("drops what the manifest doesn't declare, and still starts", async () => {
    const run = await launch(echo(), { granted: ["microphone"] });
    expect(run.tool.start.granted ?? []).toEqual([]);
    expect(run.received.refused).toEqual([]);
    expect(run.toolRefused).toEqual([]);
    run.close();
  });

  it("is refused on a start that grants what the manifest doesn't declare", () => {
    const start = { type: "narai.tool.start", v: 1, launch: "lch_testlaunch01", locale: "en", fallback: [], granted: ["microphone"] };
    expect(checkMessage(echo(), start, { from: "host" })).toEqual({ ok: false, reason: "granted microphone, which the manifest doesn't declare (capabilities.microphone)" });
    expect(checkMessage(withMic(), start, { from: "host" })).toEqual({ ok: true, message: start });
    expect(checkMessage(withMic(), { ...start, granted: ["camera"] }, { from: "host" }).ok).toBe(false);
  });

  it("is simulated in the harness", async () => {
    const dir = mkdtempSync(join(tmpdir(), "narai-granted-"));
    const harness = await startHarness({ manifest: withMic(), toolDir: dir, granted: ["microphone"] });
    try {
      const config = await (await fetch(`${harness.hostUrl}harness.json`)).json() as { granted: string[] };
      expect(config.granted).toEqual(["microphone"]);
    } finally {
      await harness.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
