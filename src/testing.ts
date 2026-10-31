// A tool's conformance kit (Node): its session against Narai's own host over a real MessageChannel, wired as a
// browser wires an iframe, so a tool's tests launch it as a lesson does, and forge what a hostile page would.

import type { Answer, Close, CommandAck, CommandError, Payload, Practice, Ready, State, Task } from "./generated/envelope.js";
import type { ToolManifest } from "./generated/manifest.js";
import { mountTool, toolOrigin, type HelloEvent, type HostSession, type HostWindow, type MountOptions, type ToolFrame } from "./host.js";
import { payloadChecks } from "./payloads.js";
import type { PortLike, Refusal } from "./port.js";
import { connect, type ConnectEvent, type ToolSession, type ToolWindow } from "./tool.js";
export { CommandRefused } from "./tool.js";

/** Narai's address, as the host the kit plays. */
export const HOST_ORIGIN = "https://michinar.ai";

type Listener<E> = (event: E) => void;

export interface Forged { origin?: string; source?: unknown }

/** The host's window, the iframe and the tool's window: the tool's hello reaches the host's window from the frame at
 *  the tool's origin; the frame's postMessage reaches the tool's window from its parent at the host's origin, with the
 *  transferred ports. `as` forges where the host's messages seem to come from, `helloOrigin` the tool's. */
export function browserPair(manifest: ToolManifest, as: Forged & { helloOrigin?: string } = {}) {
  const hostListeners = new Set<Listener<HelloEvent>>();
  const toolListeners = new Set<Listener<ConnectEvent>>();
  const posted: string[] = [];
  const later = <E>(listeners: Set<Listener<E>>, event: E) => queueMicrotask(() => { for (const l of [...listeners]) l(event); });
  const hostWindow: HostWindow = { addEventListener: (_, l) => hostListeners.add(l), removeEventListener: (_, l) => hostListeners.delete(l) };
  const frame: ToolFrame = {
    postMessage: (data, targetOrigin, transfer) => {
      posted.push(targetOrigin);
      later(toolListeners, { data, origin: as.origin ?? HOST_ORIGIN, source: as.source ?? hostWindow, ports: transfer as unknown as PortLike[] });
    },
  };
  const helloOrigin = as.helloOrigin ?? toolOrigin(manifest);
  const toolWindow: ToolWindow = {
    parent: Object.assign(hostWindow, { postMessage: (data: unknown) => later(hostListeners, { data, origin: helloOrigin, source: frame }) }),
    addEventListener: (_, l) => toolListeners.add(l),
    removeEventListener: (_, l) => toolListeners.delete(l),
  };
  /** A message on the tool's window, as any page could post one (a forged connect, say). */
  const postToTool = (data: unknown, from: Forged = {}, ports: PortLike[] = []) =>
    later(toolListeners, { data, origin: from.origin ?? HOST_ORIGIN, source: from.source ?? hostWindow, ports });
  /** A message on the host's window, as the frame (by default) or any page could post one: a second hello, an
   *  answer posted around the port. */
  const postToHost = (data: unknown, from: Forged = {}) =>
    later(hostListeners, { data, origin: from.origin ?? helloOrigin, source: from.source ?? frame });
  return { hostWindow, frame, toolWindow, posted, postToTool, postToHost, hostListeners, toolListeners };
}

export interface LaunchOptions {
  launch?: string;
  locale?: string;
  fallback?: string[];
  task?: Task;
  preset?: Payload;
  conventions?: Payload;
  /** The host's practice limit (MountOptions). */
  practiceLimit?: MountOptions["practiceLimit"];
  /** How long the host waits for a command's or a state request's answer (MountOptions). */
  commandTimeoutMs?: number;
  now?: () => number;
}

/** What the host received, in order, and what it refused. */
export interface Received {
  ready: Ready[];
  answers: Answer[];
  states: State[];
  commandAnswers: (CommandAck | CommandError)[];
  practice: Practice[];
  closes: Close[];
  refused: Refusal[];
}

export interface Launched {
  tool: ToolSession;
  host: HostSession;
  received: Received;
  /** What the tool's side refused (from the host). */
  toolRefused: Refusal[];
  /** Writes straight to the tool's end of the port, around the SDK: what a tool that skips it would send. */
  forge(message: unknown): void;
  /** Writes straight to the host's end of the port, around the SDK: what another host could send the tool. */
  forgeToTool(message: unknown): void;
  /** Posts on the tool's window, as another page could. */
  postToTool: ReturnType<typeof browserPair>["postToTool"];
  /** Posts on the host's window, as the frame (by default) or another page could. */
  postToHost: ReturnType<typeof browserPair>["postToHost"];
  /** The origins the host has posted a connect to (one, at the tool's origin, after the hello). */
  connects: readonly string[];
  /** Lets every message in flight arrive. */
  settle(): Promise<void>;
  close(): void;
}

/** Launches `manifest`'s tool against Narai's host, as a lesson does: hello, connect, start, then the session. The
 *  host checks payload bodies against the manifest's schemas. */
export async function launch(manifest: ToolManifest, options: LaunchOptions = {}): Promise<Launched> {
  const pair = browserPair(manifest);
  const channel = new MessageChannel();
  const received: Received = { ready: [], answers: [], states: [], commandAnswers: [], practice: [], closes: [], refused: [] };
  const toolRefused: Refusal[] = [];
  const connected = connect(manifest, { hostOrigins: [HOST_ORIGIN], window: pair.toolWindow, onRefused: (r) => toolRefused.push(r) });
  const mount: MountOptions = {
    frame: pair.frame,
    window: pair.hostWindow,
    launch: options.launch ?? "lch_testlaunch01",
    locale: options.locale ?? manifest.locales?.[0] ?? "en",
    fallback: options.fallback ?? [],
    onReady: (m) => received.ready.push(m),
    onAnswer: (m) => received.answers.push(m),
    onState: (m) => received.states.push(m),
    onCommandAnswer: (m) => received.commandAnswers.push(m),
    onPractice: (m) => received.practice.push(m),
    onClose: (m) => received.closes.push(m),
    onRefused: (r) => received.refused.push(r),
    payloads: payloadChecks(manifest),
    channel: () => channel as unknown as { port1: PortLike; port2: Transferable },
  };
  for (const key of ["task", "preset", "conventions", "practiceLimit", "commandTimeoutMs", "now"] as const) {
    if (options[key] !== undefined) (mount as unknown as Record<string, unknown>)[key] = options[key];
  }
  const host = mountTool(manifest, mount);
  const tool = await connected;
  const settle = () => new Promise<void>((r) => setTimeout(r, 10));
  return {
    tool, host, received, toolRefused,
    forge: (message) => channel.port2.postMessage(message),
    forgeToTool: (message) => channel.port1.postMessage(message),
    postToTool: pair.postToTool,
    postToHost: pair.postToHost,
    connects: pair.posted,
    settle,
    close: () => { host.close(); channel.port1.close(); channel.port2.close(); },
  };
}
