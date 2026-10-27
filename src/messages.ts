import type { Answer, Command, Practice, Start, Task, ToolMessage } from "./generated/envelope.js";
import type { ToolManifest } from "./generated/manifest.js";
import { validateMessage } from "./generated/validators.js";
import { describe } from "./manifest.js";
import { VERDICT_KEYS } from "./verdicts.js";

export { VERDICT_KEYS } from "./verdicts.js";

export type { Answer, Close, Command, Connect, Hello, LocaleSwitch, Payload, Practice, Ready, Start, Task, ToolMessage } from "./generated/envelope.js";

/** The contract version this SDK speaks (`v` on every message). */
export const CONTRACT_VERSION = 1;

/** The most a payload may weigh, serialized (the study's "large answers": an upload reference beyond it, later). */
export const PAYLOAD_MAX_BYTES = 64 * 1024;

export type Checked = { ok: true; message: ToolMessage } | { ok: false; reason: string };

export interface CheckContext {
  /** Who sent it: Narai's host (`narai.tool.*`) or the tool (`tool.*`). */
  from: "host" | "tool";
  /** The launch this session is; a message for another is refused. Unknown before `narai.tool.start`. */
  launch?: string | undefined;
  /** The task the host started the tool on, if any: an answer is for it, in its kind's payload. */
  task?: Pick<Task, "id" | "kind"> | undefined;
  /** Checks a payload's body against the JSON Schema the manifest declares for it (`payloads[ref]`); the reason it
   *  fails, or null. Narai's host always checks; a tool may (`@narai/sdk/payloads` compiles them, where eval is allowed). */
  payloads?: PayloadCheck | undefined;
}

export type PayloadCheck = (ref: string, body: Readonly<Record<string, unknown>>) => string | null;

const refuse = (reason: string): Checked => ({ ok: false, reason });

function verdictKey(value: unknown, path: string): string | null {
  if (Array.isArray(value)) {
    for (const [i, v] of value.entries()) { const found = verdictKey(v, `${path}/${i}`); if (found) return found; }
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (VERDICT_KEYS.has(k.toLowerCase())) return `${path}/${k}`;
      const found = verdictKey(v, `${path}/${k}`);
      if (found) return found;
    }
  }
  return null;
}

function bytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

/** Whether a message may cross, by the envelope and by what this tool's manifest declares. Both sides run it: the
 *  host on what the tool sends and the tool on what the host sends, and each on its own messages before they go. */
export function checkMessage(manifest: ToolManifest, value: unknown, ctx: CheckContext): Checked {
  if (!validateMessage(value)) return refuse(`not a contract message: ${describe(validateMessage.errors).join("; ")}`);
  const message = value as ToolMessage;
  const prefix = ctx.from === "host" ? "narai.tool." : "tool.";
  if (!message.type.startsWith(prefix)) return refuse(`${message.type} doesn't come from the ${ctx.from}`);
  if ("launch" in message && ctx.launch !== undefined && message.launch !== ctx.launch) {
    return refuse(`for launch ${message.launch}, not this one`);
  }
  if ("payload" in message && message.payload !== undefined && bytes(message.payload) > PAYLOAD_MAX_BYTES) {
    return refuse(`the payload is over ${PAYLOAD_MAX_BYTES} bytes`);
  }
  const reason = byManifest(manifest, message, ctx.task) ?? bodies(message, ctx.payloads);
  return reason ? refuse(reason) : { ok: true, message };
}

/** The payloads a message carries, each checked against its declared schema. */
function bodies(message: ToolMessage, check: PayloadCheck | undefined): string | null {
  if (!check) return null;
  const carried = [
    "payload" in message ? message.payload : undefined,
    message.type === "narai.tool.start" ? message.preset : undefined,
    message.type === "narai.tool.start" ? message.conventions : undefined,
  ];
  for (const payload of carried) {
    if (!payload) continue;
    const { schema, ...body } = payload;
    const reason = check(schema, body);
    if (reason) return `${schema}: ${reason}`;
  }
  return null;
}

function byManifest(m: ToolManifest, message: ToolMessage, task: CheckContext["task"]): string | null {
  switch (message.type) {
    case "narai.tool.start": return checkStart(m, message as Start);
    case "narai.tool.command": return checkCommand(m, message as Command);
    case "tool.answer": return checkAnswer(m, message as Answer, task);
    case "tool.practice": return checkPractice(m, message as Practice);
    default: return null;
  }
}

function checkStart(m: ToolManifest, message: Start): string | null {
  if (message.preset && message.preset.schema !== m.preset_schema) {
    return `preset ${message.preset.schema} isn't the manifest's preset_schema (${m.preset_schema ?? "none"})`;
  }
  if (message.conventions && !(m.conventions ?? []).includes(message.conventions.schema)) {
    return `conventions ${message.conventions.schema} aren't among the manifest's`;
  }
  if (message.task && !(m.answers && message.task.kind in m.answers)) {
    return `task kind ${message.task.kind} isn't among the manifest's answers`;
  }
  return null;
}

function checkCommand(m: ToolManifest, message: Command): string | null {
  const declared = m.commands?.[message.command];
  if (!declared) return `command ${message.command} isn't in the manifest`;
  if (message.payload.schema !== declared) return `command ${message.command} takes ${declared}, not ${message.payload.schema}`;
  return null;
}

function checkAnswer(m: ToolManifest, message: Answer, task: CheckContext["task"]): string | null {
  const verdict = verdictKey(message.payload, "/payload");
  if (verdict) return `${verdict}: a tool sends what the learner did, never a verdict`;
  const kinds = Object.entries(m.answers ?? {});
  if (task) {
    if (message.task !== task.id) return `an answer for task ${message.task}, but the task is ${task.id}`;
    const expected = m.answers?.[task.kind];
    if (message.payload.schema !== expected) return `task ${task.kind} takes ${expected ?? "no answer"}, not ${message.payload.schema}`;
  } else if (!kinds.some(([, schema]) => schema === message.payload.schema)) {
    return `answer payload ${message.payload.schema} isn't among the manifest's answers`;
  }
  return null;
}

function checkPractice(m: ToolManifest, message: Practice): string | null {
  const verdict = verdictKey(message.payload, "/payload");
  if (verdict) return `${verdict}: a tool sends what the learner did, never a verdict`;
  const declared = m.practice?.[message.activity];
  if (!declared) return `practice activity ${message.activity} isn't in the manifest`;
  if (message.payload.schema !== declared) return `activity ${message.activity} reports ${declared}, not ${message.payload.schema}`;
  return null;
}
