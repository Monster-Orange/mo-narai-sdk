import { MUSIC_PAYLOADS } from "./generated/music.js";

export { MUSIC_PAYLOADS };
export type { NeckPreset as MusicNeckPreset, NeckState as MusicNeckState, Note as MusicNote, Played as MusicPlayed, TabPractice as MusicTabPractice } from "./generated/music.js";

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
