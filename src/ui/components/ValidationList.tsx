import type { ValidationIssue } from '../../domain';
import { useEditorStore } from '../store/editorStore';

export function ValidationList({ issues, emptyMessage }: { issues: ValidationIssue[]; emptyMessage?: string }) {
  const document = useEditorStore((s) => s.document);
  const selectState = useEditorStore((s) => s.selectState);
  const selectTransition = useEditorStore((s) => s.selectTransition);

  if (issues.length === 0) {
    return <p className="validation validation--ok">{emptyMessage ?? 'Sin problemas de validación.'}</p>;
  }

  const focus = (id: string | undefined) => {
    if (!id) return;
    if (document.machine.states.some((s) => s.id === id)) selectState(id);
    else if (document.machine.transitions.some((t) => t.id === id)) selectTransition(id);
  };

  return (
    <ul className="validation-list">
      {issues.map((issue, index) => (
        <li key={index} className={'validation validation--' + issue.severity}>
          <span className="validation__code">{issue.severity === 'error' ? 'Error' : 'Aviso'} · {issue.code}</span>
          <span className="validation__message">
            {issue.elementId ? (
              <button type="button" className="link" onClick={() => focus(issue.elementId)}>
                {issue.message}
              </button>
            ) : (
              issue.message
            )}
          </span>
          {issue.path && <code className="validation__path">{issue.path}</code>}
        </li>
      ))}
    </ul>
  );
}
