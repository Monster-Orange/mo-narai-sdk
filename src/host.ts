import type { Answer, Close, Connect, Payload, Practice, Ready, Start, Task, ToolMessage } from "./generated/envelope.js";
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
  onReady?: (message: Ready) => void;
  onAnswer?: (message: Answer) => void;
  onPractice?: (message: Practice) => void;
  onClose?: (message: Close) => void;
  /** A message the tool sent that the contract refuses; it never reaches a handler. */
  onRefused?: (refusal: Refusal) => void;
  /** Checks payload bodies against the manifest's schemas (`payloadChecks(manifest)`); Narai's host always passes it. */
  payloads?: PayloadCheck;
  /** For tests: makes the channel (default: the platform's MessageChannel). */
  channel?: () => { port1: PortLike; port2: Transferable };
}

export interface HostSession {
  /** A command the manifest declares (others throw: they're never sent). */
  command(command: string, payload: Payload): void;
  locale(locale: string, fallback?: string[]): void;
  close(): void;
}

/** The tool's origin: where its embed surface is. The port goes there and nowhere else. */
export function toolOrigin(manifest: ToolManifest): string {
  const url = manifest.surfaces.embed?.url;
  if (!url) throw new Error(`${manifest.id} has no embed surface`);
  return new URL(url).origin;
}

/** Narai's side of one launch: hand the tool a port, start it, and take back only what its manifest declares. */
export function mountTool(manifest: ToolManifest, options: MountOptions): HostSession {
  const { port1, port2 } = options.channel?.() ?? new MessageChannel();
  const refused = options.onRefused ?? (() => undefined);
  let ready = false;
  const channel = new Channel(port1, manifest, "host", () => ({ launch: options.launch, task: options.task, payloads: options.payloads }), refused);
  channel.listen((message: ToolMessage) => {
    if (!ready && message.type !== "tool.ready" && message.type !== "tool.close") {
      refused({ reason: `${message.type} before tool.ready`, data: message });
      return;
    }
    switch (message.type) {
      case "tool.ready": ready = true; options.onReady?.(message as Ready); break;
      case "tool.answer": options.onAnswer?.(message as Answer); break;
      case "tool.practice": options.onPractice?.(message as Practice); break;
      case "tool.close": options.onClose?.(message as Close); channel.close(); break;
      default: refused({ reason: `${message.type} isn't sent on the port`, data: message });
    }
  });
  // The port goes over when the tool says hello (its SDK is listening by then), from this frame, at its origin. What's
  // sent on port1 before that waits in the port.
  const origin = toolOrigin(manifest);
  const win = options.window ?? (globalThis as unknown as { window: HostWindow }).window;
  const onHello = (event: HelloEvent) => {
    if (event.source !== options.frame || event.origin !== origin) return;
    const checked = checkMessage(manifest, event.data, { from: "tool" });
    if (!checked.ok || checked.message.type !== "tool.hello") return;
    win.removeEventListener("message", onHello);
    const connect: Connect = { type: "narai.tool.connect", v: CONTRACT_VERSION };
    options.frame.postMessage(connect, origin, [port2]);
  };
  win.addEventListener("message", onHello);
  const base = { v: CONTRACT_VERSION, launch: options.launch } as const;
  const start: Start = { ...base, type: "narai.tool.start", locale: options.locale, fallback: options.fallback ?? [] };
  if (options.preset) start.preset = options.preset;
  if (options.conventions) start.conventions = options.conventions;
  if (options.task) start.task = options.task;
  channel.send(start);
  return {
    command: (command, payload) => channel.send({ ...base, type: "narai.tool.command", command, payload }),
    locale: (locale, fallback = []) => channel.send({ ...base, type: "narai.tool.locale", locale, fallback }),
    close: () => { win.removeEventListener("message", onHello); channel.close(); },
  };
}
