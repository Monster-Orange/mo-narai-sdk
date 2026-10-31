import type { Answer, Command, CommandError, Connect, Hello, LocaleSwitch, Payload, Start, StateGet, StorageResult, Task, ToolMessage } from "./generated/envelope.js";
import type { ToolManifest } from "./generated/manifest.js";
import { checkMessage, CONTRACT_VERSION, type PayloadCheck } from "./messages.js";
import { CONNECT_TIMEOUT_MS, isDevHostOrigin, isDevHostname, NARAI_HOST_ORIGINS } from "./origins.js";
import { Channel, ToolMessageError, type PortLike, type Refusal } from "./port.js";

export interface ConnectOptions {
  /** The origins Narai's host may be on; a connect from anywhere else is ignored. Default: Narai's own
   *  (NARAI_HOST_ORIGINS). A tool in development (served from this machine, or by a local Narai) also takes a local
   *  Narai and a host on this machine. */
  hostOrigins?: readonly string[];
  /** A message the host sent that the contract refuses; it never reaches a handler. */
  onRefused?: (refusal: Refusal) => void;
  /** Checks payload bodies against the manifest's schemas, both ways (`payloadChecks(manifest)`, where eval is allowed). */
  payloads?: PayloadCheck;
  /** Gives up waiting for the host after this long (ms). Default CONNECT_TIMEOUT_MS; Infinity waits. */
  timeoutMs?: number;
  /** For tests: the window the tool runs in. */
  window?: ToolWindow;
}

/** What the tool needs of its window: the connect arrives there, from its parent. */
export interface ToolWindow {
  readonly parent: { postMessage(message: unknown, targetOrigin: string): void };
  readonly location?: { readonly hostname: string };
  addEventListener(type: "message", listener: (event: ConnectEvent) => void): void;
  removeEventListener(type: "message", listener: (event: ConnectEvent) => void): void;
}

export interface ConnectEvent { data: unknown; origin: string; source: unknown; ports: readonly PortLike[] }

export interface PracticeReport { duration_s: number; attempts: number; payload: Payload }

/** A tool's side of one launch: what Narai started it on, and the only ways it talks back. */
export interface ToolSession {
  readonly launch: string;
  readonly start: Readonly<Start>;
  /** The task Narai judges on this launch, if any. */
  readonly task: Readonly<Task> | undefined;
  /** Rendered: in the locale the tool actually shows (the host flags a fallback). */
  ready(locale: string): void;
  /** What the learner did on the task. Raw: never a verdict. */
  answer(payload: Payload): void;
  /** Practice outside a task: an activity the manifest declares. */
  practice(activity: string, report: PracticeReport): void;
  close(reason: "done" | "user" | "error"): void;
  /** A command the manifest declares; one it doesn't is never delivered (Narai is told: `unknown_command`). Narai is
   *  answered once the handler is done: an ack, or an error when it throws (`failed`; a CommandRefused says its own code). */
  onCommand(command: string, handler: (payload: Payload, message: Command) => void | Promise<void>): void;
  /** What the tool shows now, in the payload the manifest's `state` names: sent to Narai, and kept to answer its
   *  requests. Never anything about the learner. */
  state(payload: Payload): void;
  /** This launch's own storage, kept by Narai (scoped to this tool and this launch: the tool names only a key). */
  readonly storage: LaunchStorage;
  onLocale(handler: (message: LocaleSwitch) => void): void;
}

/** A storage call's answer: a get's value (a stored null is a value), or why not. */
export type StorageAnswer = { ok: true; value?: unknown } | { ok: false; error: "quota" | "not_found" | "denied" };

export interface LaunchStorage {
  /** The value under `key`, or `not_found`. */
  get(key: string): Promise<StorageAnswer>;
  /** Keep `value` (any JSON, at most STORAGE_VALUE_MAX bytes) under `key`; `quota` past the launch's limits. */
  set(key: string, value: unknown): Promise<StorageAnswer>;
  /** Forget `key` (a missing key is fine). */
  delete(key: string): Promise<StorageAnswer>;
}

