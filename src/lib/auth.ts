import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import open from "open";
import { apiFetch } from "./api.js";
import { ApiError, CliError } from "./errors.js";
import { BIN_NAME, VERSION } from "../version.js";

export interface BrowserLoginOptions {
  host: string;
  /** Open the system browser automatically (false = print the URL only). */
  openBrowser: boolean;
  /** Human label for the token, shown on the authorization page. */
  tokenName: string;
  /** Called once with the authorization URL (to print it for the user). */
  onUrl: (url: string) => void;
  /** Abort the wait after this many ms (default 5 minutes). */
  timeoutMs?: number;
}

export interface LoginResult {
  accessToken: string;
  email?: string;
}

/**
 * Drive a Supabase-style browser login:
 *   1. start a loopback HTTP server on 127.0.0.1:<random port> (RFC 8252);
 *   2. open `${host}/cli/authorize` with a redirect_uri back to that server
 *      plus an anti-CSRF `state`;
 *   3. the user approves in the browser; the page returns the token to the
 *      loopback callback (GET redirect with ?token&state, or a POST);
 *   4. validate `state`, resolve the token, and show a success page.
 *
 * The exact request/response contract is documented in docs/AUTH_CONTRACT.md.
 */
export async function browserLogin(opts: BrowserLoginOptions): Promise<LoginResult> {
  const state = randomBytes(24).toString("base64url");
  const timeoutMs = opts.timeoutMs ?? 5 * 60_000;

  return new Promise<LoginResult>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      finishReject(new CliError("Login timed out waiting for authorization."));
    }, timeoutMs);

    const server = createServer(handleRequest);

    function cleanup(): void {
      clearTimeout(timer);
      server.close();
    }
    function finishResolve(result: LoginResult): void {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    }
    function finishReject(err: Error): void {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    }

    server.on("error", (err) =>
      finishReject(new CliError(`Could not start local callback server: ${err.message}`)),
    );

    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      const redirectUri = `http://127.0.0.1:${port}/callback`;

      const url = new URL("/cli/authorize", opts.host);
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("state", state);
      url.searchParams.set("client", BIN_NAME);
      url.searchParams.set("version", VERSION);
      url.searchParams.set("name", opts.tokenName);
      const authorizeUrl = url.toString();

      opts.onUrl(authorizeUrl);
      if (opts.openBrowser) {
        open(authorizeUrl).catch(() => {
          /* If the browser can't be opened, the printed URL is the fallback. */
        });
      }
    });

    function handleRequest(req: IncomingMessage, res: ServerResponse): void {
      // Allow the authorizing origin to POST cross-origin to the loopback server.
      res.setHeader("Access-Control-Allow-Origin", opts.host);
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");

      const reqUrl = new URL(req.url ?? "/", "http://127.0.0.1");

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }
      if (reqUrl.pathname !== "/callback") {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found");
        return;
      }

      if (req.method === "GET") {
        accept(
          res,
          "html",
          reqUrl.searchParams.get("token"),
          reqUrl.searchParams.get("state"),
          reqUrl.searchParams.get("email"),
        );
        return;
      }

      if (req.method === "POST") {
        let body = "";
        req.on("data", (chunk) => {
          body += chunk;
          if (body.length > 1_000_000) req.destroy();
        });
        req.on("end", () => {
          const { token, gotState, email } = parseBody(body);
          accept(res, "json", token, gotState, email);
        });
        return;
      }

      res.writeHead(405, { "Content-Type": "text/plain" });
      res.end("Method not allowed");
    }

    function accept(
      res: ServerResponse,
      kind: "html" | "json",
      token: string | null,
      gotState: string | null,
      email: string | null,
    ): void {
      const valid = Boolean(token) && gotState === state;
      if (!valid) {
        if (kind === "json") {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "invalid_request" }));
        } else {
          res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
          res.end(resultPage(false));
        }
        finishReject(new CliError("Authorization failed: missing token or state mismatch."));
        return;
      }

      if (kind === "json") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } else {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(resultPage(true));
      }
      finishResolve({ accessToken: token as string, email: email ?? undefined });
    }
  });
}

function parseBody(body: string): {
  token: string | null;
  gotState: string | null;
  email: string | null;
} {
  try {
    const json = JSON.parse(body) as Record<string, unknown>;
    return {
      token: (json.token ?? json.access_token ?? null) as string | null,
      gotState: (json.state ?? null) as string | null,
      email: (json.email ?? null) as string | null,
    };
  } catch {
    const params = new URLSearchParams(body);
    return {
      token: params.get("token"),
      gotState: params.get("state"),
      email: params.get("email"),
    };
  }
}

/**
 * Best-effort token verification against the server's `/api/cli/whoami`.
 * - 401/403 -> the token is invalid (throws).
 * - 404 or network error -> endpoint not deployed yet; returns unverified so
 *   the CLI can still store the token (useful while the server side is WIP).
 */
export async function verifyToken(
  host: string,
  token: string,
): Promise<{ email?: string; verified: boolean }> {
  try {
    const data = await apiFetch<{ email?: string }>(host, "/api/cli/whoami", { token });
    return { email: data.email, verified: true };
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 401 || err.status === 403) {
        throw new CliError("The server rejected this token. Please log in again.");
      }
      return { verified: false };
    }
    // Network failure: don't block login on it.
    return { verified: false };
  }
}

function resultPage(ok: boolean): string {
  const title = ok ? "You're all set" : "Authorization failed";
  const message = ok
    ? "You have signed in to the PocketStack CLI. You can close this tab and return to your terminal."
    : "Something went wrong during authorization. Please return to your terminal and try again.";
  const accent = ok ? "#f5b301" : "#e5484d";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>PocketStack CLI — ${title}</title>
    <style>
      :root { color-scheme: light dark; }
      body {
        margin: 0; min-height: 100vh; display: grid; place-items: center;
        font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
        background: #14110f; color: #f4efe7;
      }
      .card {
        max-width: 28rem; padding: 2.5rem; text-align: center;
        background: #1d1916; border: 1px solid #2c2620; border-radius: 16px;
      }
      .badge {
        width: 3rem; height: 3rem; margin: 0 auto 1.25rem; border-radius: 999px;
        display: grid; place-items: center; font-size: 1.5rem; font-weight: 700;
        background: ${accent}1a; color: ${accent};
      }
      h1 { font-size: 1.35rem; margin: 0 0 0.5rem; }
      p { margin: 0; line-height: 1.6; color: #c8bfb2; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="badge">${ok ? "✓" : "!"}</div>
      <h1>${title}</h1>
      <p>${message}</p>
    </div>
  </body>
</html>`;
}
