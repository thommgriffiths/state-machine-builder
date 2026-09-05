import { useReactFlow } from '@xyflow/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { validateDocument } from '../../domain';
import { EXAMPLES } from '../../examples';
import type { StateFlowNode, TransitionFlowEdge } from '../adapter';
import {
  exportToFile,
  importFromText,
  newDocument,
  openExample,
  openSaved,
  reloadBaseline,
  saveCurrent,
} from '../store/documentActions';
import { useEditorStore, useIsDirty } from '../store/editorStore';
import { listSaved, type SavedEntry } from '../store/persistence';
import { HelpDialog, type HelpTab } from './HelpDialog';

export function Toolbar() {
  const name = useEditorStore((s) => s.document.machine.name);
  const canUndo = useEditorStore((s) => s.past.length > 0);
  const canRedo = useEditorStore((s) => s.future.length > 0);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const createState = useEditorStore((s) => s.createState);
  const relayoutAll = useEditorStore((s) => s.relayoutAll);
  const notify = useEditorStore((s) => s.notify);
  const jsonPanelOpen = useEditorStore((s) => s.jsonPanelOpen);
  const toggleJsonPanel = useEditorStore((s) => s.toggleJsonPanel);
  // Sin sombrear `document`: más abajo se usa el global para medir el lienzo.
  const doc = useEditorStore((s) => s.document);
  const issueCount = useMemo(() => validateDocument(doc).length, [doc]);
  const dirty = useIsDirty();
  const { fitView, screenToFlowPosition } = useReactFlow<StateFlowNode, TransitionFlowEdge>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [saved, setSaved] = useState<SavedEntry[]>([]);
  const [help, setHelp] = useState<HelpTab | null>(null);

  const refreshSaved = () => setSaved(listSaved());
  useEffect(refreshSaved, [dirty]);

  const addStateAtViewCenter = () => {
    const pane = document.querySelector('.react-flow');
    const rect = pane?.getBoundingClientRect();
    const center = rect
      ? screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
      : { x: 200, y: 200 };
    createState({ position: center, avoidOverlap: true });
  };

  const relayout = () => {
    if (!window.confirm('Reorganizar reemplaza las posiciones de TODOS los estados (se puede deshacer). ¿Continuar?')) return;
    relayoutAll();
    requestAnimationFrame(() => void fitView({ padding: 0.15, duration: 300 }));
  };

  const onOpen = (value: string) => {
    if (value.startsWith('example:')) openExample(value.slice('example:'.length));
    else if (value.startsWith('saved:')) openSaved(value.slice('saved:'.length));
  };

  const onFileChosen = async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = await file.text();
      if (importFromText(text, 'Importar "' + file.name + '"')) notify('success', 'Importado "' + file.name + '".');
    } catch (error) {
      notify('error', 'No se pudo leer el archivo: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  return (
    <header className="toolbar">
      <div className="toolbar__title" title={dirty ? 'Cambios sin guardar' : 'Sin cambios pendientes'}>
        <span className="toolbar__app">Máquinas de estado</span>
        <span className="toolbar__name">
          {name || 'Sin nombre'}
          {dirty && <span className="toolbar__dirty"> ●</span>}
        </span>
      </div>

      <div className="toolbar__group">
        <button type="button" className="button" onClick={newDocument} title="Nueva máquina vacía">
          Nueva
        </button>
        <select className="input input--select" value="" onChange={(e) => onOpen(e.target.value)} onFocus={refreshSaved} title="Abrir">
          <option value="">Abrir…</option>
          {saved.length > 0 && (
            <optgroup label="Guardadas en este navegador">
              {saved.map((entry) => (
                <option key={entry.id} value={'saved:' + entry.id}>
                  {entry.name} ({entry.id})
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label="Ejemplos">
            {EXAMPLES.map((example) => (
              <option key={example.key} value={'example:' + example.key}>
                {example.name}
              </option>
            ))}
          </optgroup>
        </select>
        <button type="button" className="button button--primary" onClick={saveCurrent} title="Guardar en este navegador (Ctrl/Cmd+S)">
          Guardar
        </button>
        <button type="button" className="button" onClick={reloadBaseline} disabled={!dirty} title="Volver a la última versión cargada o guardada">
          Recargar
        </button>
        <button type="button" className="button" onClick={() => fileInputRef.current?.click()} title="Importar desde un archivo JSON">
          Importar JSON
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            void onFileChosen(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <button type="button" className="button" onClick={exportToFile} title="Descargar como archivo JSON">
          Exportar JSON
        </button>
      </div>

      <div className="toolbar__group">
        <button type="button" className="button" onClick={addStateAtViewCenter} title="Crear un estado en el centro de la vista (o doble clic en el lienzo)">
          + Estado
        </button>
        <button type="button" className="button" onClick={undo} disabled={!canUndo} title="Deshacer (Ctrl/Cmd+Z)">
          ↶ Deshacer
        </button>
        <button type="button" className="button" onClick={redo} disabled={!canRedo} title="Rehacer (Ctrl/Cmd+Shift+Z)">
          ↷ Rehacer
        </button>
        <button type="button" className="button" onClick={relayout} title="Auto-layout global (herramienta explícita; se puede deshacer)">
          Reorganizar
        </button>
        <button type="button" className="button" onClick={() => void fitView({ padding: 0.15, duration: 300 })} title="Ajustar la vista al diagrama">
          Ajustar vista
        </button>
      </div>

      <div className="toolbar__group">
        <button
          type="button"
          className={'button' + (jsonPanelOpen ? ' is-active' : '')}
          aria-pressed={jsonPanelOpen}
          onClick={toggleJsonPanel}
          title="Ver y editar el JSON del documento completo (deselecciona el elemento actual)"
        >
          JSON {issueCount > 0 && <span className="button__badge">{issueCount}</span>}
        </button>
        <button
          type="button"
          className={'button' + (help !== null ? ' is-active' : '')}
          onClick={() => setHelp('personas')}
          title="Guía de uso y guía para trabajar con un LLM"
        >
          Ayuda
        </button>
      </div>

      {help !== null && <HelpDialog tab={help} onTabChange={setHelp} onClose={() => setHelp(null)} />}
    </header>
  );
}
