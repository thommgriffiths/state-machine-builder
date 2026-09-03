import { useEditorStore } from '../store/editorStore';
import { Inspector } from './Inspector';
import { JsonPanel } from './JsonPanel';

/**
 * La barra lateral está reservada al elemento seleccionado. El JSON, que es del
 * documento entero, se abre desde la barra superior y ocupa el panel completo
 * (abrirlo deselecciona, así que nunca compiten).
 */
export function Sidebar() {
  const jsonPanelOpen = useEditorStore((s) => s.jsonPanelOpen);

  return (
    <aside className="sidebar">
      {jsonPanelOpen && (
        <div className="sidebar__header">
          <h2 className="sidebar__title">JSON del documento</h2>
          <button type="button" className="button button--small" onClick={useEditorStore.getState().closeJsonPanel}>
            Cerrar
          </button>
        </div>
      )}
      <div className="sidebar__content">{jsonPanelOpen ? <JsonPanel /> : <Inspector />}</div>
    </aside>
  );
}
