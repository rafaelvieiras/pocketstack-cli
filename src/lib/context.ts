import type { Command } from "commander";
import { DEFAULT_HOST } from "../version.js";
import { normalizeHost } from "./config.js";

/** Global flags shared by every command (defined on the root program). */
export interface GlobalFlags {
  /** Emit machine-readable JSON to stdout instead of human output. */
  json: boolean;
  /** Whether ANSI colors are allowed. */
  color: boolean;
  /** Whether interactive prompting is allowed (`--no-input` turns it off). */
  input: boolean;
  /** Assume "yes" for confirmation prompts. */
  yes: boolean;
  /** Suppress non-essential output. */
  quiet: boolean;
  /** Target PocketStack host (normalized, no trailing slash). */
  host: string;
}

/** Merge the root program's global options into a typed {@link GlobalFlags}. */
export function resolveGlobals(command: Command): GlobalFlags {
  const opts = command.optsWithGlobals();
  const host = (opts.host as string | undefined) ?? process.env.POCKETSTACK_HOST ?? DEFAULT_HOST;
  return {
    json: opts.json === true,
    // commander negates `--no-color`/`--no-input` to `color`/`input` = false.
    color: opts.color !== false,
    input: opts.input !== false,
    yes: opts.yes === true,
    quiet: opts.quiet === true,
    host: normalizeHost(host),
  };
}

/**
 * Whether the CLI may prompt the user interactively. False under `--json`,
 * `--no-input`, in CI, or when stdin/stdout are not TTYs. Every command must
 * have a non-interactive path (flags) so the TUI is purely additive.
 */
export function isInteractive(flags: GlobalFlags): boolean {
  return (
    flags.input &&
    !flags.json &&
    !process.env.CI &&
    Boolean(process.stdout.isTTY) &&
    Boolean(process.stdin.isTTY)
  );
}
