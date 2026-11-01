# Changelog

0.x: the contract (the manifest, the wire, the registry's API) can still change between minor versions; this file says
how. A version's entry lists what a tool or a host has to change, first.

## 0.3.3

Nothing to change in a tool. A host that mounts tools: pass `subject` to `mountTool` when Narai's launch carries one.

- Account linking. A manifest may declare `surfaces.account_link`: the publisher's page that starts linking (`url`),
  its OAuth client metadata document (`client_id`) and where Narai posts `account.unlinked` (`webhook`), each https.
- `narai.tool.start` gains an optional `subject`: the learner's id with the tool's publisher (43 URL-safe characters),
  the same for every tool that publisher ships. It's there only when the learner linked their account with the
  publisher and chose to let its tools know them, and only for a manifest that declares `surfaces.account_link`. It is
  never a name, an email or a Narai id. The rule: a tool never learns who the learner is, unless the learner linked
  their account with the tool's publisher and chose to let its tools know them.
- `mountTool({ subject })` passes it on; for a manifest without `surfaces.account_link` it's dropped, and the launch
  still starts. A start that carries a subject to such a manifest is refused. Every other message refuses `subject`.
  The testing `launch()` takes `subject`.
- `manifestProblems()` refuses an `account_link` whose three URLs aren't on one origin, as Narai's registry does.
- `docs/account-linking.md`: how a publisher links accounts. The client metadata document, the manifest, Sign in with
  Narai (discovery, PKCE, the scopes, `prompt=none`), the ID token, the subject in tools, the signed `account.unlinked`
  webhook and revocation.

## 0.3.2

Nothing to change in a tool. A host that mounts tools: handle `onKey` (below) to close what the tool is shown in.

- `tool.key`: an Escape the learner pressed in the tool, sent to the host, so Escape closes the dialog a tool is shown
  in even while focus is in its frame. `connect()` sends it; the tool does nothing. It goes only after the keydown's
  whole dispatch, and only when the tool didn't `preventDefault()` it (a tool's own popup keeps its Escape), it isn't a
  repeat, and it isn't part of an IME composition (an Escape that cancels a candidate never closes anything). Escape
  is the only key. `mountTool({ onKey })` hears it, even before `tool.ready`; `ConnectOptions.keys` says where keys are
  heard (the tool's window by default), and the testing `launch()` takes `keys` and records `received.keys`.
- `httpStorage`: a key the tool never kept is `not_found` when Narai answers 204 with no body, as it now does (an
  older Narai's 404 `not_found` still is). It was `denied`. `schema/openapi.tools.json` declares the 204.
  `narai dev`'s harness logs it.

## 0.3.1

Nothing to change.

- A manifest can carry its tool's `name` by language, `{ "en": "Fretboard", "ja": "フレットボード" }`: up to 20
  language tags, each a name of at most 64 characters on one line, with no space at either end. It's optional. Narai
  shows the learner's language, else the fallback, else any, else the id's tool slug title-cased.
- `musicMatch(expected, played, { ..., ordered: true })`: an ordered passage, its notes with no `at_ms`, played in
  order at any pace (`timingMs` is unused). Each note, in the passage's order, is a hit on the earliest unused note of
  its pitch after the last hit; a note still open is a wrong_pitch on the earliest unused note between its neighbours'
  notes; else it's missed. Never early or late. `schema/music_match.cases.json` adds Narai's ordered cases.

## 0.3.0

What to change: a tool or publisher slug with `--` in it, or one that starts or ends with `-`, is refused now. A slug is
lower-case words joined by single hyphens (`narai-dev/echo-two`), because `<name>--<publisher>` is the hosted tool's DNS
label. Rename such a tool before its next release.

What else to change: `music.interval-preset@1`, `music.interval-named@1`, `music.notes@1` and `music.none@1` are
Narai's now. A manifest that declares one with its own schema is refused: declare it with `musicPayloads(...)`.

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
- Four more music payloads: `music.interval-preset@1` (one pitch, or two, for an interval trainer to play),
  `music.interval-named@1` (one of the 13 interval names, P1 to P8), `music.notes@1` (pitches, pitch classes 0 to 11,
  or both) and `music.none@1` (no body). Their types are `MusicIntervalPreset`, `MusicIntervalNamed`, `MusicNotes` and
  `MusicNone`.
- `musicRules(ref, body)`: the rules across a music payload's fields that its JSON Schema can't hold (a cycle's groups
  sum to its beats, one hand per group, one syllable per beat; an interval preset's two pitches are low then high, an
  octave apart at most; notes have pitches or classes, at least one). `payloadChecks` applies them, as Narai does.
- `musicMatch(expected, played, { latencyMs, pitchTolerance, timingMs })`: Narai's play_passage and play_rhythm matcher,
  for a tool's preview of what Narai will grade. Each expected note comes out a hit, wrong_pitch, early, late or missed,
  plus the played notes nothing took (`extras`). A note without a pitch (a tap) matches on time alone, and an expected
  note without `at_ms` (a one-note target) is untimed: a hit, wrong_pitch or missed, never early or late. It runs
  Narai's own cases, `schema/music_match.cases.json`, so the two agree. Narai still decides: a tool never sends it.
- The harness answers at `localhost` wherever that resolves to `::1` first (macOS, Docker): its host page was bound to
  `::1` alone there, and refused a client that reached it over IPv4.
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
