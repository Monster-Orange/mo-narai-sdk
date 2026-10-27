import type { ToolManifest } from "./generated/manifest.js";
import { checkMessage, type CheckContext, type ToolMessage } from "./messages.js";

/** What either side needs of a MessagePort: the browser's and Node's both fit. */
export interface PortLike {
  postMessage(message: unknown): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  start?(): void;
  close(): void;
}

/** A message one side wouldn't send: the SDK checks its own messages against the manifest before they go. */
export class ToolMessageError extends Error {
  constructor(readonly reason: string) {
    super(`not sent: ${reason}`);
    this.name = "ToolMessageError";
  }
}

/** A message the other side sent that the contract refuses. It never reaches a handler. */
export interface Refusal { reason: string; data: unknown }

/** One side of the channel: every message, in and out, checked against the envelope and the manifest. */
export class Channel {
  #closed = false;

  constructor(
    private readonly port: PortLike,
    private readonly manifest: ToolManifest,
    private readonly self: CheckContext["from"],
    private readonly context: () => Omit<CheckContext, "from">,
    private readonly onRefused: (refusal: Refusal) => void,
  ) {}

  /** Receive: only what the other side may send, as the manifest declares it. */
  listen(handle: (message: ToolMessage) => void): void {
    const from = this.self === "host" ? "tool" : "host";
    this.port.addEventListener("message", (event) => {
      if (this.#closed) return;
      const checked = checkMessage(this.manifest, event.data, { ...this.context(), from });
      if (checked.ok) handle(checked.message);
      else this.onRefused({ reason: checked.reason, data: event.data });
    });
    this.port.start?.();
  }

  send(message: ToolMessage): void {
    if (this.#closed) throw new ToolMessageError("the session is closed");
    const checked = checkMessage(this.manifest, message, { ...this.context(), from: this.self });
    if (!checked.ok) throw new ToolMessageError(checked.reason);
    this.port.postMessage(message);
  }

  close(): void {
    this.#closed = true;
    this.port.close();
  }

  get closed(): boolean { return this.#closed; }
}