/** Say hello to the parent, wait for Narai's host to connect (on the window, from the parent, from a listed origin,
 *  once), then for the start. */
export function connect(manifest: ToolManifest, options: ConnectOptions = {}): Promise<ToolSession> {
  const win = options.window ?? (globalThis as unknown as { window: ToolWindow }).window;
  const refused = options.onRefused ?? (() => undefined);
  const hosts = options.hostOrigins ?? NARAI_HOST_ORIGINS;
  const dev = isDevHostname(win.location?.hostname ?? "");
  const wait = options.timeoutMs ?? CONNECT_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    const timer = Number.isFinite(wait)
      ? setTimeout(() => { win.removeEventListener("message", onConnect); reject(new Error("Narai's host didn't connect")); }, wait)
      : undefined;
    function onConnect(event: ConnectEvent): void {
      if (event.source !== win.parent || !(hosts.includes(event.origin) || (dev && isDevHostOrigin(event.origin)))) return;
      const checked = checkMessage(manifest, event.data, { from: "host" });
      if (!checked.ok || (checked.message as Connect).type !== "narai.tool.connect") return;
      const port = event.ports[0];
      if (!port) { refused({ reason: "a connect with no port", data: event.data }); return; }
      win.removeEventListener("message", onConnect);
      if (timer) clearTimeout(timer);
      session(manifest, port, { onRefused: refused, payloads: options.payloads }).then(resolve, reject);
    }
    win.addEventListener("message", onConnect);
    // listening now: say so to the parent, which answers with the port. The hello carries nothing, so any origin may
    // read it; the connect that answers is only taken from a listed one.
    const hello: Hello = { type: "tool.hello", v: CONTRACT_VERSION };
    win.parent.postMessage(hello, "*");
  });
}

