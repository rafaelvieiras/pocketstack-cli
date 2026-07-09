import { readdir } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import type { Command } from "commander";
import { checkBackup, createApp, importBackup, listApps } from "../lib/apps.js";
import type { App } from "../lib/apps.js";
import { getAccount } from "../lib/config.js";
import { isInteractive, resolveGlobals } from "../lib/context.js";
import type { GlobalFlags } from "../lib/context.js";
import { ApiError, CliError } from "../lib/errors.js";
import { colors, emitJson, info, warn } from "../lib/output.js";
import { sha256File } from "../lib/sha256.js";
import { brandIntro, promptConfirm, promptSelect, promptText, withSpinner } from "../lib/tui.js";
import { BIN_NAME } from "../version.js";

type Mode = "app-per-backup" | "interactive";

interface ImportOptions {
  mode?: string;
  force?: boolean;
  nameFrom?: string;
}

/** A discovered backup file plus its hash and cross-app dedup pre-flight. */
interface BackupPlan {
  file: string;
  path: string;
  sha256: string;
  seenInApps: string[];
}

type ResultStatus = "imported" | "skipped" | "refused" | "error";

interface ResultRow {
  file: string;
  id: string | null;
  created: boolean;
  status: ResultStatus;
  detail?: string;
}

/** Shared per-run context. */
interface Ctx {
  host: string;
  token: string;
  flags: GlobalFlags;
  interactive: boolean;
  force: boolean;
  /** When true, app names are taken from the file name (no prompt). */
  nameFromFilename: boolean;
}

/** A resolved import destination (existing app or a freshly created one). */
interface Dest {
  id: string;
  name: string;
  created: boolean;
}

const SOURCE_NEWER_MESSAGE =
  "the source PocketBase is newer than PocketStack — we upgrade the platform regularly, please try again soon";

export function registerImport(program: Command): void {
  program
    .command("import")
    .argument("<dir>", "directory containing PocketBase backup ZIPs")
    .description("Import one or more PocketBase backups, creating apps as needed")
    .option("--mode <mode>", "non-interactive mode: 'app-per-backup' or 'interactive'")
    .option("--force", "re-import even when the same file was already imported")
    .option("--name-from <source>", "derive app names automatically (only 'filename' is supported)")
    .action(async (dirArg: string, opts: ImportOptions, command: Command) => {
      const flags = resolveGlobals(command);
      const account = await getAccount(flags.host);
      if (!account) {
        throw new CliError(`Not logged in. Run \`${BIN_NAME} login\` first.`);
      }
      const host = account.host;
      const token = account.accessToken;
      const dir = resolve(dirArg);
      const interactive = isInteractive(flags);

      if (opts.mode && opts.mode !== "app-per-backup" && opts.mode !== "interactive") {
        throw new CliError(`Invalid --mode '${opts.mode}'. Use 'app-per-backup' or 'interactive'.`);
      }
      if (opts.nameFrom && opts.nameFrom !== "filename") {
        throw new CliError(`Invalid --name-from '${opts.nameFrom}'. Only 'filename' is supported.`);
      }

      const files = await listZipFiles(dir);
      if (files.length === 0) {
        throw new CliError(`No .zip backups found in ${dir}.`);
      }

      // Hash every backup and load apps + dedup pre-flight behind one spinner.
      const { plan, apps } = await withSpinner(flags, "Scanning backups…", async (spin) => {
        const appsList = await listApps(host, token);
        const planList: BackupPlan[] = [];
        for (const file of files) {
          spin?.message(`Hashing ${file}…`);
          const path = join(dir, file);
          const sha256 = await sha256File(path);
          const seenInApps = await safeCheckBackup(host, token, sha256);
          planList.push({ file, path, sha256, seenInApps });
        }
        return { plan: planList, apps: appsList };
      });

      // Resolve the operating mode (flag wins; otherwise ask, or default).
      let mode: Mode | undefined =
        opts.mode === "interactive" || opts.mode === "app-per-backup" ? opts.mode : undefined;
      if (!mode) {
        if (interactive) {
          brandIntro();
          const top = await promptSelect<"a" | "b" | "cancel">(
            `Found ${plan.length} backup(s) in ${dirArg}. What do you want to do?`,
            [
              { value: "a", label: "Create one app per backup" },
              { value: "b", label: "Decide for each backup" },
              { value: "cancel", label: "Cancel" },
            ],
          );
          if (top === "cancel") {
            info("Cancelled.");
            return;
          }
          mode = top === "a" ? "app-per-backup" : "interactive";
        } else {
          // Non-interactive default: one app per backup, names from file names.
          mode = "app-per-backup";
        }
      }

      if (mode === "interactive" && !interactive) {
        throw new CliError(
          "Interactive mode needs a TTY. For scripts, use --mode app-per-backup " +
            "(names are derived from file names).",
        );
      }

      const ctx: Ctx = {
        host,
        token,
        flags,
        interactive,
        force: opts.force === true,
        nameFromFilename: opts.nameFrom === "filename" || !interactive,
      };

      const rows =
        mode === "app-per-backup"
          ? await runAppPerBackup(ctx, plan, apps)
          : await runInteractive(ctx, plan, apps);

      if (flags.json) {
        emitJson({
          dir,
          plan: plan.map((p) => ({ file: p.file, sha256: p.sha256, seenInApps: p.seenInApps })),
          results: rows,
        });
      } else {
        printSummary(rows);
      }

      if (rows.some((r) => r.status === "error")) process.exitCode = 1;
    });
}

