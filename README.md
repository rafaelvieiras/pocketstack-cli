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
pocketstack apps list      # list the apps you own
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

## List apps

See every app you own, with its status and usage at a glance:

```bash
pocketstack apps list
```

```
ID    NAME   STATUS   REFS  LAST USED
acme  Acme   running     2  15m ago
blog  Blog   idle        0  never
```

The `STATUS` column is `running` when the app is live and `idle` otherwise,
`REFS` is the number of active connections, and `LAST USED` is a relative time
(an app that has never been used shows `never`). The table is sorted by name.

For scripting, `--json` prints the raw array on stdout:

```bash
pocketstack apps list --json | jq -r '.[].id'
```

```json
[
  { "id": "acme", "name": "Acme", "alive": true, "refs": 2, "lastUsed": "2026-07-08T11:45:00Z" }
]
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

Each app's id and subdomain (`https://<id>.pocketstack.host`) are assigned by
the platform — a random id, not a slug of the name. The CLI sends only the name
and uses the id the server returns.

Re-running the **same files** is safe: a backup already imported (byte-for-byte)
is skipped, so you never end up with duplicate apps. A re-exported backup is a
different file, so it would create a new app — dedup is per file (sha256), not
per app. A backup from a **newer** PocketBase than the platform is refused for
that item only — the rest of the queue continues.

Non-interactive (CI / scripts):

```bash
pocketstack import ./backups --mode app-per-backup --yes --json
```

| Flag | Description |
| --- | --- |
| `--mode app-per-backup\|interactive` | Choose the flow without prompting |
| `--force` | Re-import even if the same file was already imported |
| `--name-from filename` | Derive each app name from its backup file name |

### Deduplication is per file, not per app

Dedup keys on the **sha256 of the backup ZIP**, not on the app it came from —
app ids are server-generated, so there is no name/id that could link a re-export
back to its app. A backup that was already imported (byte-for-byte identical
file) is skipped, so re-running the same files never creates duplicates. But two
backups of the **same** app taken at different times are different files with
different hashes — so the CLI has no way to know they belong together.

The practical consequence for bulk migrations:

- **`--mode app-per-backup`** creates one app per backup ZIP. If a folder holds
  several historical/incremental backups of the same app, you get **several
  duplicate apps** — one per file. Keep this mode to **one backup per app** in
  the folder.
- To fold multiple backups into a **single existing app**, use the **interactive**
  mode (`pocketstack import <dir>` with no `--mode`, or `--mode interactive`) and
  choose *Associate with an existing app* for each — this **replaces** that app's
  data with the chosen backup.
- Use **`--force`** only when you deliberately want to re-import the exact same
  file again.

See [docs/IMPORT.md](./docs/IMPORT.md) for the full deduplication reference.

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
