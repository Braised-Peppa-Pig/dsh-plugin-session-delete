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
      }, h(TrashIcon), h('span', null, '删除会话…'));
    }

    function ConfirmOverlay() {
      const item = useConfirmState();
      const [deleteFiles, setDeleteFiles] = React.useState(true);
      const [busy, setBusy] = React.useState(false);
      const [error, setError] = React.useState('');

      React.useEffect(() => {
        if (item) { setDeleteFiles(true); setBusy(false); setError(''); }
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
          if (Array.isArray(result.warnings) && result.warnings.length) {
            console.warn('[session-delete]', result.warnings.join('; '));
          }
          closeConfirm();
          location.reload();
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
              h('b', { style: { fontSize: '13px', fontWeight: 600 } }, '同时删除会话文件'),
              h('div', { style: note },
                deleteFiles
                  ? '会话日志/附件目录会被永久删除，无法恢复。'
                  : '会话目录会移到 DSH_HOME/deleted-sessions/ 保留，可手动恢复；列表记录与缓存仍会清理。'
              )
            )
          ),
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
