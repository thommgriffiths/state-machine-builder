/**
 * Acciones de alto nivel sobre documentos completos: nuevo, abrir, guardar,
 * recargar, importar y exportar. Todas pasan por parseDocument* (schema +
 * validación + reconciliación) y avisan de lo que hicieron.
 */
import {
  createEmptyDocument,
  parseDocumentJson,
  parseDocumentObject,
  serializeDocument,
  type ParseResult,
  type StateMachineDocument,
} from '../../domain';
import { EXAMPLES } from '../../examples';
import { comparableSerialization, useEditorStore } from './editorStore';
import { loadFromStorage, saveToStorage } from './persistence';

function isDirty(): boolean {
  const state = useEditorStore.getState();
  return comparableSerialization(state.document) !== state.baseline;
}

function confirmDiscard(): boolean {
  if (!isDirty()) return true;
  return window.confirm('Hay cambios sin guardar. ¿Descartarlos?');
}

function applyParseResult(result: ParseResult, label: string): boolean {
  const store = useEditorStore.getState();
  if (!result.ok) {
    store.notify('error', label + ': ' + result.issues.map((i) => (i.path ? i.path + ': ' : '') + i.message).join(' | '));
    return false;
  }
  store.replaceDocument(result.document, { baseline: comparableSerialization(result.document) });
  if (result.migrations.length > 0) {
    store.notify('info', label + ': documento actualizado de formato. ' + result.migrations.join(' ') + ' Guardá para consolidarlo.');
  }
  store.notifyReport(result.report);
  if (result.warnings.length > 0) {
    store.notify('info', label + ': ' + result.warnings.length + ' advertencia(s) de validación (ver panel JSON).');
  }
  return true;
}

export function newDocument(): void {
  if (!confirmDiscard()) return;
  const store = useEditorStore.getState();
  const doc = createEmptyDocument({ id: 'machine-' + Date.now().toString(36), name: 'Nueva máquina' });
  store.replaceDocument(doc, { baseline: comparableSerialization(doc) });
}

export function openExample(key: string): void {
  const example = EXAMPLES.find((e) => e.key === key);
  if (!example || !confirmDiscard()) return;
  applyParseResult(parseDocumentObject(example.data), 'Ejemplo "' + example.name + '"');
}

export function openSaved(id: string): void {
  const json = loadFromStorage(id);
  const store = useEditorStore.getState();
  if (json === null) {
    store.notify('error', 'No se encontró la máquina guardada "' + id + '".');
    return;
  }
  if (!confirmDiscard()) return;
  applyParseResult(parseDocumentJson(json), 'Máquina guardada');
}

export function saveCurrent(): void {
  const store = useEditorStore.getState();
  if (saveToStorage(store.document)) {
    store.markSaved();
    store.notify('success', 'Guardado en este navegador como "' + store.document.machine.name + '".');
  } else {
    store.notify('error', 'No se pudo guardar en localStorage.');
  }
}

export function reloadBaseline(): void {
  const store = useEditorStore.getState();
  if (!isDirty()) {
    store.notify('info', 'No hay cambios que descartar.');
    return;
  }
  if (!window.confirm('Se descartarán los cambios desde la última carga/guardado. ¿Continuar?')) return;
  const result = parseDocumentJson(store.baseline);
  if (result.ok) {
    // Conservar la cámara actual.
    const viewport = store.document.layout.viewport;
    const doc: StateMachineDocument = viewport ? { ...result.document, layout: { ...result.document.layout, viewport } } : result.document;
    store.replaceDocument(doc, { baseline: store.baseline, keepHistory: true });
  }
}

export function importFromText(text: string, label = 'Importar'): boolean {
  if (!confirmDiscard()) return false;
  return applyParseResult(parseDocumentJson(text), label);
}

/** Aplica JSON editado a mano (panel JSON): conserva historial para poder deshacer. */
export function applyJsonText(text: string): ParseResult {
  const result = parseDocumentJson(text);
  if (result.ok) {
    const store = useEditorStore.getState();
    store.replaceDocument(result.document, { keepHistory: true });
    if (result.migrations.length > 0) store.notify('info', result.migrations.join(' '));
    store.notifyReport(result.report);
  }
  return result;
}

export function exportToFile(): void {
  const store = useEditorStore.getState();
  const json = serializeDocument(store.document);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = safeFileName(store.document.machine.id) + '.json';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]+/g, '-') || 'maquina';
}
