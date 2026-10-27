# Session Delete · DSH 插件

给 DeepSeek Harness 的 Session 行加一个 **删除会话…** 菜单项。点开后是自定义确认页，可选择是否同时删除文件。

## 功能

在左侧会话行 `...` 菜单末尾：

```text
删除会话…
```

点击后弹出自定义确认页：

- [x] **同时删除会话文件**（默认勾选）
  - 删除 `DSH_HOME/sessions/<workspace>/<sessionId>/`
  - 永久删除，无法恢复。
- [ ] 不勾选
  - 会话从列表移除；
  - 文件移到 `DSH_HOME/deleted-sessions/<sessionId>-<timestamp>/<workspace>/<sessionId>/` 保留；
  - 可手动恢复。

两种情况都会清理：

- `storages/session_projcache/sessions/<sessionId>.json`
- `storages/workspace.json` 中归档、固定、分组里的会话引用

## 安装

在 DSH Web UI：

**设置 → 插件 → 添加插件 → 输入本机绝对路径**：

```text
C:\Users\zhu\Desktop\game_dev\dsh-plugins\session-delete
```

安装后刷新页面。当前已安装到 `desktop` profile，更新此插件后需要重启 DSH 让 Host 端新代码生效。

## 文件

- `index.js`：Host 端，注册 `POST /api/session-delete`，执行磁盘清理/移动。
- `client.js`：Client 端，注册会话菜单与 `shell.overlay` 确认页。
- `cordis.patch.yml`：插入 Host/Client 插件行。
- `locale/*.json`、`icon.svg`：插件元数据。

## 安全边界

- 只接受合法 session id，拒绝路径分隔符与 `..`。
- 只处理 `sessionsRoot/*/<id>` 这一层，不递归扫描用户文件。
- `workspace.json` 原子写入。
- 删除不可恢复；确认页会写明是否删除文件。
- 不要删除正在运行的会话，尤其是当前会话。
