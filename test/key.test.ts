import { describe, expect, it } from "vitest";
import { checkMessage } from "../src/messages.js";
import { launch } from "../src/testing.js";
import type { KeyTarget } from "../src/tool.js";
import { ECHO, echo } from "./fixtures.js";

// An Escape the learner pressed in the tool, that the tool left alone, goes to the host (tool.key): the lesson closes
// the dialog the tool is shown in, even while focus is in the frame. Only Escape, and never one the tool kept, a
// repeat, or one that cancels an IME candidate.
type Key = { key?: string; repeat?: boolean; isComposing?: boolean; keyCode?: number };
const press = (keys: EventTarget, init: Key = {}, keep?: (e: Event) => void) => {
  const e = Object.assign(new Event("keydown", { cancelable: true }), { key: "Escape", repeat: false, isComposing: false, keyCode: 27, ...init });
  if (keep) keys.addEventListener("keydown", keep, { once: true });
  keys.dispatchEvent(e);
};
// a window hears keydowns as KeyboardEvents; an EventTarget, typed for any Event, stands in for it here
const asKeys = (t: EventTarget) => t as unknown as KeyTarget;
const later = () => new Promise((r) => setTimeout(r, 20));

describe("an Escape in the tool", () => {
  it("goes to the host when the tool leaves it alone", async () => {
    const keys = new EventTarget();
    const run = await launch(ECHO, { keys: asKeys(keys) });
    run.tool.ready("en");
    press(keys);
    await later();
    await run.settle();
    expect(run.received.keys).toEqual([{ type: "tool.key", v: 1, launch: run.tool.launch, key: "Escape" }]);
    expect(run.received.refused).toEqual([]);
    run.close();
  });

  it("stays in the tool when the tool keeps it, even from a listener added after the SDK's", async () => {
    const keys = new EventTarget();
    const run = await launch(ECHO, { keys: asKeys(keys) });
    press(keys, {}, (e) => e.preventDefault());
    await later();
    await run.settle();
    expect(run.received.keys).toEqual([]);
    run.close();
  });

  it.each([
    ["another key", { key: "Enter", keyCode: 13 }],
    ["a repeat", { repeat: true }],
    ["an IME composition", { isComposing: true }],
    ["an IME's keyCode 229", { keyCode: 229 }],
  ])("stays in the tool: %s", async (_, init) => {
    const keys = new EventTarget();
    const run = await launch(ECHO, { keys: asKeys(keys) });
    press(keys, init);
    await later();
    await run.settle();
    expect(run.received.keys).toEqual([]);
    run.close();
  });

  it("goes even before the tool says it's ready: the learner can always close it", async () => {
    const keys = new EventTarget();
    const run = await launch(echo(), { keys: asKeys(keys) });
    // no ready() yet
    press(keys);
    await later();
    await run.settle();
    expect(run.received.keys).toHaveLength(1);
    run.close();
  });

  it("stops going once the tool closes", async () => {
    const keys = new EventTarget();
    const run = await launch(ECHO, { keys: asKeys(keys) });
    run.tool.close("done");
    press(keys);
    await later();
    await run.settle();
    expect(run.received.keys).toEqual([]);
    run.close();
  });

  it("is one shape: Escape only, on this launch, nothing else", () => {
    const ok = { type: "tool.key", v: 1, launch: "lch_testlaunch01", key: "Escape" };
    expect(checkMessage(ECHO, ok, { from: "tool", launch: "lch_testlaunch01" }).ok).toBe(true);
    for (const bad of [{ ...ok, key: "Enter" }, { type: "tool.key", v: 1, key: "Escape" }, { ...ok, code: "Escape" }]) {
      expect(checkMessage(ECHO, bad, { from: "tool", launch: "lch_testlaunch01" }).ok, JSON.stringify(bad)).toBe(false);
    }
  });
});
