import { describe, expect, it } from "vitest";
import { httpStorage } from "../src/storage.js";

// A launch's storage over Narai's API (GET/PUT/DELETE /api/tools/launches/{launch}/storage/{key}): what each answer means
// for the tool. Narai's host plugs it into mountTool's `storage`.
function server(responses: Record<string, { status: number; body?: unknown }>) {
  const calls: { method: string; url: string; body?: string }[] = [];
  const fetch = async (url: string, init: { method: string; body?: string }) => {
    calls.push({ method: init.method, url, ...(init.body ? { body: init.body } : {}) });
    const r = responses[`${init.method} ${new URL(url).pathname}`] ?? { status: 500 };
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status });
  };
  return { fetch, calls };
}

const at = (key: string) => `/api/tools/launches/lch_testlaunch01/storage/${key}`;

describe("httpStorage", () => {
  it("reads a value, a stored null, and a missing key", async () => {
    const s = server({ [`GET ${at("a")}`]: { status: 200, body: { value: { bpm: 90 } } }, [`GET ${at("n")}`]: { status: 200, body: { value: null } },
      [`GET ${at("gone")}`]: { status: 404, body: { error: "not_found" } } });
    const store = httpStorage({ base: "https://michinar.ai", fetch: s.fetch });
    await expect(store.get("lch_testlaunch01", "a")).resolves.toEqual({ ok: true, value: { bpm: 90 } });
    await expect(store.get("lch_testlaunch01", "n")).resolves.toEqual({ ok: true, value: null });
    await expect(store.get("lch_testlaunch01", "gone")).resolves.toEqual({ ok: false, error: "not_found" });
  });

  it("reads a key never kept, which Narai answers 204 with no body, as not_found", async () => {
    const s = server({ [`GET ${at("new")}`]: { status: 204 } });
    const store = httpStorage({ base: "https://michinar.ai", fetch: s.fetch });
    await expect(store.get("lch_testlaunch01", "new")).resolves.toEqual({ ok: false, error: "not_found" });
  });

  it("writes and deletes, and says quota or denied as the API does", async () => {
    const s = server({ [`PUT ${at("a")}`]: { status: 204 }, [`PUT ${at("b")}`]: { status: 409, body: { error: "quota" } },
      [`DELETE ${at("a")}`]: { status: 204 }, [`GET ${at("x")}`]: { status: 410, body: { error: "expired" } },
      [`PUT ${at("y")}`]: { status: 404, body: { error: "launch_not_found" } } });
    const store = httpStorage({ base: "https://michinar.ai", fetch: s.fetch });
    await expect(store.set("lch_testlaunch01", "a", [1, 2])).resolves.toEqual({ ok: true });
    expect(s.calls[0]).toEqual({ method: "PUT", url: `https://michinar.ai${at("a")}`, body: JSON.stringify({ value: [1, 2] }) });
    await expect(store.set("lch_testlaunch01", "b", 1)).resolves.toEqual({ ok: false, error: "quota" });
    await expect(store.delete("lch_testlaunch01", "a")).resolves.toEqual({ ok: true });
    await expect(store.get("lch_testlaunch01", "x")).resolves.toEqual({ ok: false, error: "denied" });
    await expect(store.set("lch_testlaunch01", "y", 1)).resolves.toEqual({ ok: false, error: "denied" });
  });

  it("names the launch and the key in the path, escaped", async () => {
    const s = server({});
    await httpStorage({ base: "https://michinar.ai/", fetch: s.fetch }).get("lch_testlaunch01", "last.tempo");
    expect(s.calls[0]?.url).toBe(`https://michinar.ai${at("last.tempo")}`);
  });
});
