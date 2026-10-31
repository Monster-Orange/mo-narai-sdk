import { describe, expect, it } from "vitest";
import { manifestProblems, musicPayloads, MUSIC_PAYLOADS } from "../src/index.js";
import { payloadChecks } from "../src/payloads.js";
import { echo } from "./fixtures.js";

// The music payloads Narai owns: a tool declares them as Narai wrote them (schema/music.schema.json, copied from Narai),
// never a variant; its own music names stay its own.
describe("Narai's music payloads", () => {
  it("are the four Narai defines, each a JSON Schema of the payload's body", () => {
    expect(Object.keys(MUSIC_PAYLOADS).sort()).toEqual(["music.neck-preset@1", "music.neck-state@1", "music.played@1", "music.tab-practice@1"]);
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
});
