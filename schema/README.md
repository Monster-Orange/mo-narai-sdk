# Schemas

Generated in mo-narai; never edit them here.

- `manifest.schema.json`: the tool manifest (JSON Schema 2020-12). It is generated from Narai's model
  (`narai/tools/manifest.py`, with `python -m narai.tools.manifest --schema`). A test in mo-narai holds the file equal to the
  model.
- `envelope.schema.json`: every message between the host and a tool (`tool.hello`, `narai.tool.connect`, start, command,
  locale, ready, answer, practice, close). Generated from `narai/tools/envelope.py` (`python -m narai.tools.envelope
  --schema`), with a drift test in mo-narai. It replaces the hand-written envelope.
- `verdicts.json`: the property names no answer payload may declare (D4), under `properties` or `patternProperties`,
  at any depth, lower-cased. This file is the list Narai's check reads, `narai/tools/verdicts.json`.
- `openapi.tools.json`: the tool registry's API (`/api/tools`), generated from its routes (`python -m narai.api.tools
  --openapi`, with a drift test). The CLI's client is generated from it. 4xx bodies are `{error, message}`, and an
  upload's refusal adds `reasons`.
- `scopes.json`: the scopes a developer token (`dev:`, from `narai login`) and a CI token (`tool:`, bound to one tool
  and one environment) may carry. Copied from `narai/tools/scopes.json`.

The schema checks a manifest's shape. Narai's registry also checks what a schema can't express, and refuses the
upload when one fails:

- every payload a manifest names (preset, answers, practice, commands, conventions) is declared under `payloads`;
- no answer payload carries a verdict (`verdicts.json`), at any depth;
- commands and answers need an embed surface that runs the SDK;
- `files` are sorted by path, and `bundle_digest` is the sha256 of their canonical JSON (RFC 8785).

To change either file, change mo-narai, regenerate there, and copy the result here in the same release.
