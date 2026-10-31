import { describe, expect, it } from "vitest";
import { launch } from "../src/testing.js";
import { ECHO } from "./fixtures.js";

// sdk#19: a tool frame that reloads says hello again; the host hands it a new port and the same launch, so its storage
// is still there. And the host reports each storage call with its answer (the harness records them).
describe("a reloaded tool", () => {
  it("is connected again, to the same launch and its storage, and must say ready again", async () => {
    const run = await launch(ECHO);
    run.tool.ready("en");
    await run.tool.storage.set("kept", { bpm: 90 });
    const again = await run.reconnect();
    expect(again.launch).toBe(run.tool.launch);
    expect(again.start.task).toEqual(run.tool.start.task);
    again.ready("en");
    await expect(again.storage.get("kept")).resolves.toEqual({ ok: true, value: { bpm: 90 } });
    await run.settle();
    expect(run.received.ready).toHaveLength(2);
    run.close();
  });

  it("reports every storage call with its answer", async () => {
    const run = await launch(ECHO);
    run.tool.ready("en");
    await run.tool.storage.set("a", 1);
    await run.tool.storage.get("missing");
    expect(run.received.storage.map(({ call, result }) => [call.type, call.key, result.ok, result.error ?? null])).toEqual([
      ["tool.storage.set", "a", true, null],
      ["tool.storage.get", "missing", false, "not_found"],
    ]);
    run.close();
  });
});
