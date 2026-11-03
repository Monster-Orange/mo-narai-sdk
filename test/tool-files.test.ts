import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { framedPath, toolFiles } from "../dist/harness/index.js";
import { echo } from "./fixtures.js";

// A developer's dev server in a real lesson (`narai dev --launch`): Narai frames the dev origin at the path it would
// frame the tool's own files at, so the dev server serves the built files there. A Narai-hosted embed is a path in the
// bundle, which Narai serves under the version (`/<version>/<embed url>`); any other embed keeps its own URL's path.
const f = (path: string) => ({ path, sha256: "0".repeat(64), size: 1 });
const HOSTED = { ...echo(), version: "1.2.0", surfaces: { embed: { url: "app/index.html", sdk: "^1" } }, files: [f("app/index.html"), f("shared.js")] };
const OWN = { ...echo(), surfaces: { embed: { url: "https://echo.example/tools/echo/?mode=lesson", sdk: "^1" } } };

let dir: string;
const servers: Server[] = [];

async function serve(handler: Parameters<typeof createServer>[1]): Promise<string> {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", () => ok()));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

const get = async (url: string) => { const r = await fetch(url); return { status: r.status, text: r.ok ? await r.text() : "" }; };

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "narai-files-"));
  mkdirSync(join(dir, "app"));
  writeFileSync(join(dir, "app/index.html"), "the page");
  writeFileSync(join(dir, "shared.js"), "shared");
  writeFileSync(join(dir, "index.html"), "the root page");
});

afterAll(() => {
  for (const s of servers) s.close();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe("the path Narai frames a dev origin at", () => {
  it("is the version and the bundle path, for an embed Narai hosts", () => {
    expect(framedPath(HOSTED)).toBe("/1.2.0/app/index.html");
  });

  it("is the embed URL's own path and query, for any other", () => {
    expect(framedPath(OWN)).toBe("/tools/echo/?mode=lesson");
  });
});

describe("the tool's files, served for a launch", () => {
  it("are the bundle, under the version, for an embed Narai hosts", async () => {
    const at = await serve(toolFiles(HOSTED, dir, { launch: true }));
    expect(await get(`${at}/1.2.0/app/index.html`)).toEqual({ status: 200, text: "the page" });
    expect(await get(`${at}/1.2.0/shared.js`)).toEqual({ status: 200, text: "shared" });
    expect((await get(`${at}/app/index.html`)).status).toBe(404);
    expect((await get(`${at}/1.2.0/%2e%2e/%2e%2e/etc/hosts`)).status).not.toBe(200);
  });

  it("are at the embed URL's directory, for any other, an index for the directory", async () => {
    const at = await serve(toolFiles(OWN, dir, { launch: true }));
    expect(await get(`${at}/tools/echo/`)).toEqual({ status: 200, text: "the root page" });
    expect(await get(`${at}/tools/echo/shared.js`)).toEqual({ status: 200, text: "shared" });
    expect((await get(`${at}/shared.js`)).status).toBe(404);
  });

  it("are at the bundle's root in the harness, as before", async () => {
    const at = await serve(toolFiles(HOSTED, dir));
    expect(await get(`${at}/app/index.html`)).toEqual({ status: 200, text: "the page" });
  });
});
