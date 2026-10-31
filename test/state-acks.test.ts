import { describe, expect, it } from "vitest";
import { CommandRefused, launch } from "../src/testing.js";
import { ECHO } from "./fixtures.js";

// A command is answered once, ack or error, and the tool's state is sent on change and on request, in the payload its
// manifest names. The host side and the tool side both run here, in process.

describe("a command's answer", () => {
  it("is an ack once the tool's handler is done", async () => {
    const run = await launch(ECHO);
    run.tool.ready("en");
    run.tool.onCommand("highlight", async () => { await new Promise((r) => setTimeout(r, 5)); });
    await expect(run.host.command("highlight", { schema: "echo.highlight@1", word: "hi" })).resolves.toEqual({ ok: true });
    run.close();
  });

  it("is an error with the tool's code when its handler refuses, and `failed` when it throws", async () => {
    const run = await launch(ECHO);
    run.tool.ready("en");
    let calls = 0;
    run.tool.onCommand("highlight", () => {
      calls += 1;
      if (calls === 1) throw new CommandRefused("unsupported", "No such word here.");
      throw new Error("boom");
    });
    await expect(run.host.command("highlight", { schema: "echo.highlight@1", word: "hi" }))
      .resolves.toEqual({ ok: false, code: "unsupported", message: "No such word here." });
    await expect(run.host.command("highlight", { schema: "echo.highlight@1", word: "hi" }))
      .resolves.toEqual({ ok: false, code: "failed", message: "boom" });
    run.close();
  });

  it("is `unknown_command` or `invalid_payload` for one the contract refuses, and `failed` when none comes in time", async () => {
    const run = await launch(ECHO);
    run.tool.ready("en");
    run.tool.onCommand("highlight", () => undefined);
    const forged = { type: "narai.tool.command", v: 1, launch: "lch_testlaunch01" } as const;
    run.forgeToTool({ ...forged, id: "cmd_x1", command: "erase", payload: { schema: "echo.highlight@1", word: "hi" } });
    run.forgeToTool({ ...forged, id: "cmd_x2", command: "highlight", payload: { schema: "echo.answer@1", text: "hi" } });
    await run.settle();
    expect(run.received.commandAnswers.map((a) => [a.re, a.type === "tool.command.error" ? a.code : "ack"]))
      .toEqual([["cmd_x1", "unknown_command"], ["cmd_x2", "invalid_payload"]]);
    const silent = await launch(ECHO, { commandTimeoutMs: 30 }); // no handler: the command waits for one
    silent.tool.ready("en");
    await expect(silent.host.command("highlight", { schema: "echo.highlight@1", word: "hi" }))
      .resolves.toMatchObject({ ok: false, code: "failed" });
    run.close(); silent.close();
  });
});

describe("the tool's state", () => {
  it("goes to the host on every change, and answers a request with the latest", async () => {
    const run = await launch(ECHO);
    run.tool.ready("en");
    run.tool.state({ schema: "echo.state@1", shown: "a" });
    run.tool.state({ schema: "echo.state@1", shown: "b" });
    await run.settle();
    expect(run.received.states.map((s) => s.payload.shown)).toEqual(["a", "b"]);
    await expect(run.host.requestState()).resolves.toEqual({ schema: "echo.state@1", shown: "b" });
    run.close();
  });

  it("is only in the payload the manifest names, and never past its schema", async () => {
    const run = await launch(ECHO);
    run.tool.ready("en");
    expect(() => run.tool.state({ schema: "echo.answer@1", text: "x" })).toThrow(/state is echo.state@1/);
    run.forge({ type: "tool.state", v: 1, launch: "lch_testlaunch01", payload: { schema: "echo.state@1", shown: 1 } });
    await run.settle();
    expect(run.received.states).toEqual([]);
    expect(run.received.refused.at(-1)?.reason).toMatch(/echo.state@1/);
    run.close();
  });
});
