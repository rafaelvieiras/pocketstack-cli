#!/usr/bin/env node
// Cross-compile standalone binaries for every supported platform with
// `bun --compile`, then write a SHA256SUMS manifest. Run with: npm run compile
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const TARGETS = [
  ["bun-linux-x64", "pocketstack-linux-x64"],
  ["bun-linux-arm64", "pocketstack-linux-arm64"],
  ["bun-darwin-x64", "pocketstack-darwin-x64"],
  ["bun-darwin-arm64", "pocketstack-darwin-arm64"],
  ["bun-windows-x64", "pocketstack-windows-x64.exe"],
];

const OUT_DIR = "bin";
mkdirSync(OUT_DIR, { recursive: true });

for (const [target, name] of TARGETS) {
  const outfile = join(OUT_DIR, name);
  console.log(`› Building ${name} (${target})…`);
  execFileSync(
    "bun",
    ["build", "src/index.ts", "--compile", `--target=${target}`, `--outfile=${outfile}`],
    { stdio: "inherit" },
  );
}

const sums = [];
for (const file of readdirSync(OUT_DIR).sort()) {
  if (file === "SHA256SUMS") continue;
  const hash = createHash("sha256").update(readFileSync(join(OUT_DIR, file))).digest("hex");
  sums.push(`${hash}  ${file}`);
}
writeFileSync(join(OUT_DIR, "SHA256SUMS"), `${sums.join("\n")}\n`);
console.log(`✓ Built ${TARGETS.length} binaries and wrote ${OUT_DIR}/SHA256SUMS`);
