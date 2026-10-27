import { VERDICT_FIELDS } from "./generated/verdicts.js";

/** Words a tool's payload may not use as keys: a tool sends what the learner did, never a verdict; Narai judges.
 *  The registry's list (schema/verdicts.json), compared lower-cased. */
export const VERDICT_KEYS: ReadonlySet<string> = new Set(VERDICT_FIELDS);
