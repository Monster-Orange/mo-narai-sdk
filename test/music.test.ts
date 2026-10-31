import { describe, expect, it } from "vitest";
import { manifestProblems, musicPayloads, MUSIC_PAYLOADS } from "../src/index.js";
import { payloadChecks } from "../src/payloads.js";
import { echo } from "./fixtures.js";

// The music payloads Narai owns: a tool declares them as Narai wrote them (schema/music.schema.json, copied from Narai),
// never a variant; its own music names stay its own.
describe("Narai's music payloads", () => {
  it("are the six Narai defines, each a JSON Schema of the payload's body", () => {
    expect(Object.keys(MUSIC_PAYLOADS).sort()).toEqual(["music.cycle-preset@1", "music.neck-preset@1", "music.neck-state@1", "music.played@1", "music.tab-practice@1", "music.taps@1"]);
    for (const schema of Object.values(MUSIC_PAYLOADS)) expect(Object.keys((schema as { properties: object }).properties)).not.toContain("schema");
  });

  it("are declared unchanged with musicPayloads(), and check a played passage, silence included", () => {
    const m = echo();
    m.payloads = { ...m.payloads, ...musicPayloads("music.played@1") };
    m.answers = { ...m.answers, play_passage: "music.played@1" };
    expect(manifestProblems(m)).toEqual([]);
    const check = payloadChecks(m);
    expect(check("music.played@1", { notes: [{ pitch: 45, at_ms: 0, string: 5, fret: 0 }], latency_ms: 38 })).toBeNull();
    expect(check("music.played@1", { notes: [] })).toBeNull();
    expect(check("music.played@1", { notes: [{ pitch: 128, at_ms: 0 }] })).not.toBeNull();
  });

  it("refuse a tool's variant of one Narai defines, and leave its own music names alone", () => {
    const m = echo();
    m.payloads = { ...m.payloads, "music.played@1": { type: "object", properties: { notes: { type: "array" } } }, "music.fret@1": { type: "object" } };
    expect(manifestProblems(m)).toEqual(["/payloads/music.played@1 is Narai's: declare it unchanged (musicPayloads(\"music.played@1\"))"]);
  });

  it("check taps, nothing tapped included", () => {
    const m = echo();
    m.payloads = { ...m.payloads, ...musicPayloads("music.taps@1") };
    const check = payloadChecks(m);
    expect(check("music.taps@1", { taps: [{ at_ms: 0 }, { at_ms: 480, velocity: 0.8 }], source: "touch", latency_ms: 20 })).toBeNull();
    expect(check("music.taps@1", { taps: [], source: "mic" })).toBeNull();
    expect(check("music.taps@1", { taps: [{ at_ms: -1 }], source: "touch" })).not.toBeNull();
    expect(check("music.taps@1", { taps: [], source: "audio" })).not.toBeNull();
  });

  // Rules across fields that a JSON Schema doesn't hold: Narai checks them with its own model, so the SDK does too.
  const RUPAK = { system: "tala", name: "rupak", beats: 7, groups: [3, 2, 2], hands: ["wave", "clap", "clap"], tempo_bpm: 80 };
  it.each([
    ["the groups sum to the beats", { ...RUPAK, beats: 8 }],
    ["one hand per group", { ...RUPAK, hands: ["wave", "clap"] }],
    ["one syllable per beat", { ...RUPAK, syllables: ["tin", "tin", "na"] }],
  ])("check a cycle preset across its fields (%s)", (rule, body) => {
    const m = echo();
    m.payloads = { ...m.payloads, ...musicPayloads("music.cycle-preset@1") };
    const check = payloadChecks(m);
    expect(check("music.cycle-preset@1", RUPAK)).toBeNull();
    expect(check("music.cycle-preset@1", { ...RUPAK, syllables: ["tin", "tin", "na", "dhi", "na", "dhi", "na"] })).toBeNull();
    expect(check("music.cycle-preset@1", body)).toBe(rule);
  });
});
