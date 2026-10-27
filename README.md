# @narai/sdk

Build tools that run inside Narai lessons.

A tool is a small web app that Narai mounts in a sandboxed frame on its own origin. It shows the learner an
instrument (a fretboard, a color wheel, a construction canvas) and reports what the learner did. Narai keeps the
answer keys, runs every judge and owns the learner model: a tool never grades and never learns who the learner is.

This package gives a tool:

- `defineTool()`, its manifest: what it can show, which answers and practice it reports, which commands the Tutor
  may send it;
- the embed runtime: the handshake with Narai's host over a `MessagePort`, `tool.answer` and `tool.practice`
  events, and `narai.tool.command` for the commands the manifest declares, every message checked against it;
- a local harness that mounts the tool in a sandboxed frame on a separate origin, as Narai does.

The command line (`narai`, in `@narai/cli`) scaffolds, validates, builds and registers tools.

## A tool

```ts
import { connect, defineTool } from "@narai/sdk";

const manifest = defineTool({ id: "you/echo", version: "0.1.0", sdk: "^1", /* … */ }); // throws a ManifestError, every reason
// or a manifest kept as JSON: defineTool(json) checks it at runtime and returns a ToolManifest
const tool = await connect(manifest, { hostOrigins: ["https://michinar.ai"] });

tool.start;                       // the locale, its fallbacks, the step's preset, the task (if Narai judges one)
tool.onCommand("highlight", (payload) => { /* only commands the manifest declares arrive */ });
tool.onLocale((message) => { /* the learner switched language */ });
tool.ready("en");                 // rendered, in the locale actually shown
tool.answer({ schema: "echo.answer@1", text: "hello" });   // what the learner did on the task; never a verdict
tool.practice("drill", { duration_s: 30, attempts: 4, payload: { schema: "echo.drill@1", said: 4 } });
tool.close("done");
```

### The wire

The handshake: the tool says `tool.hello` to its parent once it's listening; Narai's host answers on the window with
`narai.tool.connect` and a `MessagePort`, from a listed origin only; every later message travels on the port. Both sides
check every message against the envelope (`schema/envelope.schema.json`) and the manifest, and refuse what it doesn't
declare: a command it doesn't list, a payload in another schema, a verdict (`correct`, `score`, `passed` …) anywhere
in an answer, a payload over 64 KB, a message for another launch.

A payload is `{ schema: "<family>.<name>@<N>", ...body }`. The JSON Schema a manifest declares under `payloads` describes
the **body only**: the SDK takes `schema` off before checking it, so a schema that requires `schema` fails every payload
(`manifestWarnings()` says so).

```json
"payloads": { "echo.answer@1": { "type": "object", "properties": { "text": { "type": "string" } }, "required": ["text"] } }
```

Narai's host takes a burst of 10 `tool.practice`, then 6 a minute, per launch: batch practice (the excess is refused,
and counted).

`@narai/sdk/payloads` checks payload bodies against the JSON Schemas the manifest declares (it compiles them, so it's
for the host, the harness and the CLI, where eval is allowed).

## Testing a tool

`@narai/sdk/testing` launches a tool's session against Narai's own host over a real `MessageChannel`, wired as a
browser wires the iframe:

```ts
import { launch } from "@narai/sdk/testing";

const run = await launch(manifest, { locale: "ja", task });
run.tool.ready("ja");
run.tool.answer({ schema: "echo.answer@1", text: "hello" });
await run.settle();
run.received.answers;   // what the host took; run.received.refused: what it didn't, with the reason
run.forge({ type: "tool.answer" /* … */ });   // straight onto the port, around the SDK
run.postToTool({ type: "narai.tool.connect", v: 1 }, { origin: "https://evil.example" });   // as another page
run.close();
```

## The harness

```ts
import { startHarness } from "@narai/sdk/harness";

const harness = await startHarness({ manifest, toolDir: "dist", locale: "ja", task });
// harness.hostUrl: Narai's host on http://localhost; the tool on http://127.0.0.1 in a sandboxed iframe
```

The host page shows every message with the harness's verdict on it and sends the manifest's commands as the Tutor
would. `narai dev` runs it.

## Schemas

`schema/manifest.schema.json` and `schema/scopes.json` are generated in mo-narai (see `schema/README.md`); never edit
them here. `schema/envelope.schema.json`, the wire envelope, is here until the server generates it like the manifest
(then it, and the verdict words in `src/verdicts.ts`, come from mo-narai too). `npm run generate` writes
`src/generated/` (types and precompiled validators) from them; a test fails when it's stale.

## Develop

```sh
npm ci
npm test
npm run lint
npm run typecheck
```
