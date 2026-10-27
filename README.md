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

## Develop

```sh
npm ci
npm test
npm run lint
npm run typecheck
```
