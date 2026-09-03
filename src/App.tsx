import { ReactFlowProvider } from '@xyflow/react';
import { useEffect } from 'react';
import { Canvas } from './ui/components/Canvas';
import { Notices } from './ui/components/Notices';
import { Sidebar } from './ui/components/Sidebar';
import { Toolbar } from './ui/components/Toolbar';
import { saveCurrent } from './ui/store/documentActions';
import { useEditorStore } from './ui/store/editorStore';
import { loadInitialDocument, startWorkingCopyAutosave } from './ui/store/persistence';

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

export function App() {
  useEffect(() => {
    loadInitialDocument();
    return startWorkingCopyAutosave();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      if (!meta) return;
      const key = event.key.toLowerCase();
      if (key === 's') {
        event.preventDefault();
        saveCurrent();
        return;
      }
      if (isEditableTarget(event.target)) return;
      if (key === 'z' && event.shiftKey) {
        event.preventDefault();
        useEditorStore.getState().redo();
      } else if (key === 'z') {
        event.preventDefault();
        useEditorStore.getState().undo();
      } else if (key === 'y') {
        event.preventDefault();
        useEditorStore.getState().redo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <ReactFlowProvider>
      <div className="app">
        <Toolbar />
        <main className="app__main">
          <Canvas />
          <Notices />
        </main>
        <Sidebar />
      </div>
    </ReactFlowProvider>
  );
}
