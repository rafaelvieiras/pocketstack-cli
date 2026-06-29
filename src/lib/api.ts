import { ApiError, CliError } from "./errors.js";
import { VERSION } from "../version.js";

export interface ApiOptions {
  token?: string;
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
}

/**
 * Minimal JSON fetch helper against a PocketStack host. Adds the bearer token,
 * normalizes errors into {@link ApiError} (with status) or {@link CliError}
 * (network failures).
 */
export async function apiFetch<T>(host: string, path: string, opts: ApiOptions = {}): Promise<T> {
  const url = `${host}${path}`;
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": `pocketstack-cli/${VERSION}`,
  };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
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
    const message =
      (data && typeof data === "object" && "message" in data && typeof data.message === "string"
        ? data.message
        : undefined) ?? `Request failed with status ${res.status}`;
    throw new ApiError(message, res.status);
  }

  return data as T;
}
