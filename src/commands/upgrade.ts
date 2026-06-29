import type { Command } from "commander";
import { resolveGlobals } from "../lib/context.js";
import { CliError } from "../lib/errors.js";
import { emitJson, info, success } from "../lib/output.js";
import { compareSemver, getLatestVersion, performUpgrade } from "../lib/updater.js";
import { VERSION } from "../version.js";

export function registerUpgrade(program: Command): void {
  program
    .command("upgrade")
    .alias("update")
    .description("Update the CLI to the latest version")
    .option("--check", "only check for a newer version, don't install")
    .action(async (opts: { check?: boolean }, command: Command) => {
      const flags = resolveGlobals(command);
      const latest = await getLatestVersion();
      if (!latest) throw new CliError("Could not determine the latest version.");

      const newer = compareSemver(latest, VERSION) > 0;
      if (!newer) {
        if (flags.json) emitJson({ upToDate: true, current: VERSION, latest });
        else success(`Already on the latest version (${VERSION}).`);
        return;
      }

      if (opts.check) {
        if (flags.json) emitJson({ upToDate: false, current: VERSION, latest });
        else info(`Update available: ${VERSION} → ${latest}. Run \`pocketstack upgrade\`.`);
        return;
      }

      info(`Upgrading ${VERSION} → ${latest}…`);
      await performUpgrade(latest);
      success(`Upgraded to ${latest}.`);
    });
}
