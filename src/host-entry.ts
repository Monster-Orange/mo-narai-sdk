// @michinarai/sdk/host: what Narai's own host page needs, and nothing of a tool's runtime. No payload body checks here:
// they compile schemas at runtime (eval), which a host under a strict CSP can't do; such a host leaves `payloads` unset
// and relies on the server's validation of every answer and practice report.
export { mountTool, toolOrigin, type HelloEvent, type HostSession, type HostWindow, type MountOptions, type ToolFrame } from "./host.js";
export { CONNECT_TIMEOUT_MS, NARAI_HOST_ORIGINS } from "./origins.js";
export type { Refusal } from "./port.js";
export type { Answer, Close, Payload, Practice, Ready, Task } from "./messages.js";
export type { ToolManifest } from "./manifest.js";
