import os from "node:os";
import type { Command } from "commander";
import { browserLogin, verifyToken, type LoginResult } from "../lib/auth.js";
import { saveAccount } from "../lib/config.js";
import { isInteractive, resolveGlobals } from "../lib/context.js";
import { CliError } from "../lib/errors.js";
import { colors, emitJson, success, warn } from "../lib/output.js";
import { brandIntro, withSpinner } from "../lib/tui.js";
import { readStdin } from "../lib/util.js";

export function registerLogin(program: Command): void {
  program
    .command("login")
    .description("Authenticate with PocketStack")
    .option(
      "--token <token>",
      "authenticate with a token instead of the browser (use '-' to read stdin)",
    )
    .option("--no-browser", "print the authorization URL instead of opening a browser")
    .option("--name <name>", "label for this CLI token")
    .action(async (opts: { token?: string; browser?: boolean; name?: string }, command: Command) => {
      const flags = resolveGlobals(command);
      const host = flags.host;

      let token = opts.token;
      if (token === "-") token = (await readStdin()).trim();

      let result: LoginResult;
      if (token) {
        result = { accessToken: token };
      } else {
        if (!isInteractive(flags)) {
          throw new CliError(
            "No token provided. Pass --token <token> (or '-' for stdin), " +
              "or run `pocketstack login` in an interactive terminal.",
          );
        }
        const tokenName = opts.name ?? defaultTokenName();
        brandIntro();
        result = await withSpinner(flags, "Waiting for authorization in your browser…", () =>
          browserLogin({
            host,
            openBrowser: opts.browser !== false,
            tokenName,
            onUrl: (url) => {
              const c = colors();
              const hint =
                opts.browser === false
                  ? "Open this URL to authorize:"
                  : "If your browser didn't open, visit:";
              process.stderr.write(`\n  ${c.dim(hint)}\n  ${c.cyan(url)}\n\n`);
            },
          }),
        );
      }

      const verification = await verifyToken(host, result.accessToken);
      const email = result.email ?? verification.email;

      await saveAccount({
        host,
        accessToken: result.accessToken,
        email,
        tokenName: opts.name,
        savedAt: new Date().toISOString(),
      });

      if (flags.json) {
        emitJson({ ok: true, host, email: email ?? null, verified: verification.verified });
        return;
      }
      const c = colors();
      success(`Logged in to ${c.bold(host)}${email ? ` as ${c.bold(email)}` : ""}.`);
      if (!verification.verified) {
        warn("Token stored, but it couldn't be verified against the server yet.");
      }
    });
}

function defaultTokenName(): string {
  try {
    return `${os.userInfo().username}@${os.hostname()}`;
  } catch {
    return "pocketstack-cli";
  }
}
