import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("the generated types and validators", () => {
  it("are what schema/ generates (run `npm run generate` and commit)", () => {
    // exits 1 and names the stale file when src/generated/ differs from what the schemas give
    expect(() => execFileSync("node", ["scripts/generate.mjs", "--check"], { stdio: "pipe" })).not.toThrow();
  });
});
