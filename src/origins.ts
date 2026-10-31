/** Where Narai's host runs: a tool takes a connect from these and no other (unless it's in development, below). */
export const NARAI_HOST_ORIGINS: readonly string[] = Object.freeze(["https://michinar.ai", "https://beta.michinar.ai"]);

/** How long a tool waits for Narai's host to connect, and how long the host shows a tool as loading before it says the
 *  tool didn't load: one number for both sides. */
export const CONNECT_TIMEOUT_MS = 10_000;

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);
const LOCAL_NARAI = "local.michinar.ai";

/** A tool in development: served from this machine (`narai dev`) or by a local Narai. */
export function isDevHostname(hostname: string): boolean {
  return LOOPBACK.has(hostname) || hostname === LOCAL_NARAI || hostname.endsWith(`.${LOCAL_NARAI}`);
}

/** The hosts a tool in development also takes: a local Narai, and a host on this machine (the harness). */
export function isDevHostOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return (url.protocol === "http:" && LOOPBACK.has(url.hostname)) || url.origin === `https://${LOCAL_NARAI}`;
  } catch {
    return false;
  }
}
