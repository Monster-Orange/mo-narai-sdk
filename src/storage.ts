import type { HostStorage, StorageError } from "./host.js";

/** A launch storage in memory, as Narai's store keeps it: per launch, at most `maxKeys` keys and `maxBytes` of values. */
export function memoryStorage(limits: { maxKeys?: number; maxBytes?: number } = {}): HostStorage {
  const { maxKeys = 64, maxBytes = 256 * 1024 } = limits;
  const launches = new Map<string, Map<string, string>>();
  const of = (launch: string) => {
    let kept = launches.get(launch);
    if (!kept) launches.set(launch, (kept = new Map()));
    return kept;
  };
  return {
    get: async (launch, key) => {
      const kept = of(launch).get(key);
      return kept === undefined ? { ok: false, error: "not_found" } : { ok: true, value: JSON.parse(kept) };
    },
    set: async (launch, key, value) => {
      const kept = of(launch);
      const text = JSON.stringify(value);
      const others = [...kept].filter(([k]) => k !== key);
      const bytes = others.reduce((n, [, v]) => n + v.length, 0) + text.length;
      if (others.length + 1 > maxKeys || bytes > maxBytes) return { ok: false, error: "quota" };
      kept.set(key, text);
      return { ok: true };
    },
    delete: async (launch, key) => { of(launch).delete(key); return { ok: true }; },
  };
}

/** What httpStorage needs of fetch: the platform's, or one that adds the session's credentials. */
export type FetchLike = (url: string, init: { method: string; headers?: Record<string, string>; body?: string; credentials?: "include" }) =>
  Promise<{ status: number; json(): Promise<unknown> }>;

/** A launch storage over Narai's API, GET/PUT/DELETE `/api/tools/launches/{launch}/storage/{key}`: a value (a stored
 *  null too), or no such key (204 with no body; 404 not_found from an older Narai); quota (409); denied for a launch that is gone (404) or expired (410), and
 *  for anything else the API refuses. For a host that may fetch: Narai's own host doesn't use it (its host document fetches
 *  nothing and hands storage to the lesson around it, as a HostStorage of its own). */
export function httpStorage(options: { base: string; fetch?: FetchLike }): HostStorage {
  const send = options.fetch ?? (globalThis.fetch as unknown as FetchLike);
  const url = (launch: string, key: string) =>
    `${options.base.replace(/\/+$/, "")}/api/tools/launches/${encodeURIComponent(launch)}/storage/${encodeURIComponent(key)}`;
  const failed = async (res: { status: number; json(): Promise<unknown> }): Promise<StorageError> => {
    const error = res.status === 409 ? "quota"
      : res.status === 404 ? ((await res.json().catch(() => null)) as { error?: string } | null)?.error : undefined;
    return error === "quota" ? "quota" : error === "not_found" ? "not_found" : "denied";
  };
  const request = (method: string, launch: string, key: string, body?: unknown) =>
    send(url(launch, key), {
      method, credentials: "include",
      ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    });
  return {
    get: async (launch, key) => {
      const res = await request("GET", launch, key);
      if (res.status === 204) return { ok: false, error: "not_found" };
      if (res.status !== 200) return { ok: false, error: await failed(res) };
      return { ok: true, value: ((await res.json()) as { value?: unknown }).value ?? null };
    },
    set: async (launch, key, value) => {
      const res = await request("PUT", launch, key, { value });
      return res.status === 204 || res.status === 200 ? { ok: true } : { ok: false, error: await failed(res) };
    },
    delete: async (launch, key) => {
      const res = await request("DELETE", launch, key);
      return res.status === 204 || res.status === 200 ? { ok: true } : { ok: false, error: await failed(res) };
    },
  };
}
