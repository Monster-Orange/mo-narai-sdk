# @michinarai/sdk

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

The command line (`narai`, in `@michinarai/cli`) scaffolds, validates, builds and registers tools.

## Install

```sh
npm install @michinarai/sdk
```

It's on npm from 0.1.0. Every release from 0.1.1 on is published from this repository's release workflow, with
provenance (npm shows where and from which commit it was built). What changed in each is in `CHANGELOG.md`.

## A tool

```ts
import { connect, defineTool, pickLocale } from "@michinarai/sdk";

const manifest = defineTool({ id: "you/echo", version: "0.1.0", sdk: "^1", /* … */ }); // throws a ManifestError, every reason
// or a manifest kept as JSON: defineTool(json) checks it at runtime and returns a ToolManifest
const tool = await connect(manifest);   // takes Narai's host (NARAI_HOST_ORIGINS), waits CONNECT_TIMEOUT_MS

tool.start;                       // the locale, its fallbacks, the step's preset, the task (if Narai judges one)
tool.onCommand("highlight", async (payload) => { /* only commands the manifest declares arrive */ });
//   Narai is answered once the handler is done: an ack, or an error when it throws (`failed`);
//   throw new CommandRefused("unsupported", "No capo on this neck.") to say why it wasn't done
tool.state({ schema: "echo.state@1", shown: "hello" });  // what the tool shows, in the manifest's `state` payload;
//   sent on every change, and the latest answers Narai's requests. Never anything about the learner
await tool.storage.set("last.tempo", { bpm: 90 }); // this launch's own storage, kept by Narai: a key, any JSON ≤ 16 KB
await tool.storage.get("last.tempo");               // { ok: true, value } or { ok: false, error: "not_found" | "quota" | "denied" }
const locale = pickLocale(tool.start, manifest.locales); // the first of the learner's locales the tool has, else its default
tool.onLocale((message) => { /* the learner switched language: pickLocale(message, manifest.locales) */ });
tool.ready(locale);               // rendered, in the locale actually shown
tool.answer({ schema: "echo.answer@1", text: "hello" });   // what the learner did on the task; never a verdict
tool.practice("drill", { duration_s: 30, attempts: 4, payload: { schema: "echo.drill@1", said: 4 } });
tool.close("done");
```

### The wire

The handshake: the tool says `tool.hello` to its parent once it's listening; Narai's host answers on the window with
`narai.tool.connect` and a `MessagePort`, from a listed origin only; every later message travels on the port. A tool
frame that reloads says hello again and is connected again, on a new port, to the same launch (its storage kept, the
start sent again, ready said again); the old port is closed, so only one is ever live. A hello from any other page or
origin is never answered. Both sides
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

Every `narai.tool.command` carries an `id`, and the tool answers it once: `tool.command.ack`, or `tool.command.error`
with a code (`unknown_command`, `invalid_payload`, `unsupported`, `failed`). The SDK sends these for you; a host's
`command()` resolves to the answer, and to `failed` after `COMMAND_TIMEOUT_MS` (10 s) with none. `narai.tool.state.get`
asks for the tool's state, which comes back as `tool.state` naming the request (`re`).

A launch's storage: `tool.storage.get|set|delete` and Narai's `narai.tool.storage.result`. The host keeps it under its own
launch, never one the tool names; keys are `^[a-z0-9._-]{1,64}$`, a value is any JSON up to 16 KB, and a launch holds at
most 64 keys and 256 KB. A host passes `storage` to `mountTool`: `httpStorage({ base })` over Narai's API, or
`memoryStorage()` (the harness's).

`@michinarai/sdk/payloads` checks payload bodies against the JSON Schemas the manifest declares (it compiles them, so it's
for the host, the harness and the CLI, where eval is allowed).

**Who may connect.** A tool takes a connect only from its parent window, at one of Narai's origins:
`NARAI_HOST_ORIGINS` (`https://michinar.ai`, `https://beta.michinar.ai`), or the `hostOrigins` you pass. A tool in
development, served from this machine or under `local.michinar.ai`, also takes a local Narai
(`https://local.michinar.ai`) and a host on this machine; a tool anywhere else never does. `connect` gives up after
`CONNECT_TIMEOUT_MS` (10 s; `timeoutMs: Infinity` waits), the same number Narai's host waits before it says a tool didn't
load.

**Narai's host** imports `@michinarai/sdk/host`: `mountTool`, `toolOrigin`, `CONNECT_TIMEOUT_MS` and
`NARAI_HOST_ORIGINS`, and nothing of a tool's runtime. A host under a strict CSP (no `'unsafe-eval'`) can't compile
payload schemas, so it leaves `payloads` unset and relies on the server, which validates every answer and practice
report's body against the manifest. Everything else (the envelope, the declared names and schemas, the verdict ban,
the size cap, this launch and task, ready first) is checked by precompiled code and holds there too.

