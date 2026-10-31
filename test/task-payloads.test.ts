import { describe, expect, it } from "vitest";
import { checkMessage, manifestProblems } from "../src/index.js";
import { echo, TASK } from "./fixtures.js";

// A task can carry what to show (Task.payload); the manifest says, per task kind, which payload (`task_payloads`). A
// kind declared there carries it, matching; any other kind carries none. Narai's registry and launches check the same.
const withShown = () => {
  const m = echo();
  m.payloads = { ...m.payloads, "echo.shown@1": { type: "object", properties: { words: { type: "array", items: { type: "string" } } }, required: ["words"] } };
  m.task_payloads = { "echo.say": "echo.shown@1" };
  return m;
};
const start = (task: object) => ({ type: "narai.tool.start", v: 1, launch: "lch_test0000001", locale: "en", fallback: [], task: { ...TASK, ...task } });

describe("a task's payload", () => {
  it("is declared per task kind: a payload the manifest has, for a kind it answers, never a verdict", () => {
    expect(manifestProblems(withShown())).toEqual([]);
    const m = withShown();
    m.task_payloads = { "echo.say": "echo.missing@1", sing: "echo.shown@1" };
    expect(manifestProblems(m)).toEqual([
      "/task_payloads/echo.say names echo.missing@1, which isn't declared under /payloads",
      "/task_payloads/sing names a task kind the manifest doesn't answer",
    ]);
  });

  it("is the kind's declared payload at the start, and none for a kind that declares none", () => {
    const m = withShown();
    const ok = start({ payload: { schema: "echo.shown@1", words: ["hi"] } });
    expect(checkMessage(m, ok, { from: "host" })).toMatchObject({ ok: true });
    expect(checkMessage(m, start({}), { from: "host" })).toMatchObject({ ok: false, reason: expect.stringMatching(/carries echo.shown@1/) });
    expect(checkMessage(m, start({ payload: { schema: "echo.answer@1", text: "x" } }), { from: "host" }))
      .toMatchObject({ ok: false, reason: expect.stringMatching(/carries echo.shown@1/) });
    expect(checkMessage(echo(), start({ payload: { schema: "echo.shown@1", words: [] } }), { from: "host" }))
      .toMatchObject({ ok: false, reason: expect.stringMatching(/carries no payload/) });
  });
});
