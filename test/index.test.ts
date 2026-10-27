import { expect, test } from "vitest";
import { CONTRACT_VERSION } from "../src/index.js";

test("the SDK speaks contract version 1", () => {
  expect(CONTRACT_VERSION).toBe(1);
});
