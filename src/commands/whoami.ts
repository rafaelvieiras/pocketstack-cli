import type { Command } from "commander";
import { verifyToken } from "../lib/auth.js";
import { getAccount } from "../lib/config.js";
import { resolveGlobals } from "../lib/context.js";
import { colors, emitJson, fail, info } from "../lib/output.js";

export function registerWhoami(program: Command): void {
  program
    .command("whoami")
    .description("Show the authenticated account")
    .option("--verify", "verify the token against the server")
    .action(async (opts: { verify?: boolean }, command: Command) => {
      const flags = resolveGlobals(command);
      const account = await getAccount(flags.host);

      if (!account) {
        if (flags.json) emitJson({ loggedIn: false });
        else fail(`Not logged in. Run ${colors().cyan("pocketstack login")}.`);
        process.exitCode = 1;
        return;
      }

      let email = account.email;
      let verified: boolean | undefined;
      if (opts.verify) {
        const result = await verifyToken(account.host, account.accessToken);
        verified = result.verified;
        email = result.email ?? email;
      }

      if (flags.json) {
        emitJson({
          loggedIn: true,
          host: account.host,
          email: email ?? null,
          tokenName: account.tokenName ?? null,
          savedAt: account.savedAt,
          verified: verified ?? null,
        });
        return;
      }

      const c = colors();
      info(`Host:  ${c.bold(account.host)}`);
      info(`User:  ${email ? c.bold(email) : c.dim("(unknown)")}`);
      if (verified !== undefined) {
        info(`Token: ${verified ? c.green("verified") : c.yellow("unverified")}`);
      }
    });
}
