import { useMemo, useState } from 'react';
import { validateDocument } from '../../domain';
import { useEditorStore } from '../store/editorStore';
import { Inspector } from './Inspector';
import { JsonPanel } from './JsonPanel';

type Tab = 'properties' | 'json';

export function Sidebar() {
  const [tab, setTab] = useState<Tab>('properties');
  const document = useEditorStore((s) => s.document);
  const warningCount = useMemo(() => validateDocument(document).length, [document]);

  return (
    <aside className="sidebar">
      <div className="tabs" role="tablist">
        <button type="button" role="tab" className={'tab' + (tab === 'properties' ? ' is-active' : '')} onClick={() => setTab('properties')}>
          Propiedades
        </button>
        <button type="button" role="tab" className={'tab' + (tab === 'json' ? ' is-active' : '')} onClick={() => setTab('json')}>
          JSON {warningCount > 0 && <span className="tab__badge">{warningCount}</span>}
        </button>
      </div>
      <div className="sidebar__content">{tab === 'properties' ? <Inspector /> : <JsonPanel />}</div>
    </aside>
  );
}
