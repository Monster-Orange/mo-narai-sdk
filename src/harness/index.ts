import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { Payload, Task } from "../generated/envelope.js";
import type { ToolManifest } from "../generated/manifest.js";
import { manifestProblems, ManifestError } from "../manifest.js";
import type { Grant } from "../host.js";
import { checkMessage } from "../messages.js";
import { payloadChecks } from "../payloads.js";

/** The local test harness (`narai dev`): Narai's host on one origin, the tool on another, the tool in a sandboxed
 *  iframe, as in a lesson. The host is `http://localhost:<port>`, the tool `http://127.0.0.1:<port>`: two origins. */
export interface HarnessOptions {
  manifest: ToolManifest;
  /** The tool's built files; served at the embed URL's path. */
  toolDir: string;
  hostPort?: number;
  toolPort?: number;
  locale?: string;
  fallback?: string[];
  preset?: Payload;
  task?: Task;
  /** What the step grants, simulated (`narai dev --grant microphone`): the manifest's capabilities filter it. */
  granted?: readonly Grant[];
}

export interface HarnessEvent { at: number; direction: "in" | "out"; type: string; ok: boolean; reason?: string; message: unknown }

export interface Harness {
  hostUrl: string;
  toolUrl: string;
  /** Every message across the channel, with the harness's verdict on it (payload bodies checked in Node). */
  events: HarnessEvent[];
  close(): Promise<void>;
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".wasm": "application/wasm", ".map": "application/json",
};

/** The SDK's own built files (dist/), which both pages import from `/sdk/`. */
const SDK_DIR = resolve(fileURLToPath(new URL("..", import.meta.url)));

async function serveFile(res: ServerResponse, root: string, path: string, headers: Record<string, string> = {}): Promise<void> {
  const file = normalize(join(root, decodeURIComponent(path)));
  if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "no-store", ...headers }).end(body);
  } catch {
    res.writeHead(404).end();
  }
}

function listen(server: Server, port: number, host: string): Promise<number> {
  return new Promise((ok, fail) => {
    server.once("error", fail);
    server.listen(port, host, () => {
      const address = server.address();
      ok(typeof address === "object" && address ? address.port : port);
    });
  });
}

async function body(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

export async function startHarness(options: HarnessOptions): Promise<Harness> {
  const problems = manifestProblems(options.manifest);
  if (problems.length) throw new ManifestError(problems);
  const embed = options.manifest.surfaces.embed;
  if (!embed) throw new Error(`${options.manifest.id} has no embed surface: there's nothing to mount`);
  const toolDir = resolve(options.toolDir);
  const embedPath = new URL(embed.url, "http://tool.invalid/").pathname;
  // an embed Narai hosts (a relative url) is a path from the bundle's root, which Narai serves at the tool's origin
  const hosted = !embed.url.startsWith("https://");
  const embedDir = hosted ? "/" : embedPath.slice(0, embedPath.lastIndexOf("/") + 1);
  const events: HarnessEvent[] = [];
  const payloads = payloadChecks(options.manifest);

  const toolServer = createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://x").pathname;
    if (path.startsWith("/sdk/")) { void serveFile(res, SDK_DIR, path.slice("/sdk/".length)); return; }
    // the tool's files are at the embed URL's directory: /tool/ is toolDir/index.html, /tool/app.js toolDir/app.js (a
    // hosted embed's directory is the root)
    if (!path.startsWith(embedDir)) { res.writeHead(404).end(); return; }
    const relative = path.slice(embedDir.length);
    void serveFile(res, toolDir, relative === "" || relative.endsWith("/") ? `${relative}index.html` : relative);
  });
  const toolPort = await listen(toolServer, options.toolPort ?? 0, "127.0.0.1");
  const toolOrigin = `http://127.0.0.1:${toolPort}`;
  const manifest: ToolManifest = { ...options.manifest, surfaces: { ...options.manifest.surfaces, embed: { ...embed, url: `${toolOrigin}${embedPath}` } } };

  const hostServer = createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://x").pathname;
    if (path === "/") {
      void serveFile(res, SDK_DIR, "harness/page.html", {
        "content-security-policy": `default-src 'self'; script-src 'self'; frame-src ${toolOrigin}; style-src 'self' 'unsafe-inline'`,
      });
    } else if (path === "/harness.json") {
      const launch = `lch_dev${Math.random().toString(36).slice(2, 12)}`;
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify({
        manifest, launch, locale: options.locale ?? manifest.locales?.[0] ?? "en", fallback: options.fallback ?? [],
        preset: options.preset, task: options.task, granted: options.granted ?? [],
      }));
    } else if (path === "/events" && req.method === "POST") {
      void body(req).then((text) => {
        const { direction, message } = JSON.parse(text) as { direction: "in" | "out"; message: unknown };
        const checked = checkMessage(manifest, message, { from: direction === "in" ? "tool" : "host", task: options.task, payloads });
        const type = typeof message === "object" && message && "type" in message ? String(message.type) : "?";
        const event: HarnessEvent = { at: Date.now(), direction, type, ok: checked.ok, message };
        if (!checked.ok) event.reason = checked.reason;
        events.push(event);
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(event));
      });
    } else if (path.startsWith("/sdk/")) {
      void serveFile(res, SDK_DIR, path.slice("/sdk/".length));
    } else {
      res.writeHead(404).end();
    }
  });
  const hostPort = await listen(hostServer, options.hostPort ?? 0, "localhost");
  const close = (s: Server) => new Promise<void>((ok) => { s.closeAllConnections(); s.close(() => ok()); });
  return {
    hostUrl: `http://localhost:${hostPort}/`,
    toolUrl: `${toolOrigin}${embedPath}`,
    events,
    close: async () => { await Promise.all([close(hostServer), close(toolServer)]); },
  };
}
