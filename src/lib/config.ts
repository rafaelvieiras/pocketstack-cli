import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import envPaths from "env-paths";

const paths = envPaths("pocketstack", { suffix: "" });

/** Directory where the CLI stores credentials and caches (XDG-aware). */
export const CONFIG_DIR = paths.config;

/** Path to the credentials file (mode 0600). */
export const CREDENTIALS_PATH = join(CONFIG_DIR, "credentials.json");

/** A single authenticated account, keyed by host. */
export interface Account {
  host: string;
  accessToken: string;
  email?: string;
  tokenName?: string;
  savedAt: string;
}

interface CredentialsFile {
  version: 1;
  default?: string;
  accounts: Record<string, Account>;
}

/** Strip trailing slashes so hosts compare and key consistently. */
export function normalizeHost(host: string): string {
  return host.trim().replace(/\/+$/, "");
}

async function readFileSafe(): Promise<CredentialsFile> {
  try {
    const raw = await readFile(CREDENTIALS_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<CredentialsFile>;
    return { version: 1, default: parsed.default, accounts: parsed.accounts ?? {} };
  } catch {
    return { version: 1, accounts: {} };
  }
}

async function writeFileSafe(data: CredentialsFile): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
  await writeFile(CREDENTIALS_PATH, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  // writeFile only applies the mode on creation; enforce it on every write.
  await chmod(CREDENTIALS_PATH, 0o600).catch(() => {});
}

/** Save (or replace) an account and make it the default. */
export async function saveAccount(account: Account): Promise<void> {
  const data = await readFileSafe();
  const host = normalizeHost(account.host);
  data.accounts[host] = { ...account, host };
  data.default = host;
  await writeFileSafe(data);
}

/** Get the account for a host, or the default account when host is omitted. */
export async function getAccount(host?: string): Promise<Account | undefined> {
  const data = await readFileSafe();
  const key = host ? normalizeHost(host) : data.default;
  if (!key) return undefined;
  return data.accounts[key];
}

/** Remove a single account. Returns whether anything was removed. */
export async function removeAccount(host: string): Promise<boolean> {
  const data = await readFileSafe();
  const key = normalizeHost(host);
  if (!data.accounts[key]) return false;
  delete data.accounts[key];
  if (data.default === key) data.default = Object.keys(data.accounts)[0];
  await writeFileSafe(data);
  return true;
}

/** Delete the entire credentials file. */
export async function clearAll(): Promise<void> {
  if (existsSync(CREDENTIALS_PATH)) await rm(CREDENTIALS_PATH);
}

/** List every stored account. */
export async function listAccounts(): Promise<Account[]> {
  const data = await readFileSafe();
  return Object.values(data.accounts);
}
