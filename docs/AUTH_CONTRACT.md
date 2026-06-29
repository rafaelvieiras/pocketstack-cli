# CLI authentication contract

This document specifies the handshake the CLI's `pocketstack login` expects from
the PocketStack web app (the Studio / control plane). The CLI side is already
built against this contract; the server side still needs to be implemented.

The flow follows the OAuth 2.0 native-app pattern for loopback redirects
([RFC 8252](https://datatracker.ietf.org/doc/html/rfc8252)) — the same approach
the Supabase CLI uses.

## Overview

```
 CLI                              Browser                       Studio (web)
  │  start loopback server          │                                │
  │  open authorize URL ───────────▶│  GET /cli/authorize?…          │
  │                                 │ ──────────────────────────────▶│
  │                                 │  (operator already logged in,   │
  │                                 │   or redirected to /login)      │
  │                                 │  operator clicks "Authorize"    │
  │                                 │ ◀── issue CLI token ────────────│
  │  ◀── token to loopback callback │                                │
  │  validate state, save token     │                                │
```

## 1. Authorize request (CLI → browser → Studio)

The CLI opens this URL in the browser:

```
GET {host}/cli/authorize
  ?redirect_uri=http://127.0.0.1:<port>/callback
  &state=<random base64url, anti-CSRF>
  &client=pocketstack
  &version=<cli version>
  &name=<label, e.g. user@hostname>
```

- `<port>` is an ephemeral port the CLI is listening on at `127.0.0.1`.
- `redirect_uri` will always be `http://127.0.0.1:<port>/callback`. The Studio
  **must** only accept loopback (`127.0.0.1`) redirect URIs to avoid token
  exfiltration.
- `state` is opaque; it must be echoed back unchanged.

The Studio page:

1. Requires an authenticated operator session (reuse `requireSession`). If not
   logged in, redirect to `/login?next=<this url>` and back.
2. Shows an approval screen ("Authorize the PocketStack CLI on _name_?").
3. On approval, issues a **CLI token** (see §3) and returns it to the loopback
   callback using **either** method below.

## 2. Returning the token to the CLI

The CLI's loopback server accepts the token in two interchangeable ways. Prefer
**(B) POST** so the token never lands in browser history or server logs.

### (A) GET redirect

Redirect the browser to:

```
http://127.0.0.1:<port>/callback?token=<cli token>&state=<state>&email=<operator email>
```

The CLI responds with an HTML "you can close this tab" page.

### (B) POST (recommended)

From the approval page, `fetch` the loopback server:

```
POST http://127.0.0.1:<port>/callback
Content-Type: application/json

{ "token": "<cli token>", "state": "<state>", "email": "<operator email>" }
```

The loopback server already sends permissive CORS for the `{host}` origin
(`Access-Control-Allow-Origin: {host}`, methods `GET, POST, OPTIONS`). It replies
`{ "ok": true }` on success, then the page shows its own success state.

In both cases the CLI **rejects** the response if `state` does not match what it
sent, or if `token` is missing.

## 3. The CLI token

There is no user database in the web app today (the operator is a single
email + bcrypt hash in env vars), so the lowest-friction option is a dedicated,
self-contained **`jose` JWT** distinct from the browser session cookie:

- Sign with a **new secret** `CLI_TOKEN_SECRET` (do not reuse `SESSION_SECRET`).
- Claims: `{ sub: <operator email>, scope: "cli", name: <label>, iat, exp }`.
- Suggested lifetime: long (e.g. 90 days or 1 year) — this is a CLI credential.
- Revocation: rotating `CLI_TOKEN_SECRET` invalidates all CLI tokens. If
  per-token revocation is needed later, introduce a small persisted token store.

## 4. Accepting the token on API routes

The CLI sends the token as a bearer header:

```
Authorization: Bearer <cli token>
```

The web app must accept this on the routes the CLI uses. Extend
`requireApiSession` (in `app/lib/auth.ts`) so that, in addition to the
`ps_session` cookie, it also accepts a valid `Authorization: Bearer` CLI token
(verified with `CLI_TOKEN_SECRET`, `scope === "cli"`).

## 5. `whoami` endpoint (token verification)

Add a lightweight endpoint the CLI calls right after login to verify the token
and fetch the operator identity:

```
GET {host}/api/cli/whoami
Authorization: Bearer <cli token>

200 OK  { "email": "operator@example.com" }
401     when the token is missing/invalid
```

Until this endpoint exists, the CLI stores the token but marks it "unverified"
(a 404 is treated as "server side not deployed yet", a 401/403 as a hard
rejection).
