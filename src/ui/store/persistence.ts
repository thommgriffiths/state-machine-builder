/**
 * Persistencia local (localStorage).
 *
 *  - `sme:saved`   -> máquinas guardadas explícitamente, indexadas por machine.id.
 *  - `sme:working` -> copia de trabajo (autosave) para no perder cambios al recargar.
 *
 * Todo se guarda como el JSON canónico del documento; nada del formato interno
 * de la librería gráfica se persiste.
 */
import { parseDocumentJson, parseDocumentObject, serializeDocument, type StateMachineDocument } from '../../domain';
import { EXAMPLES } from '../../examples';
import { comparableSerialization, useEditorStore } from './editorStore';

const SAVED_KEY = 'sme:saved';
const WORKING_KEY = 'sme:working';

export interface SavedEntry {
  id: string;
  name: string;
  updatedAt: string;
  json: string;
}

type SavedIndex = Record<string, SavedEntry>;

function readIndex(): SavedIndex {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as SavedIndex) : {};
  } catch {
    return {};
  }
}

function writeIndex(index: SavedIndex): boolean {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(index));
    return true;
  } catch {
    return false;
  }
}

export function listSaved(): SavedEntry[] {
  return Object.values(readIndex()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function saveToStorage(doc: StateMachineDocument): boolean {
  const index = readIndex();
  index[doc.machine.id] = {
    id: doc.machine.id,
    name: doc.machine.name,
    updatedAt: new Date().toISOString(),
    json: serializeDocument(doc),
  };
  return writeIndex(index);
}

export function loadFromStorage(id: string): string | null {
  return readIndex()[id]?.json ?? null;
}

export function deleteFromStorage(id: string): boolean {
  const index = readIndex();
  if (!(id in index)) return false;
  delete index[id];
  return writeIndex(index);
}

interface WorkingCopy {
  json: string;
  baseline: string;
}

export function writeWorkingCopy(copy: WorkingCopy): void {
  try {
    localStorage.setItem(WORKING_KEY, JSON.stringify(copy));
  } catch {
    // Sin localStorage (modo privado, cuota...): simplemente no hay autosave.
  }
}

export function readWorkingCopy(): WorkingCopy | null {
  try {
    const raw = localStorage.getItem(WORKING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WorkingCopy>;
    if (typeof parsed.json !== 'string' || typeof parsed.baseline !== 'string') return null;
    return { json: parsed.json, baseline: parsed.baseline };
  } catch {
    return null;
  }
}

/** Carga inicial: copia de trabajo si existe; si no, el primer ejemplo. */
export function loadInitialDocument(): void {
  const store = useEditorStore.getState();
  const working = readWorkingCopy();
  if (working) {
    const result = parseDocumentJson(working.json);
    if (result.ok) {
      store.replaceDocument(result.document, { baseline: working.baseline });
      return;
    }
  }
  const example = EXAMPLES[0];
  if (!example) return;
  const result = parseDocumentObject(example.data);
  if (result.ok) {
    store.replaceDocument(result.document, { baseline: comparableSerialization(result.document) });
  }
}

/** Autosave de la copia de trabajo con un pequeño debounce. */
export function startWorkingCopyAutosave(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const unsubscribe = useEditorStore.subscribe((state, previous) => {
    if (state.document === previous.document && state.baseline === previous.baseline) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      writeWorkingCopy({ json: serializeDocument(state.document), baseline: state.baseline });
    }, 300);
  });
  return () => {
    if (timer) clearTimeout(timer);
    unsubscribe();
  };
}