/** Mode (a): create a brand-new app for every backup. */
async function runAppPerBackup(ctx: Ctx, plan: BackupPlan[], apps: App[]): Promise<ResultRow[]> {
  const rows: ResultRow[] = [];
  const createdBySha = new Map<string, Dest>();
  for (const b of plan) {
    try {
      // Idempotent re-run: if this exact backup (by sha256) was already imported
      // into an app, reuse that app instead of creating a new one. App ids are
      // server-generated now, so a re-exported (byte-different) backup of the
      // same app can no longer be folded in by a deterministic id — only
      // byte-identical files dedupe. `createAppForBackup` additionally folds
      // duplicate copies of the same file within THIS run into one app.
      // executeImport then skips a same-destination backup (default) or
      // re-imports into the SAME app (--force) — never a duplicate app.
      let dest: Dest;
      const [seen] = b.seenInApps;
      if (seen !== undefined) {
        const existing = apps.find((a) => a.id === seen);
        dest = { id: seen, name: existing?.name ?? seen, created: false };
      } else {
        dest = await createAppForBackup(ctx, b, createdBySha);
      }
      rows.push(await executeImport(ctx, dest, b));
    } catch (err) {
      rows.push(errorRow(b, null, false, err));
    }
  }
  return rows;
}

/** Mode (b): decide per backup — associate with an existing app or create new. */
async function runInteractive(ctx: Ctx, plan: BackupPlan[], apps: App[]): Promise<ResultRow[]> {
  const associated = new Set<string>();
  const createdBySha = new Map<string, Dest>();
  const rows: ResultRow[] = [];
  let exhaustAsked = false;
  let createForRest = false;

  for (let i = 0; i < plan.length; i++) {
    const b = plan[i] as BackupPlan;
    const available = apps.filter((a) => !associated.has(a.id));
    let dest: Dest | null = null;

    try {
      if (available.length > 0 && !createForRest) {
        const action = await promptSelect<"associate" | "create">(
          `Backup ${b.file}: what do you want to do?`,
          [
            { value: "associate", label: "Associate with an existing app (REPLACES its data)" },
            { value: "create", label: "Create a new app" },
          ],
        );
        if (action === "associate") {
          const appId = await promptSelect<string>(
            `Which app should ${b.file} replace?`,
            available.map((a) => ({ value: a.id, label: `${a.name} (${a.id})` })),
          );
          const target = available.find((a) => a.id === appId) as App;
          const ok = await promptConfirm(
            `This will REPLACE all data in ${target.name} (${appId}). Continue?`,
          );
          if (!ok) {
            rows.push({
              file: b.file,
              id: appId,
              created: false,
              status: "skipped",
              detail: "declined destructive import",
            });
            continue;
          }
          associated.add(appId);
          dest = { id: appId, name: target.name, created: false };
        } else {
          dest = await createAppForBackup(ctx, b, createdBySha);
        }
      } else {
        if (available.length === 0 && !createForRest && !exhaustAsked) {
          exhaustAsked = true;
          const remaining = plan.length - i;
          const choice = await promptSelect<"rest" | "case">(
            `All existing apps are taken. For the remaining ${remaining} backup(s):`,
            [
              { value: "rest", label: "Create one app for each, only asking the name" },
              { value: "case", label: "Keep going one by one (create new only)" },
            ],
          );
          if (choice === "rest") createForRest = true;
        }
        dest = await createAppForBackup(ctx, b, createdBySha);
      }

      rows.push(await executeImport(ctx, dest, b));
    } catch (err) {
      rows.push(errorRow(b, dest?.id ?? null, dest?.created ?? false, err));
    }
  }
  return rows;
}

/**
 * Apply the dedup policy (skip / warn) for a destination, then upload the
 * backup. Per-backup failures (version 409, network) become a row, never an
 * abort of the queue.
 */
async function executeImport(ctx: Ctx, dest: Dest, b: BackupPlan): Promise<ResultRow> {
  const otherApps = b.seenInApps.filter((x) => x !== dest.id);
  const sameDest = b.seenInApps.includes(dest.id);

  if (sameDest && !ctx.force) {
    return row(b, dest, "skipped", "already imported into this app");
  }
  if (otherApps.length > 0 && !ctx.force) {
    const where = otherApps.join(", ");
    if (ctx.interactive) {
      warn(`This backup looks already imported into ${where}.`);
      const ok = await promptConfirm(`Import ${b.file} into ${dest.id} anyway?`);
      if (!ok) return row(b, dest, "skipped", "declined duplicate import");
    } else if (!ctx.flags.yes) {
      return row(b, dest, "skipped", `already imported into ${where} (use --force or --yes)`);
    }
  }

  try {
    const result = await importBackup(ctx.host, ctx.token, dest.id, b.path, {
      force: ctx.force,
      sourceName: b.file,
    });
    if (result.skipped) return row(b, dest, "skipped", "already imported (server dedup)");
    return row(b, dest, "imported");
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      return row(b, dest, "refused", SOURCE_NEWER_MESSAGE);
    }
    if (err instanceof CliError) {
      return row(b, dest, "error", err.message);
    }
    throw err;
  }
}

