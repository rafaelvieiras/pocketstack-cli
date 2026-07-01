# PocketStack CLI

The official command-line interface for [PocketStack](https://pocketstack.host) —
manage your fleet from the terminal.

It pairs a clean, Vercel-style interactive TUI with full scriptability: **every
interactive action has an equivalent flag**, so the same command works in your
terminal and in CI.

## Install

### Script (standalone binary)

```bash
curl -fsSL https://raw.githubusercontent.com/rafaelvieiras/pocketstack-cli/main/scripts/install.sh | sh
```

Installs the right binary for your OS/architecture to `/usr/local/bin` (or
`~/.local/bin`). Override with `POCKETSTACK_INSTALL_DIR` or pin a version with
`POCKETSTACK_VERSION`.

### npm

```bash
npm install -g pocketstack-cli
```

Requires Node ≥ 20. The installed command is `pocketstack`.

### Binary download

Grab a prebuilt binary for your platform from the
[latest release](https://github.com/rafaelvieiras/pocketstack-cli/releases/latest)
(`pocketstack-<os>-<arch>`), `chmod +x`, and put it on your `PATH`. Checksums are
in `SHA256SUMS`.

## Quick start

```bash
pocketstack login          # opens your browser to authorize, saves the token
pocketstack whoami         # show the authenticated account
pocketstack import ./dir   # migrate PocketBase backups into apps
pocketstack logout         # remove stored credentials
pocketstack upgrade        # update to the latest version
```

## Authentication

`pocketstack login` works like `supabase login`:

1. The CLI starts a local callback server on `127.0.0.1`.
2. Your browser opens the PocketStack authorization page.
3. You approve, and the token is sent back to the local callback.
4. The token is saved to `~/.config/pocketstack/credentials.json` (mode `0600`).

Non-interactive / CI:

```bash
pocketstack login --token "$POCKETSTACK_TOKEN"   # or: ... --token -   (read from stdin)
pocketstack login --no-browser                   # print the URL instead of opening a browser
```

Point at a different host (self-hosted, staging, local):

```bash
pocketstack --host https://app.example.com login
# or
export POCKETSTACK_HOST=http://app.pocketstack.localhost
```

## Migrate apps (bulk import)

Bring existing PocketBase apps into PocketStack by pointing the CLI at a folder
of native PocketBase backup ZIPs (a `pb_data` export: `data.db` + `storage/` —
generate one from your PocketBase admin under **Settings → Backups**, or by
zipping `pb_data`):

```bash
pocketstack import ./backups
```

It scans the folder and asks how to proceed:

- **One app per backup** — creates a new app for each backup (you name each one).
- **Decide for each** — per backup, associate it with an existing app (this
  **replaces** that app's data, with confirmation) or create a new one.

Re-running is safe: a backup already imported is skipped, so you never end up
with duplicate apps. A backup from a **newer** PocketBase than the platform is
refused for that item only — the rest of the queue continues.

Non-interactive (CI / scripts):

```bash
pocketstack import ./backups --mode app-per-backup --yes --json
```

| Flag | Description |
| --- | --- |
| `--mode app-per-backup\|interactive` | Choose the flow without prompting |
| `--force` | Re-import even if the same file was already imported |
| `--name-from filename` | Derive each app name from its backup file name |

## Scripting

Global flags available on every command:

| Flag | Description |
| --- | --- |
| `--json` | Machine-readable JSON on stdout |
| `--no-input` | Never prompt; fail instead of asking (CI-safe) |
| `-y, --yes` | Assume "yes" for confirmations |
| `--quiet` | Suppress non-essential output |
| `--no-color` | Disable ANSI colors |
| `--host <url>` | Target a specific PocketStack host |

Human-readable status is written to **stderr**; `--json` data goes to **stdout**,
so you can safely pipe it:

```bash
pocketstack whoami --json | jq -r .email
```

## Configuration

- Credentials & cache: `~/.config/pocketstack/` (XDG-aware via `env-paths`).
- `POCKETSTACK_HOST` — default host.
- `POCKETSTACK_NO_UPDATE_CHECK` — disable the background "update available" notice.

## Contributing

See [AGENTS.md](./AGENTS.md) for the development guide, architecture, and
contribution rules. In short: TypeScript + ESM, `npm run dev -- <command>` to run
from source, and every feature must be usable both interactively and via flags.

## License

[MIT](./LICENSE) © Rafael Vieira
