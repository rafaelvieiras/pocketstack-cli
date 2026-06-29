import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  outDir: "dist",
  clean: true,
  minify: false,
  sourcemap: false,
  // The npm-published entry is run directly by Node, so it needs a shebang.
  // The source has none (so `tsx` / `bun --compile` stay clean).
  banner: { js: "#!/usr/bin/env node" },
});
