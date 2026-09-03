/**
 * Store del editor (Zustand).
 *
 * Guarda el documento (inmutable), la selección, el historial de deshacer y
 * las notificaciones. Toda modificación pasa por `commit`, que aplica una
 * operación pura del dominio y convierte los `DomainError` en avisos.
 */
import { create } from 'zustand';
import {
  DomainError,
  addState,
  addTransition,
  applyLayout,
  computeAutoLayout,
  findFreeSpot,
  DEFAULT_PLACEMENT_OPTIONS,
  moveStates,
  removeStates,
  removeTransitions,
  renameStateId,
  renameTransitionId,
  serializeDocument,
  setInitialState,
  setStateStyle,
  setTransitionStyle,
  setViewport,
  updateMachineMeta,
  updateState,
  updateTransition,
  type Position,
  type ReconcileReport,
  type State,
  type StateMachineDocument,
  type StateStyle,
  type Transition,
  type TransitionStyle,
  type Viewport,
} from '../../domain';
import { createEmptyDocument } from '../../domain';

export type NoticeKind = 'info' | 'success' | 'error';

export interface Notice {
  id: number;
  kind: NoticeKind;
  message: string;
}

export interface Selection {
  stateIds: string[];
  transitionIds: string[];
}

export interface CommitOptions {
  /** Cambios consecutivos con la misma clave se agrupan en una sola entrada de historial. */
  coalesceKey?: string;
  /** `false` para cambios que no deben entrar al historial (p. ej. viewport). */
  history?: boolean;
}

type Mutator = (doc: StateMachineDocument) => StateMachineDocument;

const EMPTY_SELECTION: Selection = { stateIds: [], transitionIds: [] };
const HISTORY_LIMIT = 100;

let noticeCounter = 0;

export interface EditorStore {
  document: StateMachineDocument;
  /** Serialización de la última versión guardada/cargada (para detectar cambios sin guardar). */
  baseline: string;
  /** Se incrementa cada vez que se carga un documento distinto (para reajustar la vista). */
  loadCounter: number;
  selection: Selection;
  past: StateMachineDocument[];
  future: StateMachineDocument[];
  lastCoalesceKey: string | null;
  notices: Notice[];

  // --- núcleo -------------------------------------------------------------
  commit: (mutator: Mutator, options?: CommitOptions) => boolean;
  replaceDocument: (doc: StateMachineDocument, options?: { baseline?: string; keepHistory?: boolean }) => void;
  markSaved: () => void;
  undo: () => void;
  redo: () => void;
  endGesture: () => void;

  // --- selección ----------------------------------------------------------
  setSelection: (selection: Selection) => void;
  selectState: (id: string) => void;
  selectTransition: (id: string) => void;
  clearSelection: () => void;

  // --- avisos -------------------------------------------------------------
  notify: (kind: NoticeKind, message: string) => void;
  dismissNotice: (id: number) => void;
  notifyReport: (report: ReconcileReport) => void;

  // --- operaciones de negocio --------------------------------------------
  createState: (input: { label?: string; position?: Position; avoidOverlap?: boolean }) => void;
  updateStateFields: (id: string, patch: Partial<Pick<State, 'label' | 'type' | 'description'>>, coalesceKey?: string) => void;
  renameState: (oldId: string, newId: string) => boolean;
  makeInitial: (id: string) => void;
  createTransition: (input: { from: string; to: string }) => void;
  updateTransitionFields: (
    id: string,
    patch: Partial<Pick<Transition, 'from' | 'to' | 'label' | 'event' | 'condition' | 'action'>>,
    coalesceKey?: string,
  ) => void;
  renameTransition: (oldId: string, newId: string) => boolean;
  deleteElements: (stateIds: string[], transitionIds: string[]) => void;
  updateMachine: (patch: { id?: string; name?: string }, coalesceKey?: string) => void;

  // --- layout y estilos ---------------------------------------------------
  moveStatesTo: (positions: Record<string, Position>) => void;
  relayoutAll: () => void;
  updateViewport: (viewport: Viewport) => void;
  styleState: (id: string, patch: Partial<StateStyle>, coalesceKey?: string) => void;
  styleTransition: (id: string, patch: Partial<TransitionStyle>, coalesceKey?: string) => void;
}

