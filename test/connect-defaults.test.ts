import { afterEach, describe, expect, it } from "vitest";
import { connect, defineTool } from "../src/index.js";
import { echo } from "./fixtures.js";

// `connect(manifest)`, as the README and `narai init`'s template call it: every option has a default, the window too.
describe("connect with no options", () => {
  const g = globalThis as { window?: unknown };
  afterEach(() => { delete g.window; });

  it("uses the page's window and says hello to its parent", async () => {
    const posted: unknown[] = [];
    g.window = {
      parent: { postMessage: (message: unknown) => posted.push(message) },
      location: { hostname: "tools.example" },
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    };
    const waiting = connect(defineTool(echo()));
    await Promise.resolve();
    expect(posted).toEqual([expect.objectContaining({ type: "tool.hello" })]);
    void waiting.catch(() => undefined);
  });
});
