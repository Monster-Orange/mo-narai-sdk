import { afterEach, describe, expect, it, vi } from "vitest";
import { connect, mountTool, ToolMessageError, type HostSession, type PortLike, type ToolSession } from "../src/index.js";
import { payloadChecks } from "../src/payloads.js";
import { browserPair, HOST_ORIGIN } from "../src/testing.js";
import { ECHO, LAUNCH, TASK } from "./fixtures.js";

const HOST = HOST_ORIGIN;
const TOOL = "https://echo.example";
const frameAndWindow = (as: Parameters<typeof browserPair>[1] = {}) => {
  const pair = browserPair(ECHO, as);
  return { ...pair, win: pair.toolWindow };
};

const ports: { close(): void }[] = [];
function channel() {
  const c = new MessageChannel();
  ports.push(c.port1, c.port2);
  return c as unknown as { port1: PortLike; port2: Transferable };
}
afterEach(() => { for (const p of ports.splice(0)) p.close(); });

const tick = () => new Promise((r) => setTimeout(r, 10));

async function launch(options: Partial<Parameters<typeof mountTool>[1]> = {}) {
  const { win, frame, hostWindow, posted } = frameAndWindow();
  const host = {
    ready: vi.fn(), answer: vi.fn(), practice: vi.fn(), close: vi.fn(), refused: vi.fn(),
  };
  const toolRefused = vi.fn();
  const connected = connect(ECHO, { hostOrigins: [HOST], window: win, onRefused: toolRefused });
  const session: HostSession = mountTool(ECHO, {
    frame, launch: LAUNCH, locale: "ja", fallback: ["en"], task: TASK, preset: { schema: "echo.preset@1", words: ["hi"] },
    onReady: host.ready, onAnswer: host.answer, onPractice: host.practice, onClose: host.close, onRefused: host.refused,
    payloads: payloadChecks(ECHO), channel, window: hostWindow, ...options,
  });
  const tool: ToolSession = await connected;
  return { tool, session, host, toolRefused, posted };
}

describe("the handshake", () => {
  it("hands the port to the tool's origin only, then starts it", async () => {
    const { tool, posted } = await launch();
    expect(posted).toEqual(["https://echo.example"]);
    expect(tool.launch).toBe(LAUNCH);
    expect(tool.start).toMatchObject({ locale: "ja", fallback: ["en"], preset: { words: ["hi"] } });
    expect(tool.task).toEqual(TASK);
  });

  it("waits for the tool's hello: a tool that loads late misses nothing", async () => {
    const { win, frame, hostWindow, posted } = frameAndWindow();
    const session = mountTool(ECHO, { frame, window: hostWindow, launch: LAUNCH, locale: "en", task: TASK, channel });
    session.command("highlight", { schema: "echo.highlight@1", word: "early" });
    await tick();
    expect(posted).toEqual([]);
    const tool = await connect(ECHO, { hostOrigins: [HOST], window: win });
    await tick();
    const highlight = vi.fn();
    tool.onCommand("highlight", highlight);
    expect(tool.task).toEqual(TASK);
    // sent before the tool was there, held until it took the command
    expect(highlight).toHaveBeenCalledWith({ schema: "echo.highlight@1", word: "early" }, expect.anything());
    expect(posted).toEqual([TOOL]);
  });

  it("takes a hello only from its frame, at the tool's origin", async () => {
    const { win, frame, hostWindow, posted, hostListeners } = frameAndWindow({ helloOrigin: "https://evil.example" });
    mountTool(ECHO, { frame, window: hostWindow, launch: LAUNCH, locale: "en", channel });
    await expect(connect(ECHO, { hostOrigins: [HOST], window: win, timeoutMs: 50 })).rejects.toThrow();
    expect(posted).toEqual([]);
    expect(hostListeners.size).toBe(1);
  });

  it.each([
    ["an origin the tool doesn't list", { origin: "https://evil.example" }],
    ["a window that isn't its parent", { source: {} }],
  ])("ignores a connect from %s", async (_, as) => {
    const { win, frame, hostWindow, toolListeners } = frameAndWindow(as);
    mountTool(ECHO, { frame, window: hostWindow, launch: LAUNCH, locale: "en", channel });
    const connected = connect(ECHO, { hostOrigins: [HOST], window: win, timeoutMs: 50 });
    await expect(connected).rejects.toThrow("Narai's host didn't connect");
    expect(toolListeners.size).toBe(0);
  });

  it("a tool served from this machine takes a host on this machine (narai dev), and only then", async () => {
    for (const [hostname, expected] of [["127.0.0.1", true], ["echo.example", false]] as const) {
      const { win, frame, hostWindow } = frameAndWindow({ origin: "http://localhost:5173" });
      mountTool(ECHO, { frame, window: hostWindow, launch: LAUNCH, locale: "en", channel });
      const connected = connect(ECHO, { hostOrigins: [HOST], window: { ...win, location: { hostname } }, timeoutMs: 50 });
      expect(await connected.then(() => true, () => false)).toBe(expected);
    }
  });
});