function sanitizeSelection(doc: StateMachineDocument, selection: Selection): Selection {
  const stateIds = new Set(doc.machine.states.map((s) => s.id));
  const transitionIds = new Set(doc.machine.transitions.map((t) => t.id));
  const states = selection.stateIds.filter((id) => stateIds.has(id));
  const transitions = selection.transitionIds.filter((id) => transitionIds.has(id));
  if (states.length === selection.stateIds.length && transitions.length === selection.transitionIds.length) return selection;
  return { stateIds: states, transitionIds: transitions };
}

function withViewportOf(target: StateMachineDocument, source: StateMachineDocument): StateMachineDocument {
  if (source.layout.viewport === target.layout.viewport) return target;
  return setViewport(target, source.layout.viewport);
}

/** Serialización sin viewport: mover la cámara no cuenta como cambio. */
export function comparableSerialization(doc: StateMachineDocument): string {
  return serializeDocument(setViewport(doc, undefined));
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  document: createEmptyDocument(),
  baseline: comparableSerialization(createEmptyDocument()),
  loadCounter: 0,
  selection: EMPTY_SELECTION,
  past: [],
  future: [],
  lastCoalesceKey: null,
  notices: [],

  commit: (mutator, options = {}) => {
    const state = get();
    let next: StateMachineDocument;
    try {
      next = mutator(state.document);
    } catch (error) {
      if (error instanceof DomainError) {
        get().notify('error', error.message);
        return false;
      }
      throw error;
    }
    if (next === state.document) return true;

    const recordHistory = options.history !== false;
    const coalesced = recordHistory && options.coalesceKey !== undefined && options.coalesceKey === state.lastCoalesceKey;
    const pushHistory = recordHistory && !coalesced;

    set({
      document: next,
      selection: sanitizeSelection(next, state.selection),
      past: pushHistory ? [...state.past.slice(-(HISTORY_LIMIT - 1)), state.document] : state.past,
      future: pushHistory ? [] : state.future,
      lastCoalesceKey: recordHistory ? (options.coalesceKey ?? null) : state.lastCoalesceKey,
    });
    return true;
  },

  replaceDocument: (doc, options = {}) => {
    const state = get();
    set({
      document: doc,
      baseline: options.baseline ?? state.baseline,
      loadCounter: options.keepHistory ? state.loadCounter : state.loadCounter + 1,
      selection: EMPTY_SELECTION,
      past: options.keepHistory ? [...state.past.slice(-(HISTORY_LIMIT - 1)), state.document] : [],
      future: [],
      lastCoalesceKey: null,
    });
  },

  markSaved: () => set({ baseline: comparableSerialization(get().document) }),

  undo: () => {
    const state = get();
    const previous = state.past[state.past.length - 1];
    if (!previous) return;
    const restored = withViewportOf(previous, state.document);
    set({
      document: restored,
      selection: sanitizeSelection(restored, state.selection),
      past: state.past.slice(0, -1),
      future: [state.document, ...state.future],
      lastCoalesceKey: null,
    });
  },

  redo: () => {
    const state = get();
    const [next, ...rest] = state.future;
    if (!next) return;
    const restored = withViewportOf(next, state.document);
    set({
      document: restored,
      selection: sanitizeSelection(restored, state.selection),
      past: [...state.past, state.document],
      future: rest,
      lastCoalesceKey: null,
    });
  },

  endGesture: () => {
    if (get().lastCoalesceKey !== null) set({ lastCoalesceKey: null });
  },

  setSelection: (selection) => {
    const current = get().selection;
    if (sameIds(current.stateIds, selection.stateIds) && sameIds(current.transitionIds, selection.transitionIds)) return;
    set({ selection: sanitizeSelection(get().document, selection) });
  },
  selectState: (id) => get().setSelection({ stateIds: [id], transitionIds: [] }),
  selectTransition: (id) => get().setSelection({ stateIds: [], transitionIds: [id] }),
  clearSelection: () => get().setSelection(EMPTY_SELECTION),

  notify: (kind, message) => {
    noticeCounter += 1;
    const id = noticeCounter;
    set((state) => ({ notices: [...state.notices, { id, kind, message }] }));
    const timeout = kind === 'error' ? 9000 : 5000;
    setTimeout(() => get().dismissNotice(id), timeout);
  },
  dismissNotice: (id) => set((state) => ({ notices: state.notices.filter((n) => n.id !== id) })),
  notifyReport: (report) => {
    const lines: string[] = [];
    if (report.placedStates.length > 0) lines.push('Posicionados automáticamente: ' + report.placedStates.join(', ') + '.');
    if (report.prunedLayoutStates.length > 0) lines.push('Layout huérfano eliminado: ' + report.prunedLayoutStates.join(', ') + '.');
    if (report.prunedStateStyles.length > 0) lines.push('Estilos de estado huérfanos eliminados: ' + report.prunedStateStyles.join(', ') + '.');
    if (report.prunedTransitionStyles.length > 0) {
      lines.push('Estilos de transición huérfanos eliminados: ' + report.prunedTransitionStyles.join(', ') + '.');
    }
    if (lines.length > 0) get().notify('info', lines.join(' '));
  },

  createState: ({ label, position, avoidOverlap }) => {
    let created: string | null = null;
    const ok = get().commit((doc) => {
      let target = position;
      if (target && avoidOverlap) {
        target = findFreeSpot(target, Object.values(doc.layout.states), DEFAULT_PLACEMENT_OPTIONS);
      }
      const result = addState(doc, { label: label ?? 'Estado ' + (doc.machine.states.length + 1), position: target });
      created = result.stateId;
      return result.document;
    });
    if (ok && created) get().selectState(created);
  },

  updateStateFields: (id, patch, coalesceKey) => {
    get().commit((doc) => updateState(doc, id, patch), { coalesceKey });
  },

  renameState: (oldId, newId) => {
    const ok = get().commit((doc) => renameStateId(doc, oldId, newId));
    if (ok && oldId !== newId) get().selectState(newId);
    return ok;
  },

  makeInitial: (id) => {
    get().commit((doc) => setInitialState(doc, id));
  },

  createTransition: ({ from, to }) => {
    let created: string | null = null;
    const ok = get().commit((doc) => {
      const result = addTransition(doc, { from, to });
      created = result.transitionId;
      return result.document;
    });
    if (ok && created) get().selectTransition(created);
  },

  updateTransitionFields: (id, patch, coalesceKey) => {
    get().commit((doc) => updateTransition(doc, id, patch), { coalesceKey });
  },

  renameTransition: (oldId, newId) => {
    const ok = get().commit((doc) => renameTransitionId(doc, oldId, newId));
    if (ok && oldId !== newId) get().selectTransition(newId);
    return ok;
  },

  deleteElements: (stateIds, transitionIds) => {
    if (stateIds.length === 0 && transitionIds.length === 0) return;
    const ok = get().commit((doc) => {
      let next = doc;
      if (stateIds.length > 0) next = removeStates(next, stateIds);
      const remaining = transitionIds.filter((id) => next.machine.transitions.some((t) => t.id === id));
      if (remaining.length > 0) next = removeTransitions(next, remaining);
      return next;
    });
    if (ok) get().clearSelection();
  },

  updateMachine: (patch, coalesceKey) => {
    get().commit((doc) => updateMachineMeta(doc, patch), { coalesceKey });
  },

  moveStatesTo: (positions) => {
    get().commit((doc) => moveStates(doc, positions), { coalesceKey: 'drag:' + Object.keys(positions).sort().join(',') });
  },

  relayoutAll: () => {
    get().commit((doc) => applyLayout(doc, computeAutoLayout(doc.machine)));
  },

  updateViewport: (viewport) => {
    get().commit((doc) => setViewport(doc, viewport), { history: false });
  },

  styleState: (id, patch, coalesceKey) => {
    get().commit((doc) => setStateStyle(doc, id, patch), { coalesceKey });
  },

  styleTransition: (id, patch, coalesceKey) => {
    get().commit((doc) => setTransitionStyle(doc, id, patch), { coalesceKey });
  },
}));

function sameIds(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

export function useIsDirty(): boolean {
  return useEditorStore((s) => comparableSerialization(s.document) !== s.baseline);
}
