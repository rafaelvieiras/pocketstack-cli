import { Command } from "commander";
import { BIN_NAME, VERSION } from "./version.js";
import { resolveGlobals } from "./lib/context.js";
import { CliError } from "./lib/errors.js";
import { configureColor, fail } from "./lib/output.js";
import { maybeNotifyUpdate } from "./lib/updater.js";
import { registerLogin } from "./commands/login.js";
import { registerLogout } from "./commands/logout.js";
import { registerWhoami } from "./commands/whoami.js";
import { registerUpgrade } from "./commands/upgrade.js";

async function main(): Promise<void> {
  const program = new Command();

  program
    .name(BIN_NAME)
    .description("Manage your PocketStack fleet from the terminal.")
    .version(VERSION, "-v, --version", "output the version number")
    .option("--json", "output machine-readable JSON")
    .option("--no-color", "disable colored output")
    .option("--no-input", "never prompt; fail instead of asking (good for CI)")
    .option("-y, --yes", "assume yes for confirmation prompts")
    .option("-q, --quiet", "suppress non-essential output")
    .option("--host <url>", "PocketStack host to target")
    .configureHelp({ showGlobalOptions: true })
    .showHelpAfterError();

  // Honor --no-color before any command output.
  program.hook("preAction", (_thisCommand, actionCommand) => {
    configureColor(resolveGlobals(actionCommand).color);
  });

  // Subtle, non-blocking "update available" notice after most commands.
  program.hook("postAction", async (_thisCommand, actionCommand) => {
    if (actionCommand.name() === "upgrade") return;
    await maybeNotifyUpdate(resolveGlobals(actionCommand));
  });

  registerLogin(program);
  registerLogout(program);
  registerWhoami(program);
  registerUpgrade(program);

  if (process.argv.length <= 2) {
    program.help();
  }

  await program.parseAsync(process.argv);
}

main().catch((err: unknown) => {
  if (err instanceof CliError) {
    fail(err.message);
    process.exit(err.exitCode);
  }
  fail(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
