import type { Answer, Close, Command, CommandAck, CommandError, Connect, Key, Payload, Practice, Ready, Start, State, StorageDelete, StorageGet, StorageResult, StorageSet, Task, ToolMessage } from "./generated/envelope.js";
import type { ToolManifest } from "./generated/manifest.js";
import { checkMessage, CONTRACT_VERSION, type PayloadCheck } from "./messages.js";
import { Channel, type PortLike, type Refusal } from "./port.js";

/** Where the tool runs: an iframe's window, posted to at the tool's own origin only. */
export interface ToolFrame { postMessage(message: unknown, targetOrigin: string, transfer: Transferable[]): void }

/** Where the host listens for the tool's hello: its own window. */
export interface HostWindow {
  addEventListener(type: "message", listener: (event: HelloEvent) => void): void;
  removeEventListener(type: "message", listener: (event: HelloEvent) => void): void;
}

export interface HelloEvent { data: unknown; origin: string; source: unknown }

/** What a step can let a tool use for one launch (narai.tool.start's `granted`). */
export type Grant = NonNullable<Start["granted"]>[number];

export interface MountOptions {
  /** The iframe's window: the port is posted to it at the tool's origin, and its hello is the only one taken. */
  frame: ToolFrame;
  /** For tests: the host's window (default: the page's). */
  window?: HostWindow;
  launch: string;
  locale: string;
  fallback?: string[];
  preset?: Payload;
  conventions?: Payload;
  task?: Task;
  /** What the step lets the tool use for this launch. Only what the manifest declares (`capabilities`) goes to the tool;
   *  the rest is dropped, and the launch still starts, as Narai does. */
  granted?: readonly Grant[];
  onReady?: (message: Ready) => void;
  onAnswer?: (message: Answer) => void;
  onPractice?: (message: Practice) => void;
  onClose?: (message: Close) => void;
  /** An Escape the learner pressed in the tool that the tool left alone (tool.key): close the dialog the tool is shown
   *  in. It comes even before tool.ready. */
  onKey?: (message: Key) => void;
  /** The tool rendered a locale other than the learner's (`locale`): the host shows its fallback notice. */
  onFallback?: (fallback: { requested: string; rendered: string }) => void;
  /** Every storage call the tool made, with the answer it got. */
  onStorage?: (call: StorageGet | StorageSet | StorageDelete, result: StorageResult) => void;
  /** Every command as it goes to the tool, with its id. */
  onCommandSent?: (message: Command) => void;
  /** Every answer the tool gives a command (tool.command.ack or tool.command.error), whoever sent the command. */
  onCommandAnswer?: (message: CommandAck | CommandError) => void;
  /** The tool's state (tool.state): on every change, and in answer to requestState(). */
  onState?: (message: State) => void;
  /** How long a command or a state request waits for the tool's answer (ms; default COMMAND_TIMEOUT_MS). */
  commandTimeoutMs?: number;
  /** Where the tool's storage calls go, under this launch (the host's store; none: every call is `denied`). */
  storage?: HostStorage;
  /** A message the tool sent that the contract refuses; it never reaches a handler. */
  onRefused?: (refusal: Refusal) => void;
  /** Checks payload bodies against the manifest's schemas (`payloadChecks(manifest)`); Narai's host always passes it. */
  payloads?: PayloadCheck;
  /** How much practice a launch may report: a burst, then so many a minute (practice is reported in batches, about one a minute).
   *  The excess is refused through onRefused, so it's counted. Default 10, then 6 a minute. */
  practiceLimit?: { burst: number; perMinute: number };
  /** For tests: the clock (ms). */
  now?: () => number;
  /** For tests: makes the channel (default: the platform's MessageChannel). */
  channel?: () => { port1: PortLike; port2: Transferable };
}

/** The tool's answer to a command: done, or not, with the tool's code (`failed` when no answer came in time). */
export type CommandResult = { ok: true } | { ok: false; code: CommandError["code"]; message?: string };

/** A store for launches' storage, as the host keeps it: always under the host's own launch, never one a tool names.
 *  Narai's host backs it with its server; the harness with memory (`memoryStorage`). A get of a missing key is
 *  `not_found`; a delete of one is ok; `quota` past the store's limits. */