/**
 * Create an app by name and build the destination from the id the backend
 * generated. App ids are always server-assigned; the CLI never picks or derives
 * one from the name.
 */
async function makeApp(ctx: Ctx, name: string): Promise<Dest> {
  const created = await createApp(ctx.host, ctx.token, { name });
  info(`Created app ${colors().bold(created.id)}.`);
  return { id: created.id, name: created.name || name, created: true };
}

/**
 * Create a new app for a backup, or reuse the one we already created earlier in
 * THIS run for a byte-identical backup. Because ids are server-generated, the
 * cross-app sha256 pre-flight (taken at scan time) can't see apps created during
 * this run, so we track sha256 -> created destination here to avoid silently
 * minting duplicate apps for repeated copies of the same file. Recording the
 * reused id in `seenInApps` lets {@link executeImport} treat it as already
 * imported (skip by default, re-import into the same app with `--force`).
 */
async function createAppForBackup(
  ctx: Ctx,
  b: BackupPlan,
  createdBySha: Map<string, Dest>,
): Promise<Dest> {
  const prior = createdBySha.get(b.sha256);
  if (prior) {
    if (!b.seenInApps.includes(prior.id)) b.seenInApps.push(prior.id);
    return { ...prior, created: false };
  }
  const dest = await makeApp(ctx, await chooseName(ctx, b.file));
  createdBySha.set(b.sha256, dest);
  return dest;
}

/** Ask for an app name (interactive) or derive it from the file name. */
async function chooseName(ctx: Ctx, file: string): Promise<string> {
  const suggestion = nameFromFile(file);
  if (ctx.interactive && !ctx.nameFromFilename) {
    const value = (await promptText(`App name for ${file}`, suggestion)).trim();
    return value || suggestion;
  }
  return suggestion;
}

/**
 * Derive an app name from a backup file name.
 *
 * PocketBase backups are named `pb_backup_<name>_<YYYYMMDDHHMMSS>.zip`; strip the
 * `pb_backup_` prefix and the trailing timestamp so the app is named after the
 * original data (e.g. `pb_backup_my_app_20260101120000.zip` -> `my_app`). The
 * `<name>` may itself contain underscores. Files that don't match the convention
 * fall back to the bare file name (extension removed).
 */
export function nameFromFile(file: string): string {
  const base = basename(file, extname(file));
  const match = /^pb_backup_(.+)_\d{14}$/.exec(base);
  return match?.[1] ?? base;
}

async function listZipFiles(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    throw new CliError(`Cannot read directory ${dir}.`);
  }
  return entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".zip"))
    .map((e) => e.name)
    .sort();
}

async function safeCheckBackup(host: string, token: string, sha256: string): Promise<string[]> {
  try {
    const result = await checkBackup(host, token, sha256);
    return Array.isArray(result.seenInApps) ? result.seenInApps : [];
  } catch {
    // Pre-flight is only a hint; the server is the authority on dedup.
    return [];
  }
}

function row(b: BackupPlan, dest: Dest, status: ResultStatus, detail?: string): ResultRow {
  return { file: b.file, id: dest.id, created: dest.created, status, detail };
}

function errorRow(
  b: BackupPlan,
  id: string | null,
  created: boolean,
  err: unknown,
): ResultRow {
  return {
    file: b.file,
    id,
    created,
    status: "error",
    detail: err instanceof Error ? err.message : String(err),
  };
}

function printSummary(rows: ResultRow[]): void {
  const c = colors();
  process.stderr.write("\n");
  for (const r of rows) {
    const tag =
      r.status === "imported"
        ? c.green("imported")
        : r.status === "skipped"
          ? c.yellow("skipped")
          : r.status === "refused"
            ? c.yellow("refused")
            : c.red("error");
    const created = r.created ? c.dim(" (created)") : "";
    const detail = r.detail ? c.dim(` — ${r.detail}`) : "";
    process.stderr.write(`  ${r.file}  →  ${r.id ?? "-"}${created}  ${tag}${detail}\n`);
  }

  const created = rows.filter((r) => r.created).length;
  const imported = rows.filter((r) => r.status === "imported").length;
  const skipped = rows.filter((r) => r.status === "skipped").length;
  const refused = rows.filter((r) => r.status === "refused").length;
  const errored = rows.filter((r) => r.status === "error").length;
  process.stderr.write(
    `\n  ${c.bold("Summary")}: ${created} created, ${imported} imported, ` +
      `${skipped} skipped, ${refused} refused, ${errored} error(s).\n`,
  );
}
