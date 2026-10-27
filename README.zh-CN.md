<p align="center">
  <a href="./README.md"><img alt="English" src="https://img.shields.io/badge/English-1f6feb?style=for-the-badge"></a>
  <a href="./README.zh-CN.md"><img alt="简体中文" src="https://img.shields.io/badge/%E7%AE%80%E4%BD%93%E4%B8%AD%E6%96%87-8f2a1a?style=for-the-badge"></a>
</p>

<h1 align="center">Session Delete · DSH 插件</h1>

<p align="center">删除 DeepSeek Harness 会话，可选择是否保留文件。</p>

给 DeepSeek Harness Web UI 的会话行增加 **删除会话…** 操作。确认页可以选择
永久删除会话文件，或把文件移到可恢复目录。

- 在左侧会话行 `...` 菜单增加 **删除会话…**。
- 自定义确认页，带 **同时删除会话文件** 勾选框。
- 勾选：永久删除会话目录。
- 不勾选：会话目录移到 `DSH_HOME/deleted-sessions/` 保留。
- 两种情况都会清理投影缓存与 `workspace.json` 里的引用。

## 清理内容

| 目标 | 勾选 | 不勾选 |
|---|---|---|
| `DSH_HOME/sessions/<workspace>/<sessionId>/` | 永久删除 | 移到 `DSH_HOME/deleted-sessions/` |
| `DSH_HOME/storages/session_projcache/sessions/<sessionId>.json` | 清理 | 清理 |
| `workspace.json` 归档/固定/分组引用 | 清理 | 清理 |

> 会话列表由文件驱动。当前 Harness 没有原生 Session 删除 API，因此插件直接在
> Host 侧清理文件与索引。

## 安装

### 方式 A — DSH 网页（推荐）

1. 打开 **设置 → 插件 → 添加插件**。
2. 填写以下任意一种：
   - 本仓库的 GitHub 地址：
     `https://github.com/Braised-Peppa-Pig/dsh-plugin-session-delete`
   - 或本仓库本地克隆目录的**绝对路径**。
3. 安装插件。
4. **完全退出 DSH 并重新启动**。
5. 在会话行 `...` 菜单里选择 **删除会话…**。

### 方式 B — 命令行

先克隆仓库：

```bash
git clone https://github.com/Braised-Peppa-Pig/dsh-plugin-session-delete.git
```

把 `<absolute-path-to-repo>` 换成实际克隆路径后安装：

```bash
dsh plugin --profile "$DSH_PROFILE" add "file:<absolute-path-to-repo>"
```

Windows PowerShell：

```powershell
dsh plugin --profile $env:DSH_PROFILE add "file:C:\path\to\dsh-plugin-session-delete"
```

macOS / Linux：

```bash
dsh plugin --profile "$DSH_PROFILE" add "file:/path/to/dsh-plugin-session-delete"
```

安装完成后重启 DSH。

### 方式 C — 本地开发

把克隆目录作为 **添加插件 → 本地路径**，或使用上面的 CLI 命令安装。插件没有
构建步骤，仓库里的文件就是运行文件。

## 重启后验证

1. 会话 `...` 菜单里出现 **删除会话…**。
2. 点击后打开自定义确认页，而不是浏览器原生 confirm。
3. 确认页有 **同时删除会话文件** 勾选框。
4. 取消不会删除任何内容。

如果菜单项没有出现：

- 打开 **设置 → 插件**，确认 `Session Delete` 已启用。
- 安装或更新后再次重启 DSH。
- 确认 profile 里的插件版本是 `1.1.0` 或更新。

## 使用

1. 悬停会话行。
2. 打开 `...`。
3. 选择 **删除会话…**。
4. 选择是否删除文件。
5. 确认。

> 不要删除当前正在运行的会话；先切到其他会话再操作。

## 恢复

如果不勾选删除文件，目录会保留在：

```text
DSH_HOME/deleted-sessions/<sessionId>-<timestamp>/<workspace>/<sessionId>/
```

把 `<sessionId>` 目录移回 `DSH_HOME/sessions/<workspace>/` 即可恢复日志；
投影缓存和工作区引用已被清理，需要 DSH 重新生成或重新添加。

## 兼容性

- 已在 DSH `0.2.1-rc.3` 的 desktop profile 测试。
- 插件版本：`1.1.0`。
- 无构建步骤、无运行时 npm 依赖。
- 需要 DSH 会话存储目录的读写权限。

## 卸载

在 **设置 → 插件 → Session Delete → 卸载**，或执行：

```bash
dsh plugin --profile "$DSH_PROFILE" remove @local/dsh-plugin-session-delete
```

重启 DSH。已经移动到 `DSH_HOME/deleted-sessions/` 的文件不会被卸载操作删除。

## 安全

插件运行在 Host 侧，具备删除会话文件的能力。安装前请审阅源码。它只接受合法
session id，拒绝路径穿越，并且只处理 `<sessionsRoot>/*/<sessionId>` 这一层目录。

## 文件

```text
index.js          Host 端清理逻辑与 POST /api/session-delete
client.js         会话菜单与确认页
cordis.patch.yml  插件行
locale/           插件元数据（en / zh）
icon.svg          插件图标
package.json      DSH bundle/client 清单
```

## 许可

目前还没有声明 License。公开分发前如需明确复用条款，请补充一个。
