# Schemas

Generated in mo-narai; never edit them here.

- `manifest.schema.json`: the tool manifest (JSON Schema 2020-12). It is generated from Narai's model
  (`narai/tools/manifest.py`, with `python -m narai.tools.manifest --schema`). A test in mo-narai holds the file equal to the
  model.
- `scopes.json`: the scopes a developer token (`dev:`, from `narai login`) and a CI token (`tool:`, bound to one tool
  and one environment) may carry. Copied from `narai/tools/scopes.json`.

The schema checks a manifest's shape. Narai's registry also checks what a schema can't express, and refuses the
upload when one fails:

- every payload a manifest names (preset, answers, practice, commands, conventions) is declared under `payloads`;
- no answer payload carries a verdict (`correct`, `score`, `passed` and the like), at any depth;
- commands and answers need an embed surface that runs the SDK;
- `files` are sorted by path, and `bundle_digest` is the sha256 of their canonical JSON (RFC 8785).

To change either file, change mo-narai, regenerate there, and copy the result here in the same release.
