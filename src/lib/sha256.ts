import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

/**
 * Compute the SHA-256 of a file by streaming it through `crypto`, so large
 * backups (up to ~2 GiB) are never fully buffered in memory. Returns the digest
 * as lowercase hex (64 chars).
 */
export function sha256File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}
