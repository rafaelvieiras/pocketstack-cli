# Import reference

The `import` command brings existing PocketBase apps into PocketStack by pointing
the CLI at a folder of native PocketBase backup ZIPs (a `pb_data` export). It runs
in one of two modes: **`app-per-backup`** creates a new app for each backup ZIP
(ideal for unattended CI runs), while **`interactive`** walks you through each
backup so you can create a new app or associate it with an existing one.

The behaviour is controlled with `--mode <app-per-backup|interactive>`, `--force`
(re-import a file even if it was already imported), and `--name-from filename`
(derive each app name from its backup file name).

## App ids and subdomains

Every app's id is **assigned by the platform** — a short random identifier that
also becomes its subdomain (`https://<id>.pocketstack.host`). You don't choose
it, and it is **not** derived from the app name: two apps you name the same still
get two different ids. The CLI sends only the app *name* when creating an app and
uses whatever id the server returns. (Earlier versions turned the name into a
slug and pinned that as the id; that is gone — ids are always server-generated.)

## Deduplication

The `import` command deduplicates by the **sha256 hash of each backup ZIP** — it
identifies *files*, not *apps*. Understanding this is important for bulk and
historical migrations.

### What dedup does

- Before uploading, the CLI hashes each backup and runs a pre-flight check
  (`GET /api/cli/backups/{sha256}`) to see which apps already hold that exact
  file. The server is the final authority on dedup.
- A backup whose bytes were already imported is reported as **skipped**. Because
  ids are server-generated, this byte-identical sha256 match is the *only* thing
  that keeps a re-run safe: re-running a folder of the **same files** creates no
  duplicate apps, but a freshly **re-exported** backup of an app you already
  imported is a different file and *would* create a new app. Re-runs are no
  longer deduplicated by a name-derived id.

### What dedup does *not* do

sha256 only recognizes **byte-identical** files. It cannot tell that two
*different* backups belong to the same app. Two exports of the same PocketBase
app, taken minutes apart, differ (timestamps, WAL state, new rows) and therefore
hash differently — to the CLI they are two unrelated backups.

### Consequences per mode

| Situation | `--mode app-per-backup` | Interactive (`--mode interactive`) |
| --- | --- | --- |
| One ZIP per app in the folder | One app per app. Correct. | Pick *create new app* for each. |
| Multiple ZIPs of the *same* app in the folder | One app **per ZIP** → duplicate apps. | *Associate with an existing app* to fold them into one (each **replaces** its data). |
| Same ZIP appears again on a re-run | Skipped (idempotent). | Skipped, unless you confirm / `--force`. |

### Recommendations

- In `--mode app-per-backup`, ensure the folder holds **exactly one backup per
  app**. This is the safe shape for unattended CI runs.
- To consolidate several backups into one existing app, use interactive mode and
  choose *Associate with an existing app* — note this **replaces** the target
  app's data with the selected backup (it is not a merge).
- Use `--force` only to deliberately re-import a file that was already imported.
