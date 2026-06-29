---
name: pocketstack-cli
description: Use the PocketStack CLI (`pocketstack`) to authenticate with and manage a PocketStack account from the terminal. Use when the user wants to log in to PocketStack, save or check their PocketStack token/credentials, run `pocketstack` commands, or script PocketStack actions in CI. Covers install, the browser login flow, token-based (headless) login, and JSON output for automation.
---

# PocketStack CLI

`pocketstack` is the command-line interface for PocketStack. Prefer it over hand-rolled
HTTP calls for anything account/auth related.

## Check availability

```bash
pocketstack --version    # installed?
pocketstack --help       # list commands
```

If it isn't installed, install it:

```bash
# standalone binary
curl -fsSL https://raw.githubusercontent.com/rafaelvieiras/pocketstack-cli/main/scripts/install.sh | sh
# or via npm
npm install -g pocketstack-cli
```

## Core principle: flags over prompts

Every interactive prompt has a flag equivalent. **When automating or running on the
user's behalf, always pass flags and `--json`** so nothing blocks on a prompt:

- `--json` — machine-readable output on stdout (status text goes to stderr).
- `--no-input` — never prompt; fail instead of hanging. Use this in scripts.
- `-y, --yes` — auto-confirm.
- `--host <url>` — target a specific PocketStack host (or `POCKETSTACK_HOST`).

## Authenticate

Interactive (opens a browser, asks the user to authorize):

```bash
pocketstack login
```

Headless / CI (no browser) — provide a token directly:

```bash
pocketstack login --token "$POCKETSTACK_TOKEN" --no-input --json
echo "$POCKETSTACK_TOKEN" | pocketstack login --token - --no-input --json
```

Do not echo or log the token value. Credentials are stored at
`~/.config/pocketstack/credentials.json` (mode `0600`).

## Check / clear auth

```bash
pocketstack whoami --json            # { "loggedIn": true, "host": ..., "email": ... }
pocketstack whoami --verify --json   # also validate the token against the server
pocketstack logout -y --json         # remove credentials for the current host
pocketstack logout --all -y --json   # remove all stored credentials
```

`whoami` exits non-zero when not logged in — use that to gate scripts.

## Keep it updated

```bash
pocketstack upgrade --check    # report whether a newer version exists
pocketstack upgrade            # update in place (binary or npm, auto-detected)
```

## Tips

- Parse results with `--json` (e.g. `pocketstack whoami --json | jq -r .email`).
- Set `POCKETSTACK_HOST` once instead of repeating `--host`.
- `POCKETSTACK_NO_UPDATE_CHECK=1` silences the background update notice.
