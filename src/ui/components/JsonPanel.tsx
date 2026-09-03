import { useEffect, useMemo, useState } from 'react';
import { serializeDocument, validateDocument, type ParseResult } from '../../domain';
import { applyJsonText, exportToFile } from '../store/documentActions';
import { useEditorStore } from '../store/editorStore';
import { ValidationList } from './ValidationList';

export function JsonPanel() {
  const document = useEditorStore((s) => s.document);
  const notify = useEditorStore((s) => s.notify);
  const serialized = useMemo(() => serializeDocument(document), [document]);
  const issues = useMemo(() => validateDocument(document), [document]);
  const [draft, setDraft] = useState<string | null>(null);
  const [result, setResult] = useState<ParseResult | null>(null);

  // Si el documento cambia desde el lienzo y no hay edición pendiente, seguir el documento.
  useEffect(() => {
    if (draft === null) setResult(null);
  }, [serialized, draft]);

  const text = draft ?? serialized;
  const dirty = draft !== null && draft !== serialized;

  const apply = () => {
    if (draft === null) return;
    const outcome = applyJsonText(draft);
    setResult(outcome);
    if (outcome.ok) {
      setDraft(null);
      notify('success', 'JSON aplicado.');
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      notify('success', 'JSON copiado al portapapeles.');
    } catch {
      notify('error', 'No se pudo copiar al portapapeles.');
    }
  };

  return (
    <div className="json-panel">
      <div className="json-panel__toolbar">
        <button type="button" className="button button--primary" onClick={apply} disabled={!dirty}>
          Aplicar
        </button>
        <button type="button" className="button" onClick={() => { setDraft(null); setResult(null); }} disabled={draft === null}>
          Descartar
        </button>
        <button type="button" className="button" onClick={copy}>
          Copiar
        </button>
        <button type="button" className="button" onClick={exportToFile}>
          Descargar
        </button>
      </div>
      <p className="muted json-panel__hint">
        Edita <code>machine</code> para cambiar el negocio, <code>layout</code> para posiciones y <code>styles</code> para colores y curvatura.
        Un estado sin entrada en <code>layout.states</code> recibe posición automática al aplicar. Los cambios se validan antes de aplicarse.
      </p>
      <textarea
        className="json-panel__editor"
        value={text}
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
      />
      {result && !result.ok && (
        <div className="json-panel__result">
          <h3 className="inspector__subtitle">No se aplicó: errores</h3>
          <ValidationList issues={result.issues} />
        </div>
      )}
      {result && result.ok && result.warnings.length > 0 && (
        <div className="json-panel__result">
          <h3 className="inspector__subtitle">Advertencias</h3>
          <ValidationList issues={result.warnings} />
        </div>
      )}
      <div className="json-panel__result">
        <h3 className="inspector__subtitle">Validación del documento actual</h3>
        <ValidationList issues={issues} />
      </div>
    </div>
  );
}
