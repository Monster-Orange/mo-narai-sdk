import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { musicMatch } from "../src/index.js";

// The play_passage matcher's shared cases (schema/music_match.cases.json, copied from Narai unchanged): Narai's judge
// runs every one, and so does this preview of it, so a tool shows the learner what Narai will grade.
const { cases } = JSON.parse(readFileSync(new URL("../schema/music_match.cases.json", import.meta.url), "utf8")) as {
  cases: { name: string; expected: never[]; played: never[]; latency_ms: number; pitch_tolerance: number; timing_ms: number; outcomes: string[]; extras: number; ordered?: boolean }[];
};

describe("musicMatch, on Narai's shared cases", () => {
  it("has the cases", () => expect(cases.length).toBeGreaterThan(0));
  it.each(cases.map((c) => [c.name, c] as const))("%s", (_, c) => {
    const found = musicMatch(c.expected, c.played, { latencyMs: c.latency_ms, pitchTolerance: c.pitch_tolerance, timingMs: c.timing_ms, ...(c.ordered ? { ordered: true } : {}) });
    expect(found).toEqual({ outcomes: c.outcomes, extras: c.extras, hits: c.outcomes.filter((o) => o === "hit").length });
  });
});
