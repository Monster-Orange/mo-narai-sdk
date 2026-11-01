# Account linking: "Sign in with Narai"

A tool never learns who the learner is, unless the learner linked their account with the tool's publisher and chose
to let its tools know them. This guide is for a publisher with accounts of its own (a music school, a practice app):
how a learner links their Narai account with their account on your side, what you get, and how a link ends.

Narai is the OpenID provider. You are a public OAuth client, identified by a client metadata document you host: there
is no registration form, no client secret and no API key. A learner links once, on Narai's consent screen. After that:

- your site can sign them in with Narai (OpenID Connect, authorization code with PKCE);
- your tools can be told who they are, as a pairwise id, if the learner chose "Know you in its tools";
- when the link ends, on either side, the other side is told.

The addresses below are beta's (`https://beta.michinar.ai`). Another Narai has its own: read them from its discovery
document, never by changing a host by hand.

## What you never get

- **No Narai id.** You know the learner only by a pairwise subject: an id made for your publisher alone. Every tool
  you publish sees the same one, and no other publisher can match it to theirs.
- **No linking by email.** A link is made only on Narai's consent screen, by the learner, signed in. Narai never
  matches accounts by address, and you should not either: match on the subject.
- **Nothing the learner didn't choose.** Their name and email reach you only under the scopes they approved, and the
  email only when Narai has verified it.

## 1. Publish a client metadata document

Your `client_id` is the https URL of a JSON document you host. Narai fetches it when a sign-in starts, and caches it
(between 60 seconds and an hour, from your `Cache-Control`).

```json
{
  "client_id": "https://music.example/narai/client.json",
  "client_name": "Music Example",
  "redirect_uris": ["https://music.example/narai/callback"],
  "grant_types": ["authorization_code", "refresh_token"],
  "token_endpoint_auth_method": "none"
}
```

Narai refuses the document unless:

- `client_id` is the document's own URL, https on port 443, with a path, no fragment and no user info, on a host
  name (not an IP address) that resolves only to public addresses;
