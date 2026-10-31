# Changelog

0.x: the contract (the manifest, the wire, the registry's API) can still change between minor versions; this file says
how. A version's entry lists what a tool or a host has to change, first.

## 0.1.1

Nothing to change: the code and the contract are 0.1.0's.

- The first release published from this repository's release workflow, over npm's trusted publishing, with provenance.
  A tag publishes; nothing to approve.
- The README says how to install the package, and points here.

## 0.1.0

The first release.

- `defineTool()`: a tool's manifest, checked at build time and at runtime, with every reason it's refused. A manifest
  declares its payloads (each JSON Schema describes the body), its answers, practice, commands, state and task
  payloads.
- `connect()`: the embed runtime. The handshake with Narai's host over a `MessagePort`, from its listed origins only
  (`NARAI_HOST_ORIGINS`, `CONNECT_TIMEOUT_MS`); answers, practice, commands with an ack or an error for each, the
  tool's state, the launch's own storage, the locale and its fallbacks. A reloaded frame reconnects to the same launch,
  on a new port; only one port is ever live.
- `@michinarai/sdk/host`: Narai's host (`mountTool`, `httpStorage`, `memoryStorage`, `COMMAND_TIMEOUT_MS`).
- `@michinarai/sdk/payloads`: payload bodies checked against the manifest's schemas, for hosts, harnesses and tooling.
- `@michinarai/sdk/testing` and `@michinarai/sdk/harness`: a tool's session against Narai's own host, and a local
  harness that mounts the tool in a sandboxed frame on a separate origin.
- Narai's music payloads (`music.played@1`, `music.neck-preset@1`, `music.neck-state@1`, `music.tab-practice@1`), with
  their schemas.
