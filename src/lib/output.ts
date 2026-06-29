import pc from "picocolors";

type Palette = ReturnType<typeof pc.createColors>;

let palette: Palette = pc.createColors(pc.isColorSupported);

/** Enable or disable ANSI colors for all subsequent output. */
export function configureColor(enabled: boolean): void {
  palette = pc.createColors(enabled && pc.isColorSupported);
}

/** The active color palette. Call this each time so `--no-color` is honored. */
export function colors(): Palette {
  return palette;
}

// Human-facing status lines go to stderr so that `--json` (and any piped data)
// keeps stdout clean and machine-readable.

export function info(message: string): void {
  process.stderr.write(`${palette.cyan("›")} ${message}\n`);
}

export function success(message: string): void {
  process.stderr.write(`${palette.green("✓")} ${message}\n`);
}

export function warn(message: string): void {
  process.stderr.write(`${palette.yellow("▲")} ${message}\n`);
}

export function fail(message: string): void {
  process.stderr.write(`${palette.red("✗")} ${message}\n`);
}

/** Emit a JSON payload to stdout (the machine-readable channel). */
export function emitJson(data: unknown): void {
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}
