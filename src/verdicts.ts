/** Words a tool's payload may not use as keys: a tool sends what the learner did, never a verdict; Narai judges. The
 *  registry's own list (mo-narai narai/tools/manifest.py VERDICT_FIELDS), until the schema publishes it. */
export const VERDICT_KEYS: ReadonlySet<string> = new Set([
  "correct", "is_correct", "incorrect", "passed", "is_passed", "failed", "pass_fail", "score", "verdict", "grade",
]);