/** The session on a port the host handed over: the first message is the start; nothing else until it. */
export function session(
  manifest: ToolManifest, port: PortLike, options: { onRefused?: ((r: Refusal) => void) | undefined; payloads?: PayloadCheck | undefined } = {},
): Promise<ToolSession> {
  const refused = options.onRefused ?? (() => undefined);
  let start: Start | undefined;
  const commands = new Map<string, (payload: Payload, message: Command) => void | Promise<void>>();
  let shown: Payload | undefined;
  let calls = 0;
  const stored = new Map<string, { get: boolean; resolve: (answer: StorageAnswer) => void }>();
  // a command that arrives before the tool hands it a handler waits for one
  const held: Command[] = [];
  let onLocale: ((message: LocaleSwitch) => void) | undefined;
  const channel: Channel = new Channel(port, manifest, "tool", () => ({ launch: start?.launch, task: start?.task ?? undefined, payloads: options.payloads }), (r) => {
    refused(r);
    // a command Narai sent that the contract refuses is still answered: which one, and why it never ran
    const c = r.data as Partial<Command> | null;
    if (start && c?.type === "narai.tool.command" && typeof c.id === "string" && c.launch === start.launch) {
      answerCommand(c.id, { code: /isn't in the manifest/.test(r.reason) ? "unknown_command" : "invalid_payload", message: r.reason.slice(0, 500) });
    }
  });
  const answerCommand = (re: string, error?: { code: CommandError["code"]; message?: string }) => {
    if (!start || channel.closed) return;
    const base = { v: CONTRACT_VERSION, launch: start.launch, re } as const;
    channel.send(error ? { ...base, type: "tool.command.error", ...error } : { ...base, type: "tool.command.ack" });
  };
  // the handler runs at once (as it always has); its answer goes when it's done, or when it fails
  const run = (handler: (payload: Payload, message: Command) => void | Promise<void>, command: Command) => {
    const fail = (e: unknown) => answerCommand(command.id, e instanceof CommandRefused
      ? { code: e.code, message: e.message.slice(0, 500) }
      : { code: "failed", message: String((e as Error)?.message ?? e).slice(0, 500) });
    let done: void | Promise<void>;
    try { done = handler(command.payload, command); } catch (e) { fail(e); return; }
    Promise.resolve(done).then(() => answerCommand(command.id), fail);
  };
  return new Promise((resolve) => {
    channel.listen((message: ToolMessage) => {
      if (!start) {
        if (message.type !== "narai.tool.start") { refused({ reason: `${message.type} before the start`, data: message }); return; }
        start = message as Start;
        resolve(api(start));
        return;
      }
      if (message.type === "narai.tool.command") {
        const command = message as Command;
        const handler = commands.get(command.command);
        if (handler) run(handler, command);
        else held.push(command);
      } else if (message.type === "narai.tool.state.get") {
        if (shown) channel.send({ v: CONTRACT_VERSION, launch: start.launch, type: "tool.state", re: (message as StateGet).id, payload: shown });
      } else if (message.type === "narai.tool.storage.result") {
        const r = message as StorageResult;
        const call = stored.get(r.re);
        if (!call) return;
        stored.delete(r.re);
        call.resolve(r.ok ? (call.get ? { ok: true, value: r.value ?? null } : { ok: true }) : { ok: false, error: r.error ?? "denied" });
      } else if (message.type === "narai.tool.locale") onLocale?.(message as LocaleSwitch);
      else refused({ reason: `${message.type} after the start`, data: message });
    });
  });

  function api(s: Start): ToolSession {
    const base = { v: CONTRACT_VERSION, launch: s.launch } as const;
    // a storage call: checked and sent (a bad key or a value too large throws here, never sent), answered by `re`
    const call = (m: { type: "tool.storage.get" | "tool.storage.delete"; key: string } | { type: "tool.storage.set"; key: string; value: unknown }) =>
      new Promise<StorageAnswer>((resolve, reject) => {
        const id = `st_${(calls += 1)}`;
        try { channel.send({ ...base, ...m, id } as ToolMessage); } catch (e) { reject(e); return; }
        stored.set(id, { get: m.type === "tool.storage.get", resolve });
      });
    return {
      launch: s.launch,
      start: s,
      task: s.task ?? undefined,
      ready: (locale) => channel.send({ ...base, type: "tool.ready", tool: manifest.id, version: manifest.version, locale }),
      answer: (payload) => {
        if (!s.task) throw new Error("this launch has no task to answer");
        const message: Answer = { ...base, type: "tool.answer", task: s.task.id, payload };
        channel.send(message);
      },
      practice: (activity, report) => channel.send({ ...base, type: "tool.practice", activity, ...report }),
      close: (reason) => { channel.send({ ...base, type: "tool.close", reason }); channel.close(); },
      onCommand: (command, handler) => {
        if (!manifest.commands?.[command]) throw new Error(`command ${command} isn't in the manifest`);
        commands.set(command, handler);
        for (const waiting of held.filter((c) => c.command === command)) {
          held.splice(held.indexOf(waiting), 1);
          run(handler, waiting);
        }
      },
      state: (payload) => {
        if (payload.schema !== manifest.state) throw new ToolMessageError(`state is ${manifest.state ?? "not declared"}, not ${payload.schema}`);
        channel.send({ ...base, type: "tool.state", payload });
        shown = payload;
      },
      onLocale: (handler) => { onLocale = handler; },
      storage: {
        get: (key) => call({ type: "tool.storage.get", key }),
        set: (key, value) => call({ type: "tool.storage.set", key, value }),
        delete: (key) => call({ type: "tool.storage.delete", key }),
      },
    };
  }
}

/** Thrown by a command's handler: Narai is told this code (not `failed`) and the message, for the developer. */
export class CommandRefused extends Error {
  constructor(readonly code: "unsupported" | "invalid_payload" | "failed", message?: string) {
    super(message ?? code);
    this.name = "CommandRefused";
  }
}
