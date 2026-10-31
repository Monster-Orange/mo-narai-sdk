/** A note a passage expects: a MIDI pitch (none: a rhythm's onset, matched on time alone), ms from the task's start
 *  (none: untimed, a one-note target, played at any time). */
export interface ExpectedNote { readonly pitch?: number | null; readonly at_ms?: number | null }
/** A note a tool heard (music.played@1's notes, music.taps@1's taps): a tap has no pitch. */
export interface PlayedNote { readonly pitch?: number | null; readonly at_ms: number }
export type MatchOutcome = "hit" | "wrong_pitch" | "early" | "late" | "missed";
export interface MatchOptions { readonly latencyMs: number; readonly pitchTolerance: number; readonly timingMs: number }
export interface MusicMatch { readonly outcomes: MatchOutcome[]; readonly extras: number; readonly hits: number }

/** Narai's play_passage and play_rhythm matcher, as a tool's preview: what Narai will grade, from the same shared cases
 *  (schema/music_match.cases.json). A played note sounds at `at_ms - latencyMs`. Expected notes, in time order, claim
 *  played notes in three passes: the earliest unused note within `timingMs` either side and `pitchTolerance` semitones
 *  is a hit; then the nearest unused note of its pitch outside the window makes it early or late; then the earliest
 *  unused note of another pitch in its window is a wrong_pitch; else it is missed. `extras` counts the played notes no
 *  expected note took. A note without a pitch matches on time alone; an expected note without `at_ms` is untimed: every
 *  played note is in its window, so it is a hit, a wrong_pitch or missed, never early or late. Narai decides: a tool shows this, never sends it. */
export function musicMatch(expected: readonly ExpectedNote[], played: readonly PlayedNote[], options: MatchOptions): MusicMatch {
  const { latencyMs, pitchTolerance, timingMs } = options;
  const wanted = expected.map((note, index) => ({ note, index })).sort((a, b) => (a.note.at_ms ?? 0) - (b.note.at_ms ?? 0) || a.index - b.index);
  const sounded = played.map((n) => ({ at: n.at_ms - latencyMs, pitch: n.pitch ?? null })).sort((a, b) => a.at - b.at || (a.pitch ?? 0) - (b.pitch ?? 0));
  type Sounded = (typeof sounded)[number];
  const used = sounded.map(() => false);
  const outcomes = new Map<number, MatchOutcome>();

  const inWindow = (heard: Sounded, note: ExpectedNote) => note.at_ms == null || Math.abs(heard.at - note.at_ms) <= timingMs;
  const itsPitch = (heard: Sounded, note: ExpectedNote) =>
    note.pitch == null || heard.pitch === null || Math.abs(heard.pitch - note.pitch) <= pitchTolerance;
  const claim = (name: (heard: Sounded, at: number) => MatchOutcome, fits: (heard: Sounded, note: ExpectedNote) => boolean, nearest = false) => {
    for (const { note, index } of wanted) {
      if (outcomes.has(index)) continue;
      const at = note.at_ms ?? 0;
      const free = sounded.flatMap((heard, i) => (!used[i] && fits(heard, note) ? [{ heard, i }] : []));
      const [first, ...rest] = free;
      if (!first) continue;
      const taken = nearest ? rest.reduce((best, f) => (Math.abs(f.heard.at - at) < Math.abs(best.heard.at - at) ? f : best), first) : first;
      used[taken.i] = true;
      outcomes.set(index, name(taken.heard, at));
    }
  };

  claim(() => "hit", (heard, n) => inWindow(heard, n) && itsPitch(heard, n));
  claim((heard, at) => (heard.at < at ? "early" : "late"), (heard, n) => n.at_ms != null && itsPitch(heard, n), true);
  claim(() => "wrong_pitch", inWindow);
  const list = expected.map((_, i) => outcomes.get(i) ?? "missed");
  return { outcomes: list, extras: used.filter((u) => !u).length, hits: list.filter((o) => o === "hit").length };
}
