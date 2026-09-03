import { useEditorStore } from '../store/editorStore';

export function Notices() {
  const notices = useEditorStore((s) => s.notices);
  const dismiss = useEditorStore((s) => s.dismissNotice);
  if (notices.length === 0) return null;
  return (
    <div className="notices">
      {notices.map((notice) => (
        <div key={notice.id} className={'notice notice--' + notice.kind} role={notice.kind === 'error' ? 'alert' : 'status'}>
          <span>{notice.message}</span>
          <button type="button" className="notice__close" onClick={() => dismiss(notice.id)} aria-label="Cerrar">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
