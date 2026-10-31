import type { ToolManifest } from "./generated/manifest.js";
import { validateManifest, type ValidationError } from "./generated/validators.js";
import { VERDICT_KEYS } from "./verdicts.js";
import { musicVariants } from "./music.js";

export type { ToolManifest } from "./generated/manifest.js";

/** A hosted tool's origin is `<name>--<publisher>.tools.<env>`: that label is a DNS label. */
const LABEL_MAX = 63;

/** A manifest that doesn't match the contract, with every reason. */
export class ManifestError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`the tool manifest doesn't match the contract:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    this.name = "ManifestError";
  }
}

/** Ajv's errors as one line each: where, and what. */
export function describe(errors: readonly ValidationError[] | null | undefined): string[] {
  return (errors ?? []).map((e) => `${e.instancePath || "(root)"} ${e.message ?? e.keyword}${e.keyword === "additionalProperties" ? ` (${String(e.params["additionalProperty"])})` : ""}`);
}

/** What the registry checks beyond the schema (schema/README.md), checked here too so a tool finds out before it uploads:
 *  every payload a manifest names is declared, no answer payload carries a verdict, commands and answers need an
 *  embed that runs the SDK, the tool's host label fits, and an embed Narai hosts (a relative url) is one of the files. */
function contractProblems(m: ToolManifest): string[] {
  const problems: string[] = [];
  const declared = new Set(Object.keys(m.payloads ?? {}));
  const named: [string, string][] = [
    ...(m.preset_schema ? [["/preset_schema", m.preset_schema] as [string, string]] : []),
    ...(m.state ? [["/state", m.state] as [string, string]] : []),
    ...Object.entries(m.answers ?? {}).map(([k, ref]): [string, string] => [`/answers/${k}`, ref]),
    ...Object.entries(m.task_payloads ?? {}).map(([k, ref]): [string, string] => [`/task_payloads/${k}`, ref]),
    ...Object.entries(m.practice ?? {}).map(([k, ref]): [string, string] => [`/practice/${k}`, ref]),
    ...Object.entries(m.commands ?? {}).map(([k, ref]): [string, string] => [`/commands/${k}`, ref]),
    ...(m.conventions ?? []).map((ref, i): [string, string] => [`/conventions/${i}`, ref]),
  ];
  for (const [where, ref] of named) {
    if (!declared.has(ref)) problems.push(`${where} names ${ref}, which isn't declared under /payloads`);
  }
  for (const kind of Object.keys(m.task_payloads ?? {})) {
    if (!(m.answers && kind in m.answers)) problems.push(`/task_payloads/${kind} names a task kind the manifest doesn't answer`);
  }
  for (const ref of new Set(Object.values(m.task_payloads ?? {}))) {
    const verdict = verdictProperty(m.payloads?.[ref], `/payloads/${ref}`);
    if (verdict) problems.push(`${verdict}: a task's payload carries no verdict (Narai judges)`);
  }
  problems.push(...musicVariants(m.payloads));
  for (const ref of new Set(Object.values(m.answers ?? {}))) {
    const verdict = verdictProperty(m.payloads?.[ref], `/payloads/${ref}`);
    if (verdict) problems.push(`${verdict}: an answer carries what the learner did, never a verdict (Narai judges)`);
  }
  const speaks = m.surfaces.embed && m.surfaces.embed.sdk !== "none";
  const declares = (o: object | undefined) => o !== undefined && Object.keys(o).length > 0;
  if (!speaks && (declares(m.answers) || declares(m.commands))) {
    problems.push("/surfaces/embed: commands and answers need an embed that runs the SDK (sdk: ^1)");
  }
  const [publisher, name] = m.id.split("/") as [string, string];
  if (name.length + 2 + publisher.length > LABEL_MAX) problems.push(`/id its host label ${name}--${publisher} is longer than ${LABEL_MAX} characters`);
  const paths = (m.files ?? []).map((f) => f.path);
  const url = m.surfaces.embed?.url;
  if (url !== undefined && !url.startsWith("https://") && !paths.includes(url)) {
    problems.push(`/surfaces/embed/url ${url} is relative, so it names one of the files, and none is`);
  }
  if (paths.some((p, i) => i > 0 && p <= (paths[i - 1] as string))) problems.push("/files aren't sorted by path (each once)");
  return problems;
}

/** A verdict word as a property name anywhere in a JSON Schema (`properties`, `required`, nested). */
function verdictProperty(schema: unknown, path: string): string | null {
  if (Array.isArray(schema)) {
    for (const [i, s] of schema.entries()) { const found = verdictProperty(s, `${path}/${i}`); if (found) return found; }
  } else if (schema && typeof schema === "object") {
    for (const [k, v] of Object.entries(schema)) {
      if ((k === "properties" || k === "patternProperties") && v && typeof v === "object") {
        const hit = Object.keys(v).find((name) => VERDICT_KEYS.has(name.toLowerCase()));
        if (hit) return `${path}/${k}/${hit}`;
      }
      const found = verdictProperty(v, `${path}/${k}`);
      if (found) return found;
    }
  }
  return null;
}

/** Every reason the value isn't a manifest; none when it is. */
export function manifestProblems(value: unknown): string[] {
  if (!validateManifest(value)) return describe(validateManifest.errors);
  return contractProblems(value as ToolManifest);
}

/** What isn't wrong but almost surely is: a payload schema that names `schema` (a payload's schema describes its body;
 *  `schema` is the SDK's, taken off before the body is checked, so a schema that requires it fails every payload). */
export function manifestWarnings(value: unknown): string[] {
  const payloads = (value as { payloads?: Record<string, unknown> } | null)?.payloads ?? {};
  const warnings: string[] = [];
  for (const [ref, schema] of Object.entries(payloads)) {
    const s = schema as { properties?: Record<string, unknown>; required?: unknown[] } | null;
    if (s?.properties && "schema" in s.properties || s?.required?.includes("schema")) {
      warnings.push(`/payloads/${ref} names \`schema\`: describe the body only (the SDK adds and removes \`schema\`)`);
    }
  }
  return warnings;
}

/** The tool's manifest, checked against the contract and frozen: the only source of its permissions. */
export function defineTool<const M extends ToolManifest>(manifest: M): Readonly<M>;
/** A manifest read as JSON (`import m from "./narai.tool.json"`, or parsed): checked at runtime, so its widened
 *  strings are fine. */
export function defineTool(manifest: unknown): Readonly<ToolManifest>;
export function defineTool(manifest: unknown): Readonly<ToolManifest> {
  const problems = manifestProblems(manifest);
  if (problems.length) throw new ManifestError(problems);
  return deepFreeze(structuredClone(manifest as ToolManifest));
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}
