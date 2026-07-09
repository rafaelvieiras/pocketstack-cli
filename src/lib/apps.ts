import { openAsBlob } from "node:fs";
import { basename } from "node:path";
import { apiFetch } from "./api.js";
import { ApiError, CliError } from "./errors.js";
import { VERSION } from "../version.js";

/** An app as returned by `GET /api/cli/apps` (the backend `Status` shape). */
export interface App {
  id: string;
  name: string;
  alive?: boolean;
  refs?: number;
  lastUsed?: string;
}

/** Response of `POST /api/cli/apps` (201 when newly created, 200 when it existed). */
export interface CreateAppResult {
  id: string;
  name: string;
  adminEmail?: string;
  adminPassword?: string;
  url?: string;
}

/** Response of a backup import (mirrors the backend `Result`, plus dedup fields). */
export interface ImportResult {
  skipped: boolean;
  sha256: string;
  [key: string]: unknown;
}

/** Response of `GET /api/cli/backups/{sha256}` (cross-app dedup lookup). */
export interface BackupCheck {
  seenInApps: string[];
}

/** Options for {@link importBackup}. */
export interface ImportOptions {
  /** Re-import even if the same file was already imported into this app. */
  force?: boolean;
  /** Original file name, stored alongside the import record. */
  sourceName?: string;
}

/** List the apps the authenticated operator owns. */
export function listApps(host: string, token: string): Promise<App[]> {
  return apiFetch<App[]>(host, "/api/cli/apps", { token });
}

/**
 * Create an app by name. The backend always assigns the id (it is never
 * client-chosen). Returns credentials only when the app is newly created.
 */
export function createApp(
  host: string,
  token: string,
  input: { name: string },
): Promise<CreateAppResult> {
  return apiFetch<CreateAppResult>(host, "/api/cli/apps", {
    token,
    method: "POST",
    body: input,
  });
}

/** Pre-flight dedup check: which apps already imported this exact file (by sha256). */
export function checkBackup(host: string, token: string, sha256: string): Promise<BackupCheck> {
  return apiFetch<BackupCheck>(host, `/api/cli/backups/${sha256}`, { token });
}

/**
 * Upload a PocketBase backup ZIP to an app as `multipart/form-data` (part
 * `backup`). The file is streamed from disk via `fs.openAsBlob` so large backups
 * are never fully buffered. `force`/`sourceName` are passed as query parameters.
 */
export async function importBackup(
  host: string,
  token: string,
  id: string,
  filePath: string,
  opts: ImportOptions = {},
): Promise<ImportResult> {
  const params = new URLSearchParams();
  if (opts.force) params.set("force", "1");
  if (opts.sourceName) params.set("sourceName", opts.sourceName);
  const query = params.toString();
  const url = `${host}/api/cli/apps/${encodeURIComponent(id)}/import${query ? `?${query}` : ""}`;

  const blob = await openAsBlob(filePath);
  const form = new FormData();
  form.append("backup", blob, basename(filePath));

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "User-Agent": `pocketstack-cli/${VERSION}`,
        Authorization: `Bearer ${token}`,
      },
      body: form,
    });
  } catch (err) {
    throw new CliError(`Cannot reach ${host}: ${(err as Error).message}`);
  }

  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = text;
  }

  if (!res.ok) {
    throw new ApiError(extractMessage(data) ?? `Import failed with status ${res.status}`, res.status);
  }

  return data as ImportResult;
}

function extractMessage(data: unknown): string | undefined {
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if (typeof obj.message === "string") return obj.message;
    if (typeof obj.error === "string") return obj.error;
  }
  return undefined;
}
