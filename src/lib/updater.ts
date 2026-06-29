import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CONFIG_DIR } from "./config.js";
import { CliError } from "./errors.js";
import { colors, warn } from "./output.js";
import { IS_BINARY, NPM_PACKAGE, REPO, VERSION } from "../version.js";
import type { GlobalFlags } from "./context.js";

const CACHE_PATH = join(CONFIG_DIR, "update-check.json");
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

interface UpdateCache {
  checkedAt: number;
  latest: string | null;
}

/** Returns 1 if a > b, -1 if a < b, 0 if equal (major.minor.patch only). */
export function compareSemver(a: string, b: string): number {
  const pa = a.replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

/** Fetch the latest published version from the npm registry (null on failure). */
export async function getLatestVersion(signal?: AbortSignal): Promise<string | null> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${NPM_PACKAGE}/latest`, {
      headers: { Accept: "application/json" },
      signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { version?: string };
    return data.version ?? null;
  } catch {
    return null;
  }
}

async function readCache(): Promise<UpdateCache | null> {
  try {
    return JSON.parse(await readFile(CACHE_PATH, "utf8")) as UpdateCache;
  } catch {
    return null;
  }
}

async function writeCache(cache: UpdateCache): Promise<void> {
  try {
    await mkdir(CONFIG_DIR, { recursive: true });
    await writeFile(CACHE_PATH, JSON.stringify(cache));
  } catch {
    /* cache is best-effort */
  }
}

/**
 * Print a subtle "update available" notice. No-ops under --json/--quiet, in CI,
 * on non-TTY stderr, or when POCKETSTACK_NO_UPDATE_CHECK is set. Cached for 24h
 * and capped at a 1.5s network wait so it never slows the CLI down.
 */
export async function maybeNotifyUpdate(flags: GlobalFlags): Promise<void> {
  if (flags.json || flags.quiet || process.env.CI || !process.stderr.isTTY) return;
  if (process.env.POCKETSTACK_NO_UPDATE_CHECK) return;
  try {
    let latest: string | null = null;
    const cache = await readCache();
    if (cache && Date.now() - cache.checkedAt < CHECK_INTERVAL_MS) {
      latest = cache.latest;
    } else {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 1500);
      latest = await getLatestVersion(controller.signal);
      clearTimeout(timer);
      await writeCache({ checkedAt: Date.now(), latest });
    }
    if (latest && compareSemver(latest, VERSION) > 0) {
      const c = colors();
      warn(`Update available ${c.dim(VERSION)} → ${c.green(latest)}. Run ${c.cyan("pocketstack upgrade")}.`);
    }
  } catch {
    /* never block on update checks */
  }
}

/** Upgrade the CLI in place, choosing the strategy based on how it was installed. */
export async function performUpgrade(latest: string): Promise<void> {
  if (IS_BINARY) {
    if (process.platform === "win32") {
      throw new CliError(
        `Automatic upgrade isn't supported for the Windows binary yet. ` +
          `Download the latest release from https://github.com/${REPO}/releases/latest`,
      );
    }
    const command = `curl -fsSL https://raw.githubusercontent.com/${REPO}/main/scripts/install.sh | sh`;
    const result = spawnSync("sh", ["-c", command], {
      stdio: "inherit",
      env: { ...process.env, POCKETSTACK_VERSION: latest },
    });
    if (result.status !== 0) throw new CliError("Upgrade failed.");
  } else {
    const result = spawnSync("npm", ["install", "-g", `${NPM_PACKAGE}@${latest}`], {
      stdio: "inherit",
    });
    if (result.status !== 0) {
      throw new CliError("Upgrade failed. You may need to re-run it with elevated permissions.");
    }
  }
}
