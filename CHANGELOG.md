# Changelog

0.x: the contract (the manifest, the wire, the registry's API) can still change between minor versions; this file says
how. A version's entry lists what a tool or a host has to change, first.

## 0.3.0

What to change: a tool or publisher slug with `--` in it, or one that starts or ends with `-`, is refused now. A slug is
lower-case words joined by single hyphens (`narai-dev/echo-two`), because `<name>--<publisher>` is the hosted tool's DNS
label. Rename such a tool before its next release.

- `surfaces.embed.url` can be one of the tool's own files, by its path from the bundle's root (`index.html`,
  `app/index.html`), instead of an https URL. Narai then hosts the bundle at the tool's own origin in each environment,
  `https://<name>--<publisher>.tools.<env>/<version>/<path>`. The path must be one of `files`.
- `<name>--<publisher>` is at most 63 characters, a DNS label.
- `narai dev`'s harness serves a hosted embed from the bundle's root, as Narai does. `toolOrigin()` refuses a relative
  url with a clear error: a host mounts the URL Narai resolved it to.
- `narai.tool.start` carries `granted`: what the step lets the tool use for this launch, `["microphone"]` or nothing. A
  tool shows its microphone control only when `tool.start.granted` has it. Narai grants only what the manifest declares
  (`capabilities.microphone: true`) and drops the rest; `mountTool`'s `granted` option does the same, and a start that
  grants something undeclared is refused. The harness simulates a grant (`startHarness({ granted })`) and frames the
  tool with `allow="microphone <its origin>"` only then.
- Two music payloads: `music.taps@1` (taps, as heard: touch, key, MIDI or onsets from the mic, and the latency) and
  `music.cycle-preset@1` (a tala or a meter: beats in groups, a clap or wave per group, a syllable per beat, the tempo).
  Their types are `MusicTaps`, `MusicTap` and `MusicCyclePreset`.
- `musicRules(ref, body)`: the rules across a music payload's fields that its JSON Schema can't hold (a cycle's groups
  sum to its beats; one hand per group; one syllable per beat). `payloadChecks` applies them, as Narai does.
- `schema/openapi.tools.json` adds a launch's storage (`/api/tools/launches/{launch}/storage/{key}`) and the slug rule.

## 0.2.1

Nothing to change.

- `connect(manifest)` works with no options, as the README shows it. In 0.2.0 the options were required, and leaving
  them out threw `Cannot read properties of undefined`.
- The README is a front door: install, a first tool, how to run it, and links to the course, the CLI and Narai's own
  tools.

## 0.2.0

Nothing to change; one addition.

- `pickLocale(chain, declared, fallback?)`: the locale a tool shows. It returns the first entry of the host's chain the
  tool declares, the exact tag before its base language (`ja-JP` → `ja`), case-insensitively. Otherwise it returns
  `fallback`, else the manifest's first locale (English for a manifest without `locales`). The chain can be the start
  or a locale switch as it arrives: `pickLocale(tool.start, manifest.locales)`.

## 0.1.1

Nothing to change: the code and the contract are 0.1.0's.

- The first release published from this repository's release workflow, over npm's trusted publishing, with provenance.
  Merging a PR that bumps the version is the release: the workflow tags it and publishes it, nothing to approve.
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
