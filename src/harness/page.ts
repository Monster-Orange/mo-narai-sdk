// The harness's host page (browser): mounts the tool as Narai's host does and shows every message. Served by
// startHarness() at http://localhost:<port>/; the tool is on 127.0.0.1, another origin.
import { mountTool } from "../host.js";
import { memoryStorage } from "../storage.js";
import type { Payload, Task } from "../generated/envelope.js";
import type { HarnessEvent } from "./index.js";
import type { ToolManifest } from "../generated/manifest.js";

interface Config { manifest: ToolManifest; launch: string; locale: string; fallback: string[]; preset?: Payload; task?: Task }

declare global { interface Window { __narai: { events: HarnessEvent[]; ready: boolean } } }

const log = document.getElementById("log") as HTMLOListElement;
window.__narai = { events: [], ready: false };

async function record(direction: "in" | "out", message: unknown): Promise<HarnessEvent> {
  const res = await fetch("/events", { method: "POST", body: JSON.stringify({ direction, message }) });
  const event = (await res.json()) as HarnessEvent;
  window.__narai.events.push(event);
  const li = document.createElement("li");
  li.className = event.ok ? "ok" : "refused";
  li.textContent = `${direction === "in" ? "←" : "→"} ${event.type}${event.ok ? "" : ` (refused: ${event.reason ?? ""})`} ${JSON.stringify(message)}`;
  log.append(li);
  return event;
}

const config = (await (await fetch("/harness.json")).json()) as Config;
const frame = document.getElementById("tool") as HTMLIFrameElement;
frame.src = config.manifest.surfaces.embed?.url ?? "about:blank";
await new Promise((ok) => frame.addEventListener("load", ok, { once: true }));

const record_in = (m: unknown) => void record("in", m);
const session = mountTool(config.manifest, {
  frame: frame.contentWindow as Window,
  launch: config.launch,
  locale: config.locale,
  fallback: config.fallback,
  ...(config.preset ? { preset: config.preset } : {}),
  ...(config.task ? { task: config.task } : {}),
  onReady: (m) => { window.__narai.ready = true; record_in(m); },
  onAnswer: record_in,
  onPractice: record_in,
  onClose: record_in,
  onState: record_in,
  onCommandAnswer: record_in,
  onCommandSent: (m) => void record("out", m),
  // a launch's storage, kept in this page's memory (Narai's host keeps it on the server)
  storage: memoryStorage(),
  onRefused: (r) => record_in(r.data),
});

// The Tutor's commands: only those the manifest declares are offered (and the runtime refuses any other).
const commands = document.getElementById("commands") as HTMLFormElement;
const select = commands.querySelector("select") as HTMLSelectElement;
for (const [name, schema] of Object.entries(config.manifest.commands ?? {})) select.add(new Option(`${name} (${schema})`, name));
commands.hidden = select.options.length === 0;
commands.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = select.value;
  const body = (commands.querySelector("textarea") as HTMLTextAreaElement).value || "{}";
  const payload = { ...(JSON.parse(body) as object), schema: config.manifest.commands?.[name] ?? "" };
  try {
    void session.command(name, payload); // sent and recorded (onCommandSent); its answer is recorded as it comes
  } catch (error) {
    const li = document.createElement("li");
    li.className = "refused";
    li.textContent = `→ not sent: ${(error as Error).message}`;
    log.append(li);
  }
});
