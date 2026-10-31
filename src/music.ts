import { MUSIC_PAYLOADS } from "./generated/music.js";

export { MUSIC_PAYLOADS };
import type { CyclePreset } from "./generated/music.js";

export type { CyclePreset as MusicCyclePreset, NeckPreset as MusicNeckPreset, NeckState as MusicNeckState, Note as MusicNote, Played as MusicPlayed, TabPractice as MusicTabPractice, Tap as MusicTap, Taps as MusicTaps } from "./generated/music.js";

/** Narai's music payloads, as a manifest's `payloads` declares them: unchanged (Narai's registry refuses a variant).
 *  `musicPayloads("music.played@1")` -> { "music.played@1": <its schema> }. */
export function musicPayloads(...refs: string[]): Record<string, Record<string, unknown>> {
  return Object.fromEntries(refs.map((ref) => {
    const schema = MUSIC_PAYLOADS[ref];
    if (!schema) throw new Error(`${ref} isn't one of Narai's music payloads (${Object.keys(MUSIC_PAYLOADS).join(", ")})`);
    return [ref, structuredClone(schema) as Record<string, unknown>];
  }));
}

/** A payload Narai defines, declared other than as Narai wrote it. Other music names stay the tool's own. */
export function musicVariants(payloads: Record<string, unknown> | undefined): string[] {
  return Object.entries(payloads ?? {})
    .filter(([ref, schema]) => ref in MUSIC_PAYLOADS && !same(schema, MUSIC_PAYLOADS[ref]))
    .map(([ref]) => `/payloads/${ref} is Narai's: declare it unchanged (musicPayloads("${ref}"))`);
}

function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null || Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/** What one of Narai's payloads breaks across its fields, which its JSON Schema can't hold (Narai checks these with its
 *  own model wherever it checks a payload); null when nothing. Call it on a body that already matches the schema. */
export function musicRules(ref: string, body: Readonly<Record<string, unknown>>): string | null {
  if (ref !== "music.cycle-preset@1") return null;
  const c = body as unknown as CyclePreset;
  if (c.groups.reduce((sum, g) => sum + g, 0) !== c.beats) return "the groups sum to the beats";
  if (c.hands && c.hands.length !== c.groups.length) return "one hand per group";
  if (c.syllables && c.syllables.length !== c.beats) return "one syllable per beat";
  return null;
}