- `client_name` is set (it's the name the learner sees on the consent screen);
- `redirect_uris` has 1 to 20 entries, each https (plain http only for a loopback address), with no fragment. A sign-in's
  `redirect_uri` must equal one of them exactly;
- `grant_types` includes `authorization_code` (the default is `authorization_code` and `refresh_token`);
- `token_endpoint_auth_method` is `none` (or absent): a client with a secret is refused.

The document is at most 64 KiB, served directly (Narai follows no redirect). Anything else in it (a `jwks`, a
`scope`) is ignored.

## 2. Declare it in your manifest

A tool's manifest names its publisher's account linking under `surfaces.account_link`: all three URLs are https and
on one origin, the origin of your client metadata document.

```json
"surfaces": {
  "embed": { "url": "https://music.example/tools/scales/", "sdk": "^1" },
  "account_link": {
    "url": "https://music.example/connect/narai",
    "client_id": "https://music.example/narai/client.json",
    "webhook": "https://music.example/narai/unlinked"
  }
}
```

- `url`: your own page that starts linking (your "Connect Narai").
- `client_id`: the client metadata document above. It's the only client Narai accepts for your links.
- `webhook`: where Narai posts `account.unlinked` when a link ends (section 6).

`defineTool()`'s schema checks the shape, and `manifestProblems()` (what `narai validate` runs) also refuses three
URLs that aren't on one origin, as Narai's registry does. Narai accepts your client for links once a reviewed version of one of your tools declares it. Before that, a
draft's declaration works for your publisher's own members, so you can link your own account while you build.

## 3. Sign in with Narai

Discovery: `https://beta.michinar.ai/.well-known/openid-configuration`. It names:

| | |
|---|---|
| `issuer` | `https://beta.michinar.ai` |
| `authorization_endpoint` | `https://beta.michinar.ai/oauth/authorize` |
| `token_endpoint` | `https://beta.michinar.ai/oauth/token` |
| `userinfo_endpoint` | `https://beta.michinar.ai/oauth/userinfo` |
| `jwks_uri` | `https://beta.michinar.ai/.well-known/jwks.json` |
| `revocation_endpoint` | `https://beta.michinar.ai/oauth/revoke` |

Subjects are `pairwise`, ID tokens are signed `ES256`, PKCE is `S256` only, and there is no client authentication
(`none`).

### The authorization request

Send the learner's browser to the authorization endpoint:

```text
https://beta.michinar.ai/oauth/authorize
  ?response_type=code
  &client_id=https%3A%2F%2Fmusic.example%2Fnarai%2Fclient.json
  &redirect_uri=https%3A%2F%2Fmusic.example%2Fnarai%2Fcallback
  &scope=openid%20account.link%20profile.name%20launch.identity
  &state=<random, checked on return>
  &nonce=<random, checked in the ID token>
  &code_challenge=<base64url(SHA-256(code_verifier)), 43 characters>
  &code_challenge_method=S256
```

- `openid` makes it a sign-in for your publisher: Narai recognizes your `client_id` from your manifest.
- `response_type=code` and PKCE with `S256` are required. A request without them is answered at your `redirect_uri`
  with `error=invalid_request` or `unsupported_response_type`.
- `resource` is optional; if you send it, it must be `https://beta.michinar.ai/oauth/userinfo`.

The learner signs in to Narai if they aren't already, and sees Narai's consent screen with your `client_name` and
the scopes you asked for. They approve or close it. Approving makes the link (or, if they have one, sets its scopes
to what they chose now: a learner has one link with you at most) and returns to your `redirect_uri` with `code`,
`state` and `iss`. Check that `state` is yours and that `iss` is exactly the issuer. Closing returns
`error=access_denied`.

### Scopes

| Scope | What it gives you |
|---|---|
| `account.link` | The link itself: the subject. Always granted; you don't need to ask for it. |
| `profile.name` | The learner's display name, as `name`. Opt-in. |
| `email` | The learner's verified email, as `email` with `email_verified: true`. Opt-in. |
| `launch.identity` | "Know you in its tools": every tool you publish gets the subject on its start, `tool.start.subject` (section 5). Opt-in. |

The learner chooses on the consent screen; ask only for what you use.

### Signing in again, with no screen

A learner who already linked can be signed in without the consent screen: add `prompt=none`. Narai answers at once,
at your `redirect_uri`:

- a `code`, when the learner is signed in to Narai and their live link holds every scope you asked for;
- `error=login_required`, when they aren't signed in to Narai;
- `error=consent_required`, when they have no live link with you, or it doesn't hold a scope you asked for.

On an error, send them through the request again without `prompt=none`.

### The token request

Exchange the code at the token endpoint, as `application/x-www-form-urlencoded`, with no client secret:

```text
POST https://beta.michinar.ai/oauth/token
grant_type=authorization_code
&code=<the code>
&client_id=https://music.example/narai/client.json
&redirect_uri=https://music.example/narai/callback
&code_verifier=<the verifier>
```

The answer:

```json
{
  "access_token": "…",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "…",
  "scope": "openid account.link profile.name launch.identity",
  "id_token": "eyJ…"
}
```

A code is used once; a second use ends the grant. A refresh token rotates: each use returns a new pair, and using a
spent one ends the grant. The access token opens `/oauth/userinfo` and nothing else (it lasts an hour; the refresh
token, 30 days).

### The ID token

Verify the ID token against the JWKS (cache it; a new signing key appears there before Narai signs with it):

- `alg` is `ES256`, and `kid` names a key in the JWKS;
- `iss` is the issuer, `aud` is your `client_id`, and `exp` hasn't passed (an ID token lasts 5 minutes);
- `nonce` is the one you sent.

Its claims: `iss`, `aud`, `sub` (the pairwise subject: 43 URL-safe characters), `auth_time`, `iat`, `exp`, `nonce`,
and, under their scopes, `name`, and `email` with `email_verified`.

```js
import { createRemoteJWKSet, jwtVerify } from "jose";

const NARAI = "https://beta.michinar.ai";
const CLIENT_ID = "https://music.example/narai/client.json";
const jwks = createRemoteJWKSet(new URL(`${NARAI}/.well-known/jwks.json`));

export async function narai(idToken, nonce) {
  const { payload } = await jwtVerify(idToken, jwks, { issuer: NARAI, audience: CLIENT_ID, algorithms: ["ES256"] });
  if (payload.nonce !== nonce) throw new Error("not our sign-in");
  return payload; // payload.sub: the learner, for you. Match your account on it, never on the email.
}
```

`GET /oauth/userinfo` with `Authorization: Bearer <access_token>` answers the same claims about the learner: `sub`,
and `name` and `email` under their scopes. For an ended link, it answers 401.

## 4. Your "Connect Narai" page

`surfaces.account_link.url` is the page on your site where a learner starts linking: sign them in to your own
account first, then send them through the authorization request. On your callback, store the subject on their
account: that's the link, on your side.

## 5. The subject in your tools

When the learner granted `launch.identity`, every tool you publish gets the subject on its start:

```ts
const tool = await connect(manifest);
tool.start.subject; // the same value as the ID token's `sub`, or absent
```

It's present only when the learner has a live link with you that holds `launch.identity`, and only for a tool whose
manifest declares `surfaces.account_link`. Otherwise it's absent, and the tool must work without it. A tool uses it
to find the learner's account on your side; it never shows it.

## 6. When a link ends

A link ends when the learner disconnects it in Narai (Account › Connected apps), when an admin ends it, when accounts
are merged or erased, or when you end it yourself.

### Narai tells you: `account.unlinked`

Unless you ended it, Narai posts a signed event to your `webhook`: `POST`, `Content-Type: application/jwt`, the body
a JWT whose header has `typ: account-unlinked+jwt` and `alg: ES256`. Its claims:

| Claim | |
|---|---|
| `iss` | the issuer |
| `aud` | your `client_id` |
| `sub` | the learner's subject: the link that ended |
| `jti` | the event's id (the link's), the same on every delivery of it |
| `iat` | when it was signed |
| `event` | `"account.unlinked"` |

It carries no name and no email. Verify it with the same JWKS, then end the link on your side (forget the subject on
that account) and answer with any 2xx. Any other answer, or none in 10 seconds, is retried: an event can arrive more
than once, so dedupe by `jti`.

```js
export async function unlinked(body) {
  const { payload } = await jwtVerify(body, jwks, {
    issuer: NARAI, audience: CLIENT_ID, algorithms: ["ES256"], typ: "account-unlinked+jwt",
  });
  if (payload.event !== "account.unlinked") throw new Error("not an unlink");
  return { subject: payload.sub, event: payload.jti };
}
```

Your webhook must be an https URL whose host resolves to public addresses; Narai follows no redirect.

### You end it: revocation

When the learner disconnects Narai on your side, revoke any token of the link (RFC 7009):

```text
POST https://beta.michinar.ai/oauth/revoke
token=<the refresh token, or an access token>
&client_id=https://music.example/narai/client.json
```

That ends the link in Narai too: the learner's Connected apps shows it as ended. Narai doesn't post
`account.unlinked` for a link you ended. The endpoint answers 200 for any token, known or not.
