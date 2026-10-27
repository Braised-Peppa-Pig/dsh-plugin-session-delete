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

    function useConfirmState() {
      const [value, setValue] = React.useState(current);
      React.useEffect(() => {
        listeners.add(setValue);
        setValue(current);
        return () => listeners.delete(setValue);
      }, []);
      return value;
    }

    function DeleteSessionMenuItem({ sessionId, displayTitle, useMenuOpenState }) {
      const [, setMenuOpen] = useMenuOpenState();
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
        style: { color: 'var(--dsw-alias-color-danger, #b3261e)' },
      }, '删除会话…');
    }

    function ConfirmOverlay() {
      const item = useConfirmState();
      const [deleteFiles, setDeleteFiles] = React.useState(true);
      const [busy, setBusy] = React.useState(false);

      React.useEffect(() => {
        if (item) { setDeleteFiles(true); setBusy(false); }
      }, [item && item.requestId]);

      React.useEffect(() => {
        if (!item) return;
        const onKey = (event) => { if (event.key === 'Escape' && !busy) closeConfirm(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
      }, [item, busy]);

      if (!item) return null;

      const confirm = async () => {
        setBusy(true);
        try {
          const response = await fetch('/api/session-delete', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sessionId: item.sessionId, deleteFiles }),
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok || !data.ok) throw new Error(data.error || `HTTP ${response.status}`);
          const result = data.result || {};
          const warnings = Array.isArray(result.warnings) && result.warnings.length
            ? `\n警告：${result.warnings.join('；')}`
            : '';
          const fileLine = deleteFiles
            ? `已永久删除会话目录 ${result.removedDirs?.length || 0} 个。`
            : (result.keptDirs?.length
              ? `文件已保留到 ${result.keptDirs[0]}（${result.keptDirs.length} 个目录）。`
              : '文件未能移动到保留目录，请检查警告。');
          window.alert(`会话已从列表移除。\n${fileLine}\n投影缓存已清理。${warnings}`);
          closeConfirm();
          location.reload();
        } catch (error) {
          window.alert(`删除失败：${error.message || error}`);
          setBusy(false);
        }
      };

      const overlay = {
        position: 'fixed', inset: 0, zIndex: 100000,
        background: 'rgba(14, 10, 8, 0.62)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px',
      };
      const panel = {
        width: 'min(480px, 100%)', boxSizing: 'border-box',
        background: 'var(--dsw-alias-bg-elevated, #211b16)',
        color: 'var(--dsw-alias-fg-primary, #f1e7d8)',
        border: '1px solid var(--dsw-alias-border, #5a4634)',
        borderRadius: '10px', padding: '20px',
        boxShadow: '0 24px 80px rgba(0,0,0,.5)',
      };
      const row = { display: 'flex', alignItems: 'flex-start', gap: '9px', margin: '14px 0', lineHeight: 1.55 };
      const note = { fontSize: '12px', opacity: 0.78, lineHeight: 1.6, margin: '8px 0 0' };
      const actions = { display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' };
      const cancelStyle = { padding: '7px 14px', borderRadius: '6px', border: '1px solid var(--dsw-alias-border, #5a4634)', background: 'transparent', color: 'inherit', cursor: busy ? 'wait' : 'pointer' };
      const deleteStyle = { padding: '7px 16px', borderRadius: '6px', border: '1px solid #8f2a1a', background: '#8f2a1a', color: '#fff5e8', cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1 };

      return h('div', { style: overlay, onClick: (event) => { if (event.target === event.currentTarget && !busy) closeConfirm(); } },
        h('div', { role: 'dialog', 'aria-modal': 'true', 'aria-label': '删除会话', style: panel, onClick: (event) => event.stopPropagation() },
          h('div', { style: { fontSize: '17px', fontWeight: 600, color: 'var(--dsw-alias-color-danger, #d98b73)' } }, '删除会话'),
          h('p', { style: { margin: '10px 0 0', lineHeight: 1.6 } }, `即将从列表移除「${item.title || item.sessionId}」。`),
          h('label', { style: row },
            h('input', {
              type: 'checkbox',
              checked: deleteFiles,
              disabled: busy,
              onChange: (event) => setDeleteFiles(event.target.checked),
              style: { marginTop: '3px' },
            }),
            h('span', null,
              h('b', null, '同时删除会话文件'),
              h('div', { style: { ...note, margin: '3px 0 0' } },
                deleteFiles
                  ? '会话日志/附件目录会被永久删除，无法恢复。'
                  : '会话目录会移到 DSH_HOME/deleted-sessions/ 保留，可手动恢复；列表记录与缓存仍会清理。'
              )
            )
          ),
          h('div', { style: note },
            '无论是否勾选，都会清理：投影缓存、workspace.json 中的归档/固定/分组引用。',
            h('br'),
            '正在运行的会话请先停止，不要删除当前会话。'
          ),
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
