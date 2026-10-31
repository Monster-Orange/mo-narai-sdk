import { describe, expect, it } from "vitest";
import { launch, memoryStorage } from "../src/testing.js";
import { ECHO } from "./fixtures.js";

// A launch's own storage: the tool names a key, the host scopes it to the tool and the launch and keeps it (Narai's
// host in its store, the harness in memory). A get of a missing key is not_found; a stored null is a value.

describe("a launch's storage", () => {
  it("keeps what the tool sets, reads it back, and forgets a deleted key", async () => {
    const run = await launch(ECHO);
    run.tool.ready("en");
    await expect(run.tool.storage.get("last.tempo")).resolves.toEqual({ ok: false, error: "not_found" });
    await expect(run.tool.storage.set("last.tempo", { bpm: 90 })).resolves.toEqual({ ok: true });
    await expect(run.tool.storage.set("cleared", null)).resolves.toEqual({ ok: true });
    await expect(run.tool.storage.get("last.tempo")).resolves.toEqual({ ok: true, value: { bpm: 90 } });
    await expect(run.tool.storage.get("cleared")).resolves.toEqual({ ok: true, value: null });
    await expect(run.tool.storage.delete("last.tempo")).resolves.toEqual({ ok: true });
    await expect(run.tool.storage.delete("last.tempo")).resolves.toEqual({ ok: true }); // idempotent
    await expect(run.tool.storage.get("last.tempo")).resolves.toEqual({ ok: false, error: "not_found" });
    run.close();
  });

  it("is one launch's: another launch of the same tool sees none of it", async () => {
    const shared = memoryStorage();
    const one = await launch(ECHO, { launch: "lch_launchone01", storage: shared });
    const two = await launch(ECHO, { launch: "lch_launchtwo02", storage: shared });
    one.tool.ready("en"); two.tool.ready("en");
    await one.tool.storage.set("k", 1);
    await expect(two.tool.storage.get("k")).resolves.toEqual({ ok: false, error: "not_found" });
    one.close(); two.close();
  });

  it("refuses a key that isn't a short slug, and a value over 16 KB, before it goes", async () => {
    const run = await launch(ECHO);
    run.tool.ready("en");
    await expect(run.tool.storage.get("../other")).rejects.toThrow(/key/);
    await expect(run.tool.storage.set("big", "x".repeat(16 * 1024))).rejects.toThrow(/16384 bytes/);
    run.close();
  });

  it("passes on the host's errors: quota past its limits", async () => {
    const run = await launch(ECHO, { storage: memoryStorage({ maxKeys: 1 }) });
    run.tool.ready("en");
    await run.tool.storage.set("a", 1);
    await expect(run.tool.storage.set("b", 2)).resolves.toEqual({ ok: false, error: "quota" });
    run.close();
  });
});
