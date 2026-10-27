window.__ModuleLoader__.load({
  id: '@local/dsh-plugin-session-delete',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const listeners = new Set();
    let current = null;
    let nextRequest = 1;

    function publish(value) {
      current = value;
      for (const listener of listeners) listener(value);
    }

    function openConfirm(item) {
      publish({ ...item, requestId: nextRequest++ });
    }

    function closeConfirm() {
      publish(null);
    }

    const HIDDEN_KEY = 'dsh-session-delete-hidden';
    function readHidden() {
      try {
        const parsed = JSON.parse(sessionStorage.getItem(HIDDEN_KEY) || '[]');
        return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
      } catch { return []; }
    }
    function hiddenStyle() {
      let style = document.querySelector('style[data-plugin="dsh-session-delete-hidden"]');
      if (!style) {
        style = document.createElement('style');
        style.dataset.plugin = 'dsh-session-delete-hidden';
        document.head.appendChild(style);
      }
      const ids = readHidden();
      style.textContent = ids.map((id) => {
        const safe = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id.replace(/["\\]/g, '\\$&');
        return `[data-row-key="session:${safe}"]{display:none!important}`;
      }).join('\n');
    }
    function hideSession(id) {
      try {
        const ids = readHidden();
        if (!ids.includes(id)) ids.push(id);
        sessionStorage.setItem(HIDDEN_KEY, JSON.stringify(ids));
      } catch { /* ignore storage failures */ }
      hiddenStyle();
    }
    function leaveDeletedConversation() {
      // Prefer the app's own New Session command: it switches the right pane
      // correctly and does not rely on a full document reload.
      const buttons = [...document.querySelectorAll('button[aria-label], a[aria-label]')];
      const newSession = buttons.find((element) => /新建会话|new session/i.test(element.getAttribute('aria-label') || ''));
      if (newSession) {
        newSession.click();
        return;
      }
      const url = new URL(location.href);
      url.pathname = '/';
      url.search = '?deleted=' + Date.now();
      location.replace(url.toString());
    }

    function useConfirmState() {
      const [value, setValue] = React.useState(current);
      React.useEffect(() => {
        listeners.add(setValue);
        setValue(current);
        return () => listeners.delete(setValue);
      }, []);
      return value;
    }

    function TrashIcon() {
      return h('svg', {
        width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round',
        strokeLinejoin: 'round', 'aria-hidden': true, style: { flex: 'none' },
      },
        h('path', { d: 'M4 7h16' }),
        h('path', { d: 'M9 7V4h6v3' }),
        h('path', { d: 'M6 7l1 13h10l1-13' }),
        h('path', { d: 'M10 11v5M14 11v5' })
      );
    }

    function DeleteSessionMenuItem({ sessionId, displayTitle, useMenuOpenState }) {
      const [, setMenuOpen] = useMenuOpenState();
      const [hover, setHover] = React.useState(false);
      const onClick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        setMenuOpen(false);
        openConfirm({ sessionId, title: displayTitle || sessionId });
      };
      return h('button', {
        type: 'button',
        role: 'menuitem',
        title: '删除会话或保留文件移出列表',
        onClick,
        onMouseEnter: () => setHover(true),
        onMouseLeave: () => setHover(false),
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          width: '100%',
          minHeight: '32px',
          boxSizing: 'border-box',
          padding: '6px 10px',
          border: 'none',
          borderRadius: '4px',
          background: hover ? 'var(--dsw-alias-interactive-bg-hover, rgba(20, 30, 40, .06))' : 'transparent',
          color: 'inherit',
          font: 'inherit',
          fontSize: '13px',
          lineHeight: '18px',
          textAlign: 'left',
          cursor: 'pointer',
        },
      }, h(TrashIcon), h('span', null, '删除会话'));
    }

    function ConfirmOverlay() {
      const item = useConfirmState();
      const [deleteFiles, setDeleteFiles] = React.useState(true);
      const [deleteProjectFiles, setDeleteProjectFiles] = React.useState(false);
      const [scan, setScan] = React.useState(null);
      const [scanBusy, setScanBusy] = React.useState(false);
      const [scanError, setScanError] = React.useState('');
      const [selectedFiles, setSelectedFiles] = React.useState(() => new Set());
      const [busy, setBusy] = React.useState(false);
      const [error, setError] = React.useState('');
      const [resultInfo, setResultInfo] = React.useState(null);

      React.useEffect(() => {
        if (item) {
          setDeleteFiles(true);
          setDeleteProjectFiles(false);
          setScan(null);
          setScanBusy(false);
          setScanError('');
          setSelectedFiles(new Set());
          setBusy(false);
          setError('');
          setResultInfo(null);
        }
      }, [item && item.requestId]);

      React.useEffect(() => {
        if (!item) return;
        const onKey = (event) => { if (event.key === 'Escape' && !busy) closeConfirm(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
      }, [item, busy]);

      if (!item) return null;

      const runScan = async () => {
        setScanBusy(true);
        setScanError('');
        setScan(null);
        setSelectedFiles(new Set());
        try {
          const response = await fetch('/api/session-delete/scan', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sessionId: item.sessionId }),
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok || !data.ok) throw new Error(data.error || `HTTP ${response.status}`);
          setScan(data.result || { files: [] });
        } catch (error) {
          setScanError(error.message || String(error));
        } finally {
          setScanBusy(false);
        }
      };

      const toggleProjectFiles = (checked) => {
        setDeleteProjectFiles(checked);
        setError('');
        if (checked) runScan();
        else { setScan(null); setScanError(''); setSelectedFiles(new Set()); }
      };

      const confirm = async () => {
        if (deleteProjectFiles && !scan) {
          setError('请先扫描会话文件，再选择要删除的项目文件。');
          return;
        }
        setBusy(true);
        try {
          const response = await fetch('/api/session-delete', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              sessionId: item.sessionId,
              deleteFiles,
              projectFiles: deleteProjectFiles ? [...selectedFiles] : [],
            }),
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok || !data.ok) throw new Error(data.error || `HTTP ${response.status}`);
          const result = data.result || {};
          if (Array.isArray(result.warnings) && result.warnings.length) {
            console.warn('[session-delete]', result.warnings.join('; '));
          }
          // Remove the row immediately. The Host also detaches the live
          // Workspace entry, so a later list refresh will not bring it back.
          const row = document.querySelector(`[data-row-key="session:${item.sessionId}"]`);
          if (row) {
            row.style.display = 'none';
            row.setAttribute('aria-hidden', 'true');
          }
          hideSession(item.sessionId);
          if (!deleteFiles) {
            const keptPath = Array.isArray(result.keptDirs) ? result.keptDirs[0] : '';
            setResultInfo({ keptPath, sessionId: item.sessionId });
            setBusy(false);
            return;
          }
          closeConfirm();
          // Always leave the current Conversation: a deleted Session must not
          // stay mounted on the right, even when the sidebar row is gone.
          leaveDeletedConversation();
        } catch (error) {
          setError(error.message || String(error));
          setBusy(false);
        }
      };

      const overlay = {
        position: 'fixed', inset: 0, zIndex: 100000,
        background: 'rgba(27, 31, 36, .35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px',
      };
      const panel = {
        width: 'min(430px, 100%)', boxSizing: 'border-box',
        background: 'var(--dsw-alias-bg-elevated, #ffffff)',
        color: 'var(--dsw-alias-label-primary, #1f2328)',
        border: '1px solid var(--dsw-alias-border-l4, #d0d7de)',
        borderRadius: '8px', padding: '20px',
        boxShadow: '0 8px 28px rgba(31, 35, 40, .16)',
      };
      const titleStyle = { fontSize: '16px', fontWeight: 600, lineHeight: '22px' };
      const textStyle = { margin: '8px 0 0', fontSize: '13px', lineHeight: '20px' };
      const row = { display: 'flex', alignItems: 'flex-start', gap: '8px', margin: '16px 0', lineHeight: 1.5 };
      const note = { color: 'var(--dsw-alias-label-secondary, #57606a)', fontSize: '12px', lineHeight: '18px', margin: '6px 0 0' };
      const errorStyle = { color: 'var(--dsw-alias-state-error-primary, #cf222e)', fontSize: '12px', lineHeight: '18px', margin: '10px 0 0' };
      const fileBox = {
        border: '1px solid var(--dsw-alias-border-l4, #d0d7de)',
        borderRadius: '6px',
        margin: '10px 0 0',
        maxHeight: '190px',
        overflow: 'auto',
        padding: '6px',
      };
      const fileRow = {
        display: 'flex', alignItems: 'flex-start', gap: '7px',
        padding: '4px 5px', borderRadius: '4px', fontSize: '12px', lineHeight: '17px',
      };
      const filePathStyle = {
        fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
        overflowWrap: 'anywhere',
      };
      const selectAllStyle = {
        border: 'none', background: 'transparent', padding: '2px 4px',
        color: 'var(--dsw-alias-link, #0969da)', cursor: 'pointer',
        font: 'inherit', fontSize: '12px',
      };
      const actions = { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' };
      const baseButton = {
        height: '32px', padding: '0 14px', borderRadius: '6px',
        font: 'inherit', fontSize: '13px', cursor: busy ? 'wait' : 'pointer',
      };
      const cancelStyle = {
        ...baseButton,
        background: 'var(--dsw-alias-button-elevated-fill, #f6f8fa)',
        border: '1px solid var(--dsw-alias-border-l4, #d0d7de)',
        color: 'var(--dsw-alias-label-primary, #1f2328)',
      };
      const deleteStyle = {
        ...baseButton,
        border: '1px solid var(--dsw-alias-state-error-primary, #cf222e)',
        background: 'var(--dsw-alias-state-error-primary, #cf222e)',
        color: '#ffffff',
        opacity: busy ? 0.6 : 1,
      };
      const files = scan?.files || [];
      const allFilesSelected = files.length > 0 && selectedFiles.size === files.length;
      const toggleAllFiles = () => {
        setSelectedFiles(allFilesSelected ? new Set() : new Set(files.map((file) => file.path)));
      };
      const toggleFile = (filePath, checked) => {
        setSelectedFiles((current) => {
          const next = new Set(current);
          if (checked) next.add(filePath); else next.delete(filePath);
          return next;
        });
      };

      if (resultInfo) {
        return h('div', { style: overlay },
          h('div', { role: 'dialog', 'aria-modal': 'true', 'aria-label': '会话已移除', style: panel },
            h('div', { style: titleStyle }, '会话已移除'),
            h('p', { style: textStyle }, '会话已从列表移除，文件没有删除，而是保留在下面这个目录：'),
            h('code', { style: { ...filePathStyle, display: 'block', marginTop: '10px', padding: '8px', background: 'var(--dsw-alias-bg-inset, #f6f8fa)', borderRadius: '6px', overflowWrap: 'anywhere', fontSize: '11px' } },
              resultInfo.keptPath || 'DSH_HOME/deleted-sessions/<sessionId>-<timestamp>/<workspace>/<sessionId>/'
            ),
            h('div', { style: { ...note, marginTop: '12px' } },
              '恢复方法：把最内层 <sessionId> 目录移回 DSH_HOME/sessions/<workspace>/，然后重启 DSH。',
              h('br'),
              '共享 attachments 没有被移动或删除。'
            ),
            h('div', { style: actions },
              resultInfo.keptPath ? h('button', {
                type: 'button', style: cancelStyle,
                onClick: () => { navigator.clipboard?.writeText(resultInfo.keptPath).catch(() => {}); },
              }, '复制路径') : null,
              h('button', { type: 'button', style: deleteStyle, onClick: () => { closeConfirm(); leaveDeletedConversation(); } }, '关闭')
            )
          )
        );
      }

      return h('div', { style: overlay, onClick: (event) => { if (event.target === event.currentTarget && !busy) closeConfirm(); } },
        h('div', { role: 'dialog', 'aria-modal': 'true', 'aria-label': '删除会话', style: panel, onClick: (event) => event.stopPropagation() },
          h('div', { style: titleStyle }, '删除会话'),
          h('p', { style: textStyle }, `即将从列表移除「${item.title || item.sessionId}」。`),
          h('label', { style: row },
            h('input', {
              type: 'checkbox', checked: deleteFiles, disabled: busy,
              onChange: (event) => setDeleteFiles(event.target.checked),
              style: { marginTop: '2px' },
            }),
            h('span', null,
              h('b', { style: { fontSize: '13px', fontWeight: 600 } }, '同时删除会话日志/附件目录'),
              h('div', { style: note },
                deleteFiles
                  ? '删除 DSH_HOME/sessions/<workspace>/<sessionId>/ 目录（会话日志等），无法恢复。'
                  : '不勾选：目录会移到 DSH_HOME/deleted-sessions/<sessionId>-<timestamp>/<workspace>/<sessionId>/ 保留；恢复时把最内层 <sessionId> 移回 DSH_HOME/sessions/<workspace>/。'
              )
            )
          ),
          h('label', { style: { ...row, marginTop: '-4px' } },
            h('input', {
              type: 'checkbox', checked: deleteProjectFiles, disabled: busy || scanBusy,
              onChange: (event) => toggleProjectFiles(event.target.checked),
              style: { marginTop: '2px' },
            }),
            h('span', null,
              h('b', { style: { fontSize: '13px', fontWeight: 600 } }, '同时删除本会话写入的项目文件'),
              h('div', { style: note },
                '从会话日志提取 write / edit / apply_patch 记录，只列出当前工作区内仍存在的文件；默认不勾选。'
              )
            )
          ),
          deleteProjectFiles ? h('div', { style: { margin: '-8px 0 0 23px' } },
            scanBusy ? h('div', { style: note }, '正在读取会话日志…') : null,
            scanError ? h('div', { style: errorStyle, role: 'alert' }, `扫描失败：${scanError}`) : null,
            scan && !scanBusy ? h('div', null,
              h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' } },
                h('span', { style: { ...note, margin: 0 } }, `待删除文件：${files.length} 个，已选 ${selectedFiles.size} 个`),
                files.length ? h('button', { type: 'button', style: selectAllStyle, disabled: busy, onClick: toggleAllFiles }, allFilesSelected ? '取消全选' : '全选') : null
              ),
              files.length ? h('div', { style: fileBox },
                files.map((file) => h('label', { key: file.path, style: fileRow },
                  h('input', {
                    type: 'checkbox',
                    checked: selectedFiles.has(file.path),
                    disabled: busy,
                    onChange: (event) => toggleFile(file.path, event.target.checked),
                    style: { marginTop: '2px' },
                  }),
                  h('span', { style: { minWidth: 0 } },
                    h('span', { style: filePathStyle, title: file.path }, file.path),
                    h('span', { style: { ...note, margin: '1px 0 0' } },
                      `${file.action === 'write' ? '写入' : file.action === 'edit' ? '编辑' : '补丁'} · ${Math.max(1, Math.round(file.size / 1024))} KB`
                    )
                  )
                ))
              ) : h('div', { style: note }, '没有找到本会话写入、且仍在当前工作区内的文件。')
            ) : null
          ) : null,
          h('div', { style: note },
            '无论是否勾选，都会清理投影缓存、workspace.json 中的归档/固定/分组引用。',
            h('br'),
            '正在运行的会话请先停止，不要删除当前会话。'
          ),
          error ? h('div', { style: errorStyle, role: 'alert' }, `删除失败：${error}`) : null,
          h('div', { style: actions },
            h('button', { type: 'button', style: cancelStyle, disabled: busy, onClick: closeConfirm }, '取消'),
            h('button', { type: 'button', style: deleteStyle, disabled: busy, onClick: confirm }, busy ? '处理中…' : (deleteFiles ? '永久删除' : '移除会话'))
          )
        )
      );
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        hiddenStyle();
        ctx.effect(() => () => {
          document.querySelector('style[data-plugin="dsh-session-delete-hidden"]')?.remove();
        });
        ctx.slots.inject('sidebar.workspaces.session.menu.item', () => ctx.slots.register({
          name: 'sidebar.workspaces.session.menu.item',
          id: 'session-delete',
          order: 900,
        }, DeleteSessionMenuItem));
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'session-delete-confirm',
          order: 900,
        }, ConfirmOverlay));
      },
    };
  },
});
