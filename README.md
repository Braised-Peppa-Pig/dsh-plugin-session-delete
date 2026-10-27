<p align="center">
  <a href="./README.md"><img alt="English" src="https://img.shields.io/badge/English-1f6feb?style=for-the-badge"></a>
  <a href="./README.zh-CN.md"><img alt="简体中文" src="https://img.shields.io/badge/%E7%AE%80%E4%BD%93%E4%B8%AD%E6%96%87-8f2a1a?style=for-the-badge"></a>
</p>

<h1 align="center">Session Delete · DSH Plugin</h1>

<p align="center">Delete a DeepSeek Harness session, with an optional file-retention choice.</p>

A DeepSeek Harness Web UI plugin that adds a **Delete session** action to the
Session row menu. The confirmation dialog lets you choose whether session files
are permanently deleted or moved to a recovery folder.

- Adds **Delete session** to the Session row `...` menu.
- Custom confirmation dialog with a **Delete session log/attachment directory** checkbox.
- Checked: permanently remove the session directory.
- Unchecked: move the session directory to `DSH_HOME/deleted-sessions/`.
- Always removes the projection cache and workspace references.

## What gets removed

| Target | Checked | Unchecked |
|---|---|---|
| `DSH_HOME/sessions/<workspace>/<sessionId>/` | permanently deleted | moved to `DSH_HOME/deleted-sessions/` |
| `DSH_HOME/storages/session_projcache/sessions/<sessionId>.json` | removed | removed |
| `workspace.json` archived / pinned / grouped refs | removed | removed |

> DSH_HOME is the DeepSeek Harness data directory. On Windows it defaults to
> %USERPROFILE%\.dsh; on macOS/Linux it defaults to ~/.dsh. It can be
> overridden with the DSH_HOME environment variable.
>
> The session list is file-backed. The current Harness build has no native
> Session-delete API, so this plugin performs the cleanup on the Host.

## Optional: delete project files written by this session

The confirmation dialog has a second checkbox:

**Delete project files written by this session** (off by default).

When enabled, the plugin reads the session log and extracts explicit file-write
records from:

- `write`
- `edit`
- `apply_patch` (`*** Add File`, `*** Update File`, `*** Delete File`)

It lists only files that:

- were referenced by this session;
- still exist;
- resolve inside that session's `cwd` workspace.

Every file is unchecked initially. Use **Select all** if needed. The Host
re-validates the list at delete time. Files outside the workspace, symlinks
escaping it, and files not present in the write log are never deleted.

Shell commands that create files through `pwsh`/`bash` are not explicit write
records and are not included. Subagent sessions have their own logs.

## Install

### Option A — DSH Web UI (recommended)

1. Open **Settings → Plugins → Add plugin**.
2. Enter either:
   - this GitHub repository URL:
     `https://github.com/Braised-Peppa-Pig/dsh-plugin-session-delete`
   - or the **absolute path** to a local clone of this repository.
3. Install the plugin.
4. **Fully quit and restart DSH.**
5. Open a Session row `...` menu and choose **Delete session**.

### Option B — CLI

Clone the repository:

```bash
git clone https://github.com/Braised-Peppa-Pig/dsh-plugin-session-delete.git
```

Install it into the current profile. Replace `<absolute-path-to-repo>` with the
real clone path; do not use the placeholder literally.

```bash
dsh plugin --profile "$DSH_PROFILE" add "file:<absolute-path-to-repo>"
```

Windows PowerShell:

```powershell
dsh plugin --profile $env:DSH_PROFILE add "file:C:\path\to\dsh-plugin-session-delete"
```

macOS / Linux:

```bash
dsh plugin --profile "$DSH_PROFILE" add "file:/path/to/dsh-plugin-session-delete"
```

Then restart DSH.

### Option C — Local development

Use the checked-out directory as the **Add plugin → local path** value, or
install it with the CLI command above. There is no build step; the files in the
repository are the runtime files.

## Verify after restart

1. The Session `...` menu contains **Delete session**.
2. Clicking it opens a custom dialog, not a native browser confirm.
3. The dialog has a **Delete session log/attachment directory** checkbox.
4. Cancel leaves everything untouched.

If the menu item is missing:

- Check **Settings → Plugins** for `Session Delete` and enable it.
- Restart DSH again after installing or updating.
- Check that the profile's plugin version is `1.1.0` or newer.

## Usage

1. Hover a Session row.
2. Open `...`.
3. Choose **Delete session**.
4. Choose whether to delete files.
5. Confirm.

> Do not delete the currently running Session. Switch to another Session first.

## Recovery

If **Delete session log/attachment directory** is unchecked, the directory is kept at:

```text
DSH_HOME/deleted-sessions/<sessionId>-<timestamp>/<workspace>/<sessionId>/
```

Move it back under `DSH_HOME/sessions/<workspace>/` to recover the log. The
projection cache and workspace references are removed and will be rebuilt or
must be re-added by DSH.

## Compatibility

- Tested with DSH `0.2.1-rc.3` (desktop profile).
- Plugin version: `1.1.0`.
- No build step, no runtime npm dependencies.
- Requires permission to read/write the DSH session storage directory.

## Uninstall

Use **Settings → Plugins → Session Delete → Uninstall**, or:

```bash
dsh plugin --profile "$DSH_PROFILE" remove @local/dsh-plugin-session-delete
```

Restart DSH. Files already moved to `DSH_HOME/deleted-sessions/` are not
removed by uninstalling the plugin.

## Security

This plugin runs on the Host and can remove Session files. Review the source
before installing. It only accepts session IDs, rejects path traversal, and
only removes `<sessionsRoot>/*/<sessionId>` directories.

## Files

```text
index.js          Host-side cleanup and POST /api/session-delete
client.js         Session menu item and confirmation overlay
cordis.patch.yml  Plugin row
locale/           Plugin metadata (en / zh)
icon.svg          Plugin icon
package.json      DSH bundle/client manifest
```

## License

Released under the **MIT License**. See [LICENSE](LICENSE).
