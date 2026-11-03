# Your dev server in a real lesson

The local harness (`narai dev`) mounts your tool the way a lesson mounts it, but only on your machine. When you want
to see the tool in a real Narai lesson while you change it, you can name your own dev server for a while. Narai then
frames the dev server in your own lessons, in place of your uploaded files.

Only you see it. Only your own launches of a draft of the tool are affected, and nobody else's launch reads your dev
server. It ends when you stop it, or after 8 hours (at most 24).

## What you need

- **Narai's developer beta,** a registered tool, and a draft of it pushed: `narai login`, `narai tools register` and
  `narai tools push`. The CLI's [Getting access](https://github.com/Monster-Orange/mo-narai-cli#getting-access) has
  the steps.
- **A lesson whose step uses the tool,** with a version range that takes your draft. A lesson that would open a
  reviewed version while your dev server is named is refused (`409 dev_origin_needs_draft`): push a draft the step's
  range takes.
- **Your dev server on https,** at an origin Narai accepts:
  - `https://localhost:<port>`, or a loopback address (`https://127.0.0.1:<port>`, `https://[::1]:<port>`), with a
    certificate your browser trusts;
  - or a named tunnel host (`https://<name>.<tunnel provider>`).

  The origin is an origin only: no path, query, fragment or user. Plain http and other addresses are refused
  (`422 origin_invalid`).

## With the CLI

```sh
narai dev --launch beta
```

The command does four things:
1. It serves your built files over https, where Narai's frame opens them.
2. It names that origin for the tool.
3. It prints where to open the lesson.
4. It ends the dev server's turn when you stop it (Ctrl-C).

The certificate comes from [mkcert](https://github.com/FiloSottile/mkcert). Run `mkcert -install` once yourself so
your browser trusts it; the CLI never changes your trust store. With a tunnel, give its address instead:
`narai dev --launch beta --origin https://<your tunnel>`. The CLI serves plain http on this machine for the tunnel to
forward.

## Where Narai frames it

The frame opens your dev origin at the path it would open your tool's own files at:

| The manifest's `surfaces.embed.url` | The frame opens |
|---|---|
| a path in the bundle (Narai hosts it), e.g. `app/index.html` at version `1.2.0` | `<dev origin>/1.2.0/app/index.html` |
| your own https URL, e.g. `https://music.example/tools/scales/?mode=lesson` | `<dev origin>/tools/scales/?mode=lesson` |

The harness exports both helpers, so your own dev server can serve the same paths:

```js
import { createServer } from "node:https";
import { framedPath, toolFiles } from "@michinarai/sdk/harness";

framedPath(manifest); // "/1.2.0/app/index.html"
createServer({ key, cert }, toolFiles(manifest, "dist", { launch: true })).listen(8443);
```

The frame's policy names your dev origin alone. A tool framed this way connects to Narai's host as it does from its own
files.

## The API

The registry's [OpenAPI](../schema/openapi.tools.json) describes these routes. Each needs the developer beta and the
`dev:launch` scope, which `narai login`'s token carries. A CI token's `tool:` scopes don't.

| Call | What |
|---|---|
| `PUT /api/tools/{publisher}/{name}/dev-origin` `{origin, ttl_seconds?}` | Names your dev server for the tool. `ttl_seconds` is 60 to 86400 (default 28800, 8 hours). Answers `200 {origin, expires_at}`, the origin as Narai keeps it (the host lower-cased). |
| `GET /api/tools/{publisher}/{name}/dev-origin` | Your live dev server for the tool: `200 {origin, expires_at}`, or `204` when there is none. |
| `DELETE /api/tools/{publisher}/{name}/dev-origin` | Ends it now: `204`. |

Naming one again replaces the one before. One dev server per tool, for you.