describe("the session", () => {
  it("carries ready, the answer and practice to the host", async () => {
    const { tool, host } = await launch();
    tool.ready("ja");
    tool.answer({ schema: "echo.answer@1", text: "こんにちは" });
    tool.practice("drill", { duration_s: 12, attempts: 3, payload: { schema: "echo.drill@1", said: 3 } });
    await tick();
    expect(host.ready).toHaveBeenCalledWith(expect.objectContaining({ tool: "narai-dev/echo", version: "0.1.0", locale: "ja" }));
    expect(host.answer).toHaveBeenCalledWith(expect.objectContaining({ task: "item-1", payload: { schema: "echo.answer@1", text: "こんにちは" } }));
    expect(host.practice).toHaveBeenCalledWith(expect.objectContaining({ activity: "drill", attempts: 3 }));
    expect(host.refused).not.toHaveBeenCalled();
  });

  it("delivers a declared command, and the host can't send another", async () => {
    const { tool, session } = await launch();
    const highlight = vi.fn();
    tool.onCommand("highlight", highlight);
    expect(() => tool.onCommand("navigate", vi.fn())).toThrow("command navigate isn't in the manifest");
    session.command("highlight", { schema: "echo.highlight@1", word: "hi" });
    expect(() => session.command("navigate", { schema: "echo.highlight@1" })).toThrow(ToolMessageError);
    await tick();
    expect(highlight).toHaveBeenCalledWith({ schema: "echo.highlight@1", word: "hi" }, expect.objectContaining({ command: "highlight" }));
  });

  it("the tool won't send what its manifest doesn't declare, or a verdict", async () => {
    const { tool } = await launch();
    tool.ready("ja");
    expect(() => tool.practice("sing", { duration_s: 1, attempts: 1, payload: { schema: "echo.drill@1" } })).toThrow(/activity sing isn't in the manifest/);
    expect(() => tool.answer({ schema: "echo.answer@1", text: "x", correct: true })).toThrow(/never a verdict/);
  });

  it("the host refuses what a tool writes to the port around the SDK, and anything before ready", async () => {
    let toolPort: PortLike | undefined;
    const { host } = await launch({ channel: () => { const c = channel(); toolPort = c.port2 as unknown as PortLike; return c; } });
    const forge = (message: object) => toolPort?.postMessage({ v: 1, launch: LAUNCH, ...message });
    forge({ type: "tool.answer", task: TASK.id, payload: { schema: "echo.answer@1", text: "early" } });
    await tick();
    expect(host.refused).toHaveBeenLastCalledWith(expect.objectContaining({ reason: "tool.answer before tool.ready" }));
    forge({ type: "tool.ready", tool: "narai-dev/echo", version: "0.1.0", locale: "ja" });
    forge({ type: "tool.answer", task: TASK.id, payload: { schema: "echo.answer@1", text: "x", passed: true } });
    forge({ type: "tool.navigate", to: "/settings" });
    forge({ type: "tool.answer", task: TASK.id, payload: { schema: "echo.answer@1", text: "ok" }, launch: "lch_another0001" });
    await tick();
    expect(host.ready).toHaveBeenCalledOnce();
    expect(host.answer).not.toHaveBeenCalled();
    expect(host.refused.mock.calls.map(([r]) => r.reason)).toEqual([
      "tool.answer before tool.ready",
      "/payload/passed: a tool sends what the learner did, never a verdict",
      expect.stringMatching(/^not a contract message/),
      "for launch lch_another0001, not this one",
    ]);
  });

  it("the host checks payload bodies against the manifest's schemas", async () => {
    const { tool, host } = await launch({ payloads: () => null });
    tool.ready("ja");
    const forged = await launch();
    forged.tool.ready("ja");
    // the tool side holds no body checks here (a tool under a strict CSP); the host holding them refuses
    forged.tool.answer({ schema: "echo.answer@1", text: 42 } as never);
    tool.answer({ schema: "echo.answer@1", text: 42 } as never);
    await tick();
    expect(forged.host.answer).not.toHaveBeenCalled();
    expect(forged.host.refused).toHaveBeenCalledWith(expect.objectContaining({ reason: expect.stringMatching(/^echo.answer@1: \/text must be string/) }));
    expect(host.answer).toHaveBeenCalledOnce();
  });

  it("closes: nothing crosses after", async () => {
    const { tool, host } = await launch();
    tool.ready("ja");
    tool.close("done");
    await tick();
    expect(host.close).toHaveBeenCalledWith(expect.objectContaining({ reason: "done" }));
    expect(() => tool.answer({ schema: "echo.answer@1", text: "late" })).toThrow("not sent: the session is closed");
  });
});
