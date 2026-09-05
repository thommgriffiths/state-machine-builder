import { marked } from 'marked';
import { useEffect, useRef } from 'react';
import guiaHumanos from '../../../docs/guia-humanos.md?raw';
import guiaLlm from '../../../docs/guia-llm.md?raw';
import { buildJsonSchema, serializeDocument } from '../../domain';
import { downloadTextFile } from '../store/documentActions';
import { useEditorStore } from '../store/editorStore';

export type HelpTab = 'personas' | 'llm';

/**
 * Las guías viven en /docs como Markdown (legibles en el repositorio) y se
 * incrustan en el build: la versión estática las lleva adentro, sin depender
 * de ningún archivo externo. Se convierten a HTML una sola vez.
 */
const HTML: Record<HelpTab, string> = {
  personas: marked.parse(guiaHumanos, { async: false, gfm: true }),
  llm: marked.parse(guiaLlm, { async: false, gfm: true }),
};

/** Guía + JSON de la máquina abierta, listos para pegar en un chat. */
export function buildLlmPrompt(): string {
  const doc = useEditorStore.getState().document;
  return (
    guiaLlm.trimEnd() +
    '\n\n---\n\n## Máquina actual: ' +
    doc.machine.name +
    '\n\n```json\n' +
    serializeDocument(doc) +
    '\n```\n'
  );
}

interface HelpDialogProps {
  tab: HelpTab;
  onTabChange: (tab: HelpTab) => void;
  onClose: () => void;
}

export function HelpDialog({ tab, onTabChange, onClose }: HelpDialogProps) {
  const notify = useEditorStore((s) => s.notify);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // Al cambiar de guía se vuelve al principio y el cuerpo recibe el foco para
  // poder desplazarlo con el teclado.
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    body.scrollTop = 0;
    body.focus();
  }, [tab]);

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      notify('success', what + ' al portapapeles.');
    } catch {
      notify('error', 'No se pudo copiar al portapapeles.');
    }
  };

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label="Ayuda">
        <div className="dialog__header">
          <div className="tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'personas'}
              className={'tab' + (tab === 'personas' ? ' is-active' : '')}
              onClick={() => onTabChange('personas')}
            >
              Guía de uso
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'llm'}
              className={'tab' + (tab === 'llm' ? ' is-active' : '')}
              onClick={() => onTabChange('llm')}
            >
              Guía para LLMs
            </button>
          </div>
          <button type="button" className="button button--small" onClick={onClose} title="Cerrar (Esc)">
            Cerrar
          </button>
        </div>

        {tab === 'llm' && (
          <div className="dialog__actions">
            <button
              type="button"
              className="button button--primary"
              onClick={() => void copy(buildLlmPrompt(), 'Guía y máquina actual copiadas')}
              title="Copia la guía seguida del JSON de la máquina abierta: pegalo en el chat y agregá tu pedido"
            >
              Copiar guía + máquina actual
            </button>
            <button type="button" className="button" onClick={() => void copy(guiaLlm, 'Guía copiada')}>
              Copiar guía
            </button>
            <button type="button" className="button" onClick={() => downloadTextFile('guia-llm.md', guiaLlm, 'text/markdown')}>
              Descargar guía (.md)
            </button>
            <button
              type="button"
              className="button"
              onClick={() =>
                downloadTextFile('state-machine-document.schema.json', JSON.stringify(buildJsonSchema(), null, 2), 'application/json')
              }
              title="JSON Schema formal del documento, para validadores o para dárselo al modelo"
            >
              Descargar JSON Schema
            </button>
          </div>
        )}

        {/* Contenido propio del repositorio (docs/*.md), no entrada del usuario. */}
        <div ref={bodyRef} className="dialog__body markdown" tabIndex={-1} dangerouslySetInnerHTML={{ __html: HTML[tab] }} />
      </div>
    </div>
  );
}
