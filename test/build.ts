import { execFileSync } from "node:child_process";

/** The harness serves the built SDK (dist/) to both pages; build it once before the tests. */
export default function setup(): void {
  execFileSync("npm", ["run", "-s", "build"], { stdio: "inherit" });
}
