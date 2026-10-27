# Session Delete · DSH Plugin

Bilingual README（English / 中文）

A DeepSeek Harness Web UI plugin that adds a **Delete session…** action to the
Session row menu. The confirmation dialog lets you choose whether the session
files are permanently deleted or moved to a recovery folder.

给 DeepSeek Harness Web UI 增加一个 **删除会话…** 操作。确认页可以选择：
永久删除会话文件，或把文件移到可恢复目录。

---

## Features / 功能

- Adds **Delete session…** to the Session row `...` menu.
- Custom confirmation dialog with a **Delete session files** checkbox.
- Checked: permanently remove the session directory.
- Unchecked: move the session directory to `DSH_HOME/deleted-sessions/`.
- Always removes the projection cache and workspace references.

- 在左侧会话行 `...` 菜单增加 **删除会话…**。
- 自定义确认页，带 **同时删除会话文件** 勾选框。
- 勾选：永久删除会话目录。
- 不勾选：会话目录移到 `DSH_HOME/deleted-sessions/` 保留。
- 两种情况都会清理投影缓存与 `workspace.json` 里的引用。

## What gets removed / 清理内容

| Target | Checked / 勾选 | Unchecked / 不勾选 |
|---|---|---|
| `DSH_HOME/sessions/<workspace>/<sessionId>/` | permanently deleted / 永久删除 | moved to `DSH_HOME/deleted-sessions/` / 移到保留目录 |
| `DSH_HOME/storages/session_projcache/sessions/<sessionId>.json` | removed / 清理 | removed / 清理 |
| `workspace.json` archived / pinned / grouped refs | removed / 清理 | removed / 清理 |

> The session list is file-backed. There is no native Session-delete API in the
> current Harness build, so this plugin performs the cleanup on the Host.
>
> 当前 Harness 没有原生 Session 删除 API；插件在 Host 侧直接清理文件与索引。

## Install / 安装

### Option A — DSH Web UI (recommended) / 网页安装（推荐）

1. Open **Settings → Plugins → Add plugin**.
2. Enter either:
   - this GitHub repository URL:
     `https://github.com/Braised-Peppa-Pig/dsh-plugin-session-delete`
   - or the **absolute path** to a local clone of this repository.
3. Install the plugin.
4. **Fully quit and restart DSH.**
5. Open a Session row `...` menu and choose **Delete session…**.

中文：

1. 打开 **设置 → 插件 → 添加插件**。
2. 填写以下任意一种：
   - 本仓库的 GitHub 地址：
     `https://github.com/Braised-Peppa-Pig/dsh-plugin-session-delete`
   - 或本仓库本地克隆目录的**绝对路径**。
3. 安装插件。
4. **完全退出 DSH 并重新启动**。
5. 在会话行 `...` 菜单里选择 **删除会话…**。

### Option B — CLI / 命令行安装

Clone this repository first:

```bash
git clone https://github.com/Braised-Peppa-Pig/dsh-plugin-session-delete.git
```

Then install it into the current profile. Replace `<absolute-path-to-repo>` with
the real clone path; do not use a placeholder literally.

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

中文：

先克隆仓库，再把 `<absolute-path-to-repo>` 换成实际克隆路径安装：

```bash
dsh plugin --profile "$DSH_PROFILE" add "file:<absolute-path-to-repo>"
```

Windows PowerShell 示例：

```powershell
dsh plugin --profile $env:DSH_PROFILE add "file:C:\path\to\dsh-plugin-session-delete"
```

安装完成后重启 DSH。

### Option C — Local development / 本地开发

```bash
git clone https://github.com/Braised-Peppa-Pig/dsh-plugin-session-delete.git
cd dsh-plugin-session-delete
```

Use the checked-out directory as the **Add plugin → local path** value, or
install it with the CLI command above. The plugin has no build step; the files
in the repository are the runtime files.

本地开发不需要构建；仓库里的 `index.js`、`client.js` 和资源文件就是运行文件。
用本地目录安装，或使用上面的 CLI 命令。

## Verify / 验证

After restart / 重启后确认：

1. The Session `...` menu contains **Delete session…**.
2. Clicking it opens a custom dialog, not a native browser confirm.
3. The dialog has a **Delete session files** checkbox.
4. Cancel leaves everything untouched.

1. 会话 `...` 菜单里出现 **删除会话…**。
2. 点击后打开自定义确认页，而不是浏览器原生 confirm。
3. 确认页有 **同时删除会话文件** 勾选框。
4. 取消不会删除任何内容。

If the menu item is missing / 如果没有菜单项：

- Check **Settings → Plugins** for `Session Delete` and enable it.
- Restart DSH again after installing/updating.
- Check that the profile's plugin version is 1.1.0 or newer.

## Usage / 使用

1. Hover a Session row.
2. Open `...`.
3. Choose **Delete session…**.
4. Choose whether to delete files.
5. Confirm.

1. 悬停会话行。
2. 打开 `...`。
3. 选择 **删除会话…**。
4. 选择是否删除文件。
5. 确认。

> Do not delete the currently running Session. Switch to another Session first.
>
> 不要删除当前正在运行的会话；先切到其他会话再操作。

## Recovery / 恢复

If **Delete session files** is unchecked, the directory is kept at:

```text
DSH_HOME/deleted-sessions/<sessionId>-<timestamp>/<workspace>/<sessionId>/
```

Move it back under `DSH_HOME/sessions/<workspace>/` to recover the log. The
projection cache and workspace references are removed and will be rebuilt or
must be re-added by DSH.

如果不勾选删除文件，目录会保留在：

```text
DSH_HOME/deleted-sessions/<sessionId>-<timestamp>/<workspace>/<sessionId>/
```

把 `<sessionId>` 目录移回 `DSH_HOME/sessions/<workspace>/` 即可恢复日志；
投影缓存和工作区引用已被清理。

## Compatibility / 兼容性

- Tested with DSH `0.2.1-rc.3` (desktop profile).
- Plugin version: `1.1.0`.
- No build step, no runtime npm dependencies.
- Requires permission to read/write the DSH session storage directory.

- 已在 DSH `0.2.1-rc.3` 的 desktop profile 测试。
- 插件版本 `1.1.0`。
- 无构建步骤、无运行时 npm 依赖。
- 需要 DSH 会话存储目录的读写权限。

## Uninstall / 卸载

Use **Settings → Plugins → Session Delete → Uninstall**, or:

```bash
dsh plugin --profile "$DSH_PROFILE" remove @local/dsh-plugin-session-delete
```

Restart DSH. Files already moved to `DSH_HOME/deleted-sessions/` are not
removed by uninstalling the plugin.

在 **设置 → 插件** 里卸载，或执行上面的命令；重启 DSH。已经移动到
`DSH_HOME/deleted-sessions/` 的文件不会被卸载操作删除。

## Security / 安全

This plugin runs on the Host and can remove Session files. Review the source
before installing. It only accepts session IDs, rejects path traversal, and
only removes `<sessionsRoot>/*/<sessionId>` directories.

插件运行在 Host 侧，具备删除会话文件的能力。安装前请审阅源码。它只接受
合法 session id，拒绝路径穿越，并且只处理 `<sessionsRoot>/*/<sessionId>`
这一层目录。

## Files / 文件

```text
index.js          Host-side cleanup and POST /api/session-delete
client.js         Session menu item and confirmation overlay
cordis.patch.yml  Plugin row
locale/           Plugin metadata (en / zh)
icon.svg          Plugin icon
package.json      DSH bundle/client manifest
```

## License / 许可

No license has been declared yet. Add one before redistributing publicly if you
need explicit reuse terms.
