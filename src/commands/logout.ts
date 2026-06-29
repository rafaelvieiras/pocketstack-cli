import type { Command } from "commander";
import { clearAll, getAccount, removeAccount } from "../lib/config.js";
import { isInteractive, resolveGlobals } from "../lib/context.js";
import { colors, emitJson, info, success } from "../lib/output.js";
import { promptConfirm } from "../lib/tui.js";

export function registerLogout(program: Command): void {
  program
    .command("logout")
    .description("Remove stored credentials")
    .option("--all", "remove credentials for all hosts")
    .action(async (opts: { all?: boolean }, command: Command) => {
      const flags = resolveGlobals(command);

      if (opts.all) {
        if (
          isInteractive(flags) &&
          !flags.yes &&
          !(await promptConfirm("Remove credentials for all hosts?"))
        ) {
          return;
        }
        await clearAll();
        if (flags.json) emitJson({ ok: true, removed: "all" });
        else success("Removed all stored credentials.");
        return;
      }

      const host = flags.host;
      const account = await getAccount(host);
      if (!account) {
        if (flags.json) emitJson({ ok: true, host, removed: false });
        else info(`Not logged in to ${host}.`);
        return;
      }

      if (
        isInteractive(flags) &&
        !flags.yes &&
        !(await promptConfirm(`Log out of ${host}?`))
      ) {
        return;
      }
      await removeAccount(host);
      if (flags.json) emitJson({ ok: true, host, removed: true });
      else success(`Logged out of ${colors().bold(host)}.`);
    });
}
