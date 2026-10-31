import { afterEach, describe, expect, it, vi } from "vitest";
import { connect, CONNECT_TIMEOUT_MS, mountTool, NARAI_HOST_ORIGINS, type PortLike } from "../src/index.js";
import * as host from "../src/host-entry.js";
import { browserPair } from "../src/testing.js";
import { ECHO, LAUNCH } from "./fixtures.js";

const ports: { close(): void }[] = [];
const channel = () => { const c = new MessageChannel(); ports.push(c.port1, c.port2); return c as unknown as { port1: PortLike; port2: Transferable }; };
afterEach(() => { for (const p of ports.splice(0)) p.close(); vi.useRealTimers(); });

/** A tool on `toolHost` (its own hostname), connected to by a host at `hostOrigin`, with connect's defaults. */
async function connects(hostOrigin: string, toolHost = "echo.example"): Promise<boolean> {
  const pair = browserPair(ECHO, { origin: hostOrigin });
  mountTool(ECHO, { frame: pair.frame, window: pair.hostWindow, launch: LAUNCH, locale: "en", channel });
  return connect(ECHO, { window: { ...pair.toolWindow, location: { hostname: toolHost } }, timeoutMs: 50 }).then(() => true, () => false);
}

describe("Narai's host origins, by default", () => {
  it("are Narai's own, and nothing local", () => {
    expect(NARAI_HOST_ORIGINS).toEqual(["https://michinar.ai", "https://beta.michinar.ai"]);
    expect(Object.isFrozen(NARAI_HOST_ORIGINS)).toBe(true);
  });

  it.each([
    ["https://michinar.ai", "echo.example", true],
    ["https://beta.michinar.ai", "echo.example", true],
    ["https://evil.example", "echo.example", false],
    // a local Narai or a host on this machine only for a tool in development
    ["https://local.michinar.ai", "echo.example", false],
    ["http://127.0.0.1:5832", "echo.example", false],
    ["https://local.michinar.ai", "127.0.0.1", true],
    ["https://local.michinar.ai", "tools.local.michinar.ai", true],
    ["http://localhost:5832", "localhost", true],
    ["http://local.michinar.ai", "127.0.0.1", false],
  ])("a host at %s, a tool on %s: %s", async (hostOrigin, toolHost, taken) => {
    expect(await connects(hostOrigin, toolHost)).toBe(taken);
  });
});

describe("the connect timeout", () => {
  it(`is CONNECT_TIMEOUT_MS (${CONNECT_TIMEOUT_MS} ms) unless given`, async () => {
    vi.useFakeTimers();
    const pair = browserPair(ECHO);
    const waiting = connect(ECHO, { window: pair.toolWindow });
    const outcome = waiting.then(() => "connected", (e: Error) => e.message);
    await vi.advanceTimersByTimeAsync(CONNECT_TIMEOUT_MS - 1);
    expect(pair.toolListeners.size).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await outcome).toBe("Narai's host didn't connect");
    expect(pair.toolListeners.size).toBe(0);
  });

  it("Infinity waits", async () => {
    vi.useFakeTimers();
    const pair = browserPair(ECHO);
    void connect(ECHO, { window: pair.toolWindow, timeoutMs: Infinity });
    await vi.advanceTimersByTimeAsync(CONNECT_TIMEOUT_MS * 100);
    expect(pair.toolListeners.size).toBe(1);
  });
});

describe("@michinarai/sdk/host", () => {
  it("is the host's side only: mountTool, toolOrigin and the shared constants", () => {
    expect(Object.keys(host).sort()).toEqual(["COMMAND_TIMEOUT_MS", "CONNECT_TIMEOUT_MS", "NARAI_HOST_ORIGINS", "httpStorage", "memoryStorage", "mountTool", "toolOrigin"]);
  });
});