## Testing a tool

`@michinarai/sdk/testing` launches a tool's session against Narai's own host over a real `MessageChannel`, wired as a
browser wires the iframe:

```ts
import { launch } from "@michinarai/sdk/testing";

const run = await launch(manifest, { locale: "ja", task });
run.tool.ready("ja");
run.tool.answer({ schema: "echo.answer@1", text: "hello" });
await run.settle();
run.received.answers;   // what the host took; run.received.refused: what it didn't, with the reason
run.forge({ type: "tool.answer" /* … */ });   // straight onto the port, around the SDK
run.postToTool({ type: "narai.tool.connect", v: 1 }, { origin: "https://evil.example" });   // as another page
run.postToHost({ type: "tool.hello", v: 1 });   // on the host's window, as the frame (or { origin, source })
run.connects;           // where the host has posted a connect: once, at the tool's origin
run.close();
```

## The harness

```ts
import { startHarness } from "@michinarai/sdk/harness";

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

## Stability

0.x: the contract (the manifest, the wire, the registry's API) can still change between minor versions, and the
changelog (`CHANGELOG.md`) says how. 1.0 will hold it.

## Releasing

npm's trusted publishing only: no npm token, in CI or anywhere else. The workflow is `.github/workflows/release.yml`.

**Every release.** Merge a PR that bumps `version` in package.json (and says what changed in `CHANGELOG.md`): that's
the release. On every push to main, the workflow asks npm whether that version is published. When it isn't, the
workflow runs the gates, packs the tarball and its `SHA256SUMS`, tags the commit `v<version>`, **publishes** it on npm
over OIDC (`npm publish`), and makes a GitHub release with both files. A version already on npm: nothing happens.
There's no step for a person, no tag to push and nothing to approve.

**The first publish of the package, once (done: 0.1.0).** Trusted publishing can't create a package, so a maintainer
published the first version by hand, from their own machine:

1. Run the workflow by hand (Actions › release › Run workflow). It's a dry run, and it keeps the tarball and
   `SHA256SUMS` as the `release` artifact. Download it.
2. In that folder: `sha256sum -c SHA256SUMS` (on a Mac, `shasum -a 256 -c SHA256SUMS`), then
   `npm login --auth-type=web && npm publish <tarball> --access public && npm logout`.
3. On npmjs.com, the package › Settings › Trusted publisher › GitHub Actions: organization `Monster-Orange`, repository
   `mo-narai-sdk`, workflow `release.yml`, allowed to publish directly.
4. The same page › Publishing access: **Require two-factor authentication and disallow tokens**. Trusted publishing
   still works.

Mind:

- The trusted-publisher fields are case-sensitive, and npm doesn't check them when they're saved. A mismatch fails
  only at publish time, as an `E404` that looks like a missing package. package.json's `repository.url` must be this
  repository exactly.
- A new trusted-publisher configuration must publish within 2 days, or it expires.
- npm trusts the workflow by its file name, `release.yml`: renaming it breaks publishing (an `E404`) until the
  trusted publisher is changed to match.
- Provenance is on: npm generates it under trusted publishing for a public repository and a public package, with no
  flag. package.json's `repository.url` is what npm checks it against. The one-time first
  publish, from a maintainer's machine, has none.
