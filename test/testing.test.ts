import { describe, expect, it } from "vitest";
import { defineTool, manifestWarnings, type ToolManifest } from "../src/index.js";
import { launch } from "../src/testing.js";
import { ECHO, TASK, echo } from "./fixtures.js";

describe("@michinarai/sdk/testing", () => {
  it("launches a tool against Narai's host and records what the host received", async () => {
    const run = await launch(ECHO, { locale: "ja", task: TASK });
    run.tool.ready("ja");
    run.tool.answer({ schema: "echo.answer@1", text: "hello" });
    await run.settle();
    expect(run.received.ready).toHaveLength(1);
    expect(run.received.answers.map((a) => a.payload)).toEqual([{ schema: "echo.answer@1", text: "hello" }]);
    run.close();
  });

  it("forges around the SDK, and the host refuses it", async () => {
    const run = await launch(ECHO, { task: TASK });
    run.tool.ready("en");
    run.forge({ type: "tool.answer", v: 1, launch: "lch_testlaunch01", task: TASK.id, payload: { schema: "echo.answer@1", text: "x", correct: true } });
    await run.settle();
    expect(run.received.answers).toEqual([]);
    expect(run.received.refused.map((r) => r.reason)).toEqual(["/payload/correct: a tool sends what the learner did, never a verdict"]);
    run.close();
  });
});

describe("forging onto the host's window (#10)", () => {
  // A reload's hello from the tool's own frame, at its origin, reconnects it to the same launch; a hello
  // from anywhere else is refused, and only one port is ever live.
  it("a second hello from the tool's frame reconnects it on a new port; the old one is closed", async () => {
    const run = await launch(ECHO, { task: TASK });
    run.tool.ready("en");
    const again = await run.reconnect();
    expect(run.connects).toEqual(["https://echo.example", "https://echo.example"]);
    expect(again.launch).toBe(run.tool.launch);
    again.ready("en");
    run.forgeOnOldPort({ type: "tool.answer", v: 1, launch: "lch_testlaunch01", task: TASK.id, payload: { schema: "echo.answer@1", text: "old port" } });
    await run.settle();
    expect(run.received.answers).toEqual([]);
    run.close();
  });

  it("a hello from another page or origin gets no connect, and an answer posted around the port is never taken", async () => {
    const run = await launch(ECHO, { task: TASK });
    run.tool.ready("en");
    run.postToHost({ type: "tool.hello", v: 1 }, { source: {} });
    run.postToHost({ type: "tool.hello", v: 1 }, { origin: "https://evil.example" });
    run.postToHost({ type: "tool.answer", v: 1, launch: "lch_testlaunch01", task: TASK.id, payload: { schema: "echo.answer@1", text: "around" } });
    await run.settle();
    expect(run.connects).toEqual(["https://echo.example"]);
    expect(run.received.answers).toEqual([]);
    run.close();
  });
});

describe("the host's practice limit (#6)", () => {
  it("takes a burst, then so many a minute; the excess is refused and counted", async () => {
    let now = 0;
    const run = await launch(ECHO, { practiceLimit: { burst: 10, perMinute: 6 }, now: () => now });
    run.tool.ready("en");
    for (let i = 0; i < 1000; i++) run.tool.practice("drill", { duration_s: 1, attempts: 1, payload: { schema: "echo.drill@1", said: 1 } });
    await run.settle();
    expect(run.received.practice).toHaveLength(10);
    expect(run.received.refused).toHaveLength(990);
    expect(run.received.refused[0]?.reason).toBe("practice over the limit (10, then 6 a minute)");
    now += 60_000;
    run.tool.practice("drill", { duration_s: 1, attempts: 1, payload: { schema: "echo.drill@1", said: 1 } });
    await run.settle();
    expect(run.received.practice).toHaveLength(11);
    run.close();
  });

  it("is on by default", async () => {
    const run = await launch(ECHO);
    run.tool.ready("en");
    for (let i = 0; i < 1000; i++) run.tool.practice("drill", { duration_s: 1, attempts: 1, payload: { schema: "echo.drill@1", said: 1 } });
    await run.settle();
    expect(run.received.practice.length).toBeLessThan(20);
    run.close();
  });
});

describe("defineTool and JSON (#9)", () => {
  it("takes a manifest read as JSON, its strings widened", () => {
    const json: unknown = JSON.parse(JSON.stringify(ECHO));
    const widened = json as { capabilities: { network: string }; assist: string };
    const tool: Readonly<ToolManifest> = defineTool(widened);
    expect(tool.id).toBe("narai-dev/echo");
    expect(() => defineTool({ ...widened, assist: "always" })).toThrow(/assist/);
  });
});

describe("manifestWarnings (#7)", () => {
  it("warns when a payload schema names `schema`: it describes the body only", () => {
    const m = echo();
    (m.payloads as Record<string, unknown>)["echo.answer@1"] = { type: "object", properties: { schema: { const: "echo.answer@1" }, text: { type: "string" } }, required: ["schema", "text"] };
    expect(manifestWarnings(m)).toEqual(["/payloads/echo.answer@1 names `schema`: describe the body only (the SDK adds and removes `schema`)"]);
    expect(manifestWarnings(ECHO)).toEqual([]);
  });
});
