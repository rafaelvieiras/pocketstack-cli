# AGENTS.md — working guide for `pocketstack-cli`

This is the official command-line interface for [PocketStack](https://pocketstack.host).
Read this file before contributing — whether you're a human or an AI agent.

## Ground rules (non-negotiable)

1. **English only.** This is a public repository. All code, comments, identifiers,
   commit messages, PR descriptions, docs, TUI strings, and error messages must be
   in English.
2. **Never credit AI as a co-author.** Do **not** add `Co-Authored-By: Claude`
   (or any AI assistant) to commits or PRs — now or ever. Do not add
   "Generated with" / "Co-authored-by" AI trailers anywhere. Commits are authored
   by the human contributor only.
3. **Don't push or open PRs without the maintainer's go-ahead.** Make local commits;
   let the maintainer push.
4. **Every TUI action must have a flag equivalent.** Anything you can do through an
   interactive prompt must also be doable non-interactively via flags (see
   "Interactive vs. scriptable" below). This is a hard design constraint.

## What this is

A Node.js CLI (TypeScript, ESM) with a Vercel/Next-style TUI. It ships two ways:

- **npm:** `npm install -g pocketstack-cli` (bin name: `pocketstack`). Runs on Node ≥ 20.
- **Standalone binary:** built with `bun --compile`, installed via `scripts/install.sh`.

The binary embeds the Bun runtime; the npm package runs on the user's Node. The
source stays runtime-neutral so both work.

## Stack

- **Language:** TypeScript 6, ESM, `NodeNext` module resolution (local imports use
  `.js` extensions).
- **Args:** [`commander`](https://github.com/tj/commander.js).
- **TUI:** [`@clack/prompts`](https://github.com/bombshell-dev/clack) + `picocolors`.
- **Browser login:** loopback callback server (`node:http`) + `open`.
- **Config:** `env-paths` → `~/.config/pocketstack/` (XDG-aware), credentials at mode `0600`.
- **npm build:** `tsup` → `dist/`. **Binaries:** `bun --compile`.

## Project layout

```
src/
  index.ts            # entry: builds the commander program, global flags, error handling
  version.ts          # version + constants, IS_BINARY detection
  commands/           # one file per command, each exports register<Name>(program)
    login.ts logout.ts whoami.ts upgrade.ts import.ts
  lib/
    auth.ts           # browser login flow + token verification
    api.ts            # JSON fetch helper (bearer, error normalization)
    apps.ts           # typed /api/cli client (list/create app, import, dedup lookup)
    config.ts         # credentials store (read/write, 0600)
    context.ts        # GlobalFlags, resolveGlobals(), isInteractive()
    output.ts         # colored status lines (stderr) + JSON (stdout)
    sha256.ts         # streamed file hashing (backup dedup key)
    slug.ts           # app-id derivation from a name (regex-safe, collision suffix)
    tui.ts            # clack wrappers (intro, spinner, confirm, select…)
    updater.ts        # version check + self-upgrade
    errors.ts         # CliError / ApiError
    util.ts
scripts/
  install.sh          # curl | sh installer (downloads the right binary)
  build-binaries.mjs  # bun --compile for all targets + SHA256SUMS
docs/AUTH_CONTRACT.md # the login handshake the web app must implement
test/                 # node:test (run via tsx)
```

## Development

```bash
npm install
npm run dev -- login --help   # run from source with tsx
npm run typecheck
npm run lint
npm test
npm run build                 # -> dist/ (npm artifact)
npm run compile               # -> bin/  (standalone binaries; needs bun)
```

Target a local/staging Studio with `--host` or `POCKETSTACK_HOST`:

```bash
npm run dev -- login --host http://app.pocketstack.localhost
```

## Interactive vs. scriptable (the redundancy rule)

`isInteractive(flags)` (in `lib/context.ts`) is true only with a TTY, no `--json`,
no `--no-input`, and not in CI. Commands must:

- **Interactive:** prompt with `@clack/prompts` for anything missing.
- **Non-interactive:** read everything from flags; if a required value is missing,
  fail with a clear message — never hang waiting for input.
- Honor `--json` (machine output on stdout), `--quiet`, `--no-color`, `-y/--yes`.

Human status goes to **stderr**; structured data goes to **stdout**.

## Adding a command

1. Create `src/commands/<name>.ts` exporting `register<Name>(program: Command)`.
2. Define flags for every input; prompt interactively only as a convenience.
3. Read globals via `resolveGlobals(command)`; gate prompts on `isInteractive`.
4. Support `--json`. Throw `CliError(message, exitCode?)` for expected failures.
5. Register it in `src/index.ts`.

## Releasing

Releases are fully automated with [semantic-release](https://semantic-release.gitbook.io/).
You do not bump the version, create the tag, or edit the changelog by hand.

1. Merge Conventional-Commit PRs into `main`.
2. On every push to `main`, `.github/workflows/release.yml` runs `semantic-release`,
   which computes the next version from the commit types, updates `CHANGELOG.md`,
   publishes to npm, creates the GitHub Release (with the standalone binaries +
   `SHA256SUMS` + `install.sh` attached), tags `vX.Y.Z`, and commits the changelog
   and version bump back to `main` as `chore(release): X.Y.Z [skip ci]`.
3. Version bumps follow the commit types: `fix:`/`perf:` → patch, `feat:` → minor,
   `feat!:` or a `BREAKING CHANGE:` footer → major. Commits of type `docs`, `chore`,
   `ci`, `test`, `style`, `refactor` do not trigger a release on their own.

npm publishing uses **OIDC Trusted Publishing** (no `NPM_TOKEN`): the `release`
job has `id-token: write`, forces npm ≥ 11.5.1, and npm generates provenance
automatically. `@semantic-release/npm` runs `npm publish` in that trusted context.
Trusted publishing is configured once on npmjs.com (package → Settings → Trusted
publishing): organization `rafaelvieiras`, repository `pocketstack-cli`, workflow
`release.yml`.

To preview a release without publishing, trigger the workflow manually
(Actions → Release → Run workflow) with **dry run** enabled.

The self-updater (`pocketstack upgrade`) checks the npm registry for the latest
version and upgrades in place: binaries re-run `install.sh`; npm installs re-run
`npm install -g`.

## Commit & PR style

- **Conventional Commits are required.** Every commit subject must follow
  `type(scope): subject` (e.g. `fix(import): strip the backup timestamp`).
  Allowed types: `feat`, `fix`, `perf`, `docs`, `style`, `refactor`, `test`,
  `build`, `ci`, `chore`, `revert`. A `commit-msg` hook (husky + commitlint)
  enforces this locally; the `Commitlint` CI job re-checks every commit in a PR.
- Commit subjects are English, imperative, and lower-case after the type.
- Releases are automated from these commits — see "Releasing". Use `feat:` for
  user-facing features, `fix:`/`perf:` for patches, and `feat!:` or a
  `BREAKING CHANGE:` footer for breaking changes.
- Keep PRs focused. CI (lint + typecheck + build + test + commitlint) must pass.
- Remember rule #2: **no AI co-author trailers, ever.**
