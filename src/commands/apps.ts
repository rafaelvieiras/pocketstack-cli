import type { Command } from "commander";
import { listApps } from "../lib/apps.js";
import type { App } from "../lib/apps.js";
import { getAccount } from "../lib/config.js";
import { resolveGlobals } from "../lib/context.js";
import type { GlobalFlags } from "../lib/context.js";
import { CliError } from "../lib/errors.js";
import { colors, emitJson, info } from "../lib/output.js";
import { withSpinner } from "../lib/tui.js";
import { BIN_NAME } from "../version.js";

/**
 * The Go zero value for `time.Time`, serialized as RFC3339. The backend sends
 * this for an app that has never been used; we render it as "never".
 */
const ZERO_TIME = "0001-01-01T00:00:00Z";

/** Human-facing status for an app: alive → "running", otherwise "idle". */
export function appStatus(app: App): "running" | "idle" {
  return app.alive === true ? "running" : "idle";
}

/**
 * Format an RFC3339 `lastUsed` timestamp as a short, relative label. The Go zero
 * value (and any missing/unparseable value) becomes "never". `now` is injectable
 * so the formatting is deterministic in tests.
 */
export function formatLastUsed(value: string | undefined, now: Date = new Date()): string {
  if (!value || value === ZERO_TIME) return "never";
  const then = Date.parse(value);
  if (Number.isNaN(then)) return "never";

  const diffMs = now.getTime() - then;
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  // Older than a month: fall back to the calendar date (UTC, YYYY-MM-DD).
  return new Date(then).toISOString().slice(0, 10);
}

/** Sort a copy of the app list by name (case-insensitive, locale-aware). */
export function sortApps(apps: App[]): App[] {
  return [...apps].sort((a, b) => a.name.localeCompare(b.name));
}

export function registerApps(program: Command): void {
  const apps = program.command("apps").description("Manage your PocketStack apps");

  apps
    .command("list")
    .description("List the apps you own")
    .action(async (_options: Record<string, unknown>, command: Command) => {
      const flags = resolveGlobals(command);
      const account = await getAccount(flags.host);
      if (!account) {
        throw new CliError(`Not logged in. Run \`${BIN_NAME} login\` first.`);
      }

      const list = await withSpinner(flags, "Loading apps…", () =>
        listApps(account.host, account.accessToken),
      );

      if (flags.json) {
        // Machine output: the raw array, unsorted, on stdout.
        emitJson(list);
        return;
      }

      if (list.length === 0) {
        if (!flags.quiet) {
          info(`No apps yet. Run \`${BIN_NAME} import <dir>\` to migrate PocketBase backups.`);
        }
        return;
      }

      printAppsTable(sortApps(list), flags);
    });
}

/** Render the apps as an aligned, colored table to stdout (the primary output). */
function printAppsTable(apps: App[], flags: GlobalFlags): void {
  const c = colors();
  const now = new Date();

  const rows = apps.map((app) => ({
    id: app.id,
    name: app.name,
    status: appStatus(app),
    refs: String(app.refs ?? 0),
    lastUsed: formatLastUsed(app.lastUsed, now),
  }));

  const headers = { id: "ID", name: "NAME", status: "STATUS", refs: "REFS", lastUsed: "LAST USED" };
  const width = (key: keyof typeof headers): number =>
    Math.max(headers[key].length, ...rows.map((r) => r[key].length));
  const widths = {
    id: width("id"),
    name: width("name"),
    status: width("status"),
    refs: width("refs"),
    lastUsed: width("lastUsed"),
  };

  const out = (line: string): void => {
    process.stdout.write(`${line}\n`);
  };

  if (!flags.quiet) {
    out(
      c.dim(
        [
          headers.id.padEnd(widths.id),
          headers.name.padEnd(widths.name),
          headers.status.padEnd(widths.status),
          headers.refs.padStart(widths.refs),
          headers.lastUsed.padEnd(widths.lastUsed),
        ].join("  "),
      ),
    );
  }

  for (const r of rows) {
    const statusCell = r.status.padEnd(widths.status);
    out(
      [
        c.bold(r.id.padEnd(widths.id)),
        r.name.padEnd(widths.name),
        r.status === "running" ? c.green(statusCell) : c.dim(statusCell),
        r.refs.padStart(widths.refs),
        c.dim(r.lastUsed.padEnd(widths.lastUsed)),
      ].join("  "),
    );
  }
}