export interface HostStorage {
  get(launch: string, key: string): Promise<{ ok: true; value: unknown } | { ok: false; error: StorageError }>;
  set(launch: string, key: string, value: unknown): Promise<{ ok: true } | { ok: false; error: StorageError }>;
  delete(launch: string, key: string): Promise<{ ok: true } | { ok: false; error: StorageError }>;
}
export type StorageError = "quota" | "not_found" | "denied";

/** How long the host waits for a command's or a state request's answer. */
export const COMMAND_TIMEOUT_MS = 10_000;

export interface HostSession {
  /** A command the manifest declares (others throw: they're never sent), answered once by the tool. */
  command(command: string, payload: Payload): Promise<CommandResult>;
  /** Ask the tool for its state now (narai.tool.state.get): its latest tool.state. Rejects when none comes in time. */
  requestState(): Promise<Payload>;
  locale(locale: string, fallback?: string[]): void;
  close(): void;
}

/** A token bucket: `burst` at once, refilled at `perMinute`. */
function bucket(burst: number, perMinute: number, now: () => number) {
  let tokens = burst;
  let at = now();
  return {
    take(): boolean {
      const t = now();
      tokens = Math.min(burst, tokens + ((t - at) / 60_000) * perMinute);
      at = t;
      if (tokens < 1) return false;
      tokens -= 1;
      return true;
    },
  };
}

/** The tool's origin: where its embed surface is. The port goes there and nowhere else. An embed Narai hosts (a
 *  relative url) has none until Narai resolves it to the tool's own origin: mount a manifest with that URL. */
export function toolOrigin(manifest: ToolManifest): string {
  const url = manifest.surfaces.embed?.url;
  if (!url) throw new Error(`${manifest.id} has no embed surface`);
  if (!url.startsWith("https://") && !url.startsWith("http://")) {
    throw new Error(`${manifest.id}'s embed url ${url} is relative: mount it with the URL Narai resolved it to`);
  }
  return new URL(url).origin;
}

