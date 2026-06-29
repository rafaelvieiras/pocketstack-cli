import pkg from "../package.json" with { type: "json" };

/** Version baked in at build time (bundled by tsup / inlined by `bun --compile`). */
export const VERSION: string = pkg.version;

/** Command/binary name as installed on the user's PATH. */
export const BIN_NAME = "pocketstack";

/** npm package name (differs from the binary name; `pocketstack` was taken). */
export const NPM_PACKAGE = "pocketstack-cli";

/** GitHub repository, used by the self-updater and installer. */
export const REPO = "rafaelvieiras/pocketstack-cli";

/** Default PocketStack host the CLI talks to (Studio / control plane). */
export const DEFAULT_HOST = "https://app.pocketstack.host";

/**
 * Whether this is a standalone binary (built with `bun --compile`) rather than
 * the Node/npm distribution. Compiled binaries embed the Bun runtime, so
 * `process.versions.bun` is a reliable discriminator for choosing the upgrade
 * strategy.
 */
export const IS_BINARY: boolean = typeof process.versions.bun === "string";
