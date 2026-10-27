import { describe, expect, it } from "vitest";
import { checkMessage, PAYLOAD_MAX_BYTES } from "../src/index.js";
import { payloadChecks } from "../src/payloads.js";
import { ECHO, LAUNCH, TASK } from "./fixtures.js";

const base = { v: 1, launch: LAUNCH } as const;
const answer = (payload: object) => ({ ...base, type: "tool.answer", task: TASK.id, payload: { schema: "echo.answer@1", ...payload } });
const fromTool = { from: "tool", launch: LAUNCH, task: TASK } as const;
const reason = (value: unknown, ctx: Parameters<typeof checkMessage>[2] = fromTool) => {
  const checked = checkMessage(ECHO, value, ctx);
  return checked.ok ? null : checked.reason;
};

describe("checkMessage", () => {
  it("lets through what the manifest declares", () => {
    expect(reason(answer({ text: "hello" }))).toBeNull();
    expect(reason({ ...base, type: "tool.practice", activity: "drill", duration_s: 30, attempts: 4, payload: { schema: "echo.drill@1", said: 4 } })).toBeNull();
    expect(reason({ ...base, type: "narai.tool.command", command: "highlight", payload: { schema: "echo.highlight@1", word: "hi" } }, { from: "host", launch: LAUNCH })).toBeNull();
  });

  it.each([
    ["not an object", "hello", /not a contract message/],
    ["an unknown type", { ...base, type: "tool.navigate", to: "/home" }, /not a contract message/],
    ["another contract version", { ...answer({ text: "x" }), v: 2 }, /not a contract message/],
    ["a field the envelope doesn't have", { ...answer({ text: "x" }), learner: "sam" }, /not a contract message/],
    ["another launch", { ...answer({ text: "x" }), launch: "lch_someoneelse" }, /for launch lch_someoneelse, not this one/],
    ["the other side's message", { ...base, type: "narai.tool.locale", locale: "ja", fallback: [] }, /doesn't come from the tool/],
    ["another task", { ...answer({ text: "x" }), task: "item-2" }, /the task is item-1/],
    ["the wrong payload for the task", { ...base, type: "tool.answer", task: TASK.id, payload: { schema: "echo.drill@1", said: 1 } }, /takes echo.answer@1, not echo.drill@1/],
    ["an undeclared activity", { ...base, type: "tool.practice", activity: "sing", duration_s: 1, attempts: 1, payload: { schema: "echo.drill@1" } }, /activity sing isn't in the manifest/],
  ])("refuses %s", (_, value, why) => {
    expect(reason(value)).toMatch(why);
  });

  it.each(["correct", "is_correct", "Score", "verdict"])("refuses an answer that carries a verdict (%s), at any depth", (key) => {
    expect(reason(answer({ text: "x", [key]: true }))).toMatch(/never a verdict/);
    expect(reason(answer({ text: "x", take: [{ [key]: 1 }] }))).toMatch(/\/payload\/take\/0\/.+: a tool sends what the learner did, never a verdict/);
  });

  it("refuses a command the manifest doesn't list, or in another payload", () => {
    const host = { from: "host", launch: LAUNCH } as const;
    expect(reason({ ...base, type: "narai.tool.command", command: "navigate", payload: { schema: "echo.highlight@1" } }, host)).toMatch(/command navigate isn't in the manifest/);
    expect(reason({ ...base, type: "narai.tool.command", command: "highlight", payload: { schema: "echo.drill@1" } }, host)).toMatch(/takes echo.highlight@1/);
  });

  it("refuses a start in a preset or for a task the manifest doesn't declare", () => {
    const start = { ...base, type: "narai.tool.start", locale: "en", fallback: [] };
    const host = { from: "host" } as const;
    expect(reason({ ...start, preset: { schema: "echo.preset@1", words: [] } }, host)).toBeNull();
    expect(reason({ ...start, preset: { schema: "other.preset@1" } }, host)).toMatch(/isn't the manifest's preset_schema/);
    expect(reason({ ...start, task: { ...TASK, kind: "echo.sing" } }, host)).toMatch(/task kind echo.sing/);
  });

  it(`refuses a payload over ${PAYLOAD_MAX_BYTES} bytes`, () => {
    expect(reason(answer({ text: "x".repeat(PAYLOAD_MAX_BYTES) }))).toMatch(/over 65536 bytes/);
  });

  it("checks a payload's body against its declared schema, when given the checks", () => {
    const ctx = { ...fromTool, payloads: payloadChecks(ECHO) };
    expect(reason(answer({ text: "hello" }), ctx)).toBeNull();
    expect(reason(answer({ text: 42 }), ctx)).toMatch(/^echo.answer@1: \/text must be string/);
    expect(reason(answer({ text: "x", extra: 1 }), ctx)).toMatch(/must NOT have additional properties \(extra\)/);
    // without the checks only the envelope and the manifest's names are held
    expect(reason(answer({ text: 42 }))).toBeNull();
  });
});