/** Narai's side of one launch: hand the tool a port, start it, and take back only what its manifest declares. */
export function mountTool(manifest: ToolManifest, options: MountOptions): HostSession {
  const refused = options.onRefused ?? (() => undefined);
  let ready = false;
  const limit = options.practiceLimit ?? { burst: 10, perMinute: 6 };
  const practice = bucket(limit.burst, limit.perMinute, options.now ?? Date.now);
  // one connection per hello from the tool's frame: a tool that reloads says hello again, and gets a new port to the same
  // launch (its storage, practice limit and pending requests carry on); it says ready again on it (sdk#19)
  let channel!: Channel; // set by open(), which runs before anything is sent
  let port2!: Transferable;
  const open = () => {
    const ports = options.channel?.() ?? new MessageChannel();
    port2 = ports.port2;
    channel = new Channel(ports.port1, manifest, "host", () => ({ launch: options.launch, task: options.task, payloads: options.payloads }), refused);
    ready = false;
    channel.listen(receive);
  };
  const wait = options.commandTimeoutMs ?? COMMAND_TIMEOUT_MS;
  let ids = 0;
  const nextId = (prefix: string) => `${prefix}_${(ids += 1)}`;
  // what the host is waiting for, by the id it sent: a command's answer, a state request's
  const commands = new Map<string, (result: CommandResult) => void>();
  const states = new Map<string, (payload: Payload | null) => void>();
  const pending = <T>(map: Map<string, (v: T) => void>, id: string, onTimeout: T) => new Promise<T>((resolve) => {
    const timer = setTimeout(() => { map.delete(id); resolve(onTimeout); }, wait);
    map.set(id, (v) => { clearTimeout(timer); map.delete(id); resolve(v); });
  });
  const receive = (message: ToolMessage) => {
    if (!ready && message.type !== "tool.ready" && message.type !== "tool.close" && message.type !== "tool.key") {
      refused({ reason: `${message.type} before tool.ready`, data: message });
      return;
    }
    switch (message.type) {
      case "tool.ready": {
        ready = true;
        const r = message as Ready;
        options.onReady?.(r);
        if (r.locale !== options.locale) options.onFallback?.({ requested: options.locale, rendered: r.locale });
        break;
      }
      case "tool.answer": options.onAnswer?.(message as Answer); break;
      case "tool.practice":
        if (practice.take()) options.onPractice?.(message as Practice);
        else refused({ reason: `practice over the limit (${limit.burst}, then ${limit.perMinute} a minute)`, data: message });
        break;
      case "tool.close": options.onClose?.(message as Close); channel.close(); break;
      case "tool.key": options.onKey?.(message as Key); break;
      case "tool.command.ack": options.onCommandAnswer?.(message as CommandAck); commands.get((message as CommandAck).re)?.({ ok: true }); break;
      case "tool.command.error": {
        const e = message as CommandError;
        options.onCommandAnswer?.(e);
        commands.get(e.re)?.({ ok: false, code: e.code, ...(e.message ? { message: e.message } : {}) });
        break;
      }
      case "tool.storage.get":
      case "tool.storage.set":
      case "tool.storage.delete": {
        const call = message as StorageGet | StorageSet | StorageDelete;
        const store = options.storage;
        const done = !store ? Promise.resolve({ ok: false as const, error: "denied" as const })
          : call.type === "tool.storage.get" ? store.get(options.launch, call.key)
          : call.type === "tool.storage.set" ? store.set(options.launch, call.key, call.value)
          : store.delete(options.launch, call.key);
        const on = channel;
        done.catch(() => ({ ok: false as const, error: "denied" as const })).then((r) => {
          if (on.closed) return;
          // `value` is any JSON (the schema's `{}`); the generated type reads it as an object, hence the cast
          const result = r.ok
            ? { ...base, type: "narai.tool.storage.result", re: call.id, ok: true, ...("value" in r ? { value: r.value } : {}) }
            : { ...base, type: "narai.tool.storage.result", re: call.id, ok: false, error: r.error };
          on.send(result as StorageResult);
          options.onStorage?.(call, result as StorageResult);
        });
        break;
      }
      case "tool.state": {
        const s = message as State;
        options.onState?.(s);
        if (s.re) states.get(s.re)?.(s.payload);
        break;
      }
      default: refused({ reason: `${message.type} isn't sent on the port`, data: message });
    }
  };
  // The port goes over when the tool says hello (its SDK is listening by then), from this frame, at its origin. What's
  // sent on port1 before that waits in the port.
  const origin = toolOrigin(manifest);
  const win = options.window ?? (globalThis as unknown as { window: HostWindow }).window;
  const base = { v: CONTRACT_VERSION, launch: options.launch } as const;
  const start: Start = { ...base, type: "narai.tool.start", locale: options.locale, fallback: options.fallback ?? [] };
  if (options.preset) start.preset = options.preset;
  if (options.conventions) start.conventions = options.conventions;
  if (options.task) start.task = options.task;
  const granted = (options.granted ?? []).filter((g) => manifest.capabilities?.[g] === true);
  if (granted.length) start.granted = [...new Set(granted)] as NonNullable<Start["granted"]>;
  let handed = false;
  const onHello = (event: HelloEvent) => {
    if (event.source !== options.frame || event.origin !== origin) return;
    const checked = checkMessage(manifest, event.data, { from: "tool" });
    if (!checked.ok || checked.message.type !== "tool.hello") return;
    // a second hello from this frame at its origin is a reload (Ward, 2026-10-31): the old port is closed, so only one
    // is ever live, and the tool gets a new one to the same launch (its storage kept, the start replayed)
    if (handed) { channel.close(); open(); channel.send(start); }
    handed = true;
    const connect: Connect = { type: "narai.tool.connect", v: CONTRACT_VERSION };
    options.frame.postMessage(connect, origin, [port2]);
  };
  win.addEventListener("message", onHello);
  open();
  channel.send(start);
  return {
    command: (command, payload) => {
      const id = nextId("cmd");
      const message: Command = { ...base, type: "narai.tool.command", id, command, payload };
      channel.send(message);
      options.onCommandSent?.(message);
      return pending<CommandResult>(commands, id, { ok: false, code: "failed", message: "no answer in time" });
    },
    requestState: async () => {
      const id = nextId("req");
      channel.send({ ...base, type: "narai.tool.state.get", id });
      const payload = await pending<Payload | null>(states, id, null);
      if (!payload) throw new Error("the tool sent no state in time");
      return payload;
    },
    locale: (locale, fallback = []) => channel.send({ ...base, type: "narai.tool.locale", locale, fallback }),
    close: () => { win.removeEventListener("message", onHello); channel.close(); },
  };
}
