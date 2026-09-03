/**
 * Operaciones puras sobre el documento.
 *
 * Todas devuelven un documento NUEVO (nunca mutan el recibido), validan sus
 * argumentos y lanzan `DomainError` ante inconsistencias en lugar de
 * ocultarlas. Ninguna operación de negocio toca posiciones existentes; las
 * operaciones de layout/estilo nunca tocan `machine`.
 */
import { generateId } from './ids';
import { placeNewStates } from './placement';
import type {
  Machine,
  Position,
  State,
  StateMachineDocument,
  StateStyle,
  StateType,
  Transition,
  TransitionStyle,
  Viewport,
} from './types';

export type DomainErrorCode =
  | 'UNKNOWN_STATE'
  | 'UNKNOWN_TRANSITION'
  | 'DUPLICATE_ID'
  | 'EMPTY_ID'
  | 'INITIAL_STATE_REMOVAL'
  | 'INVALID_VALUE';

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------

export function findState(doc: StateMachineDocument, id: string): State | undefined {
  return doc.machine.states.find((s) => s.id === id);
}

export function findTransition(doc: StateMachineDocument, id: string): Transition | undefined {
  return doc.machine.transitions.find((t) => t.id === id);
}

export function requireState(doc: StateMachineDocument, id: string): State {
  const state = findState(doc, id);
  if (!state) throw new DomainError('UNKNOWN_STATE', `No existe el estado "${id}".`);
  return state;
}

export function requireTransition(doc: StateMachineDocument, id: string): Transition {
  const transition = findTransition(doc, id);
  if (!transition) throw new DomainError('UNKNOWN_TRANSITION', `No existe la transición "${id}".`);
  return transition;
}

function assertIdAvailable(doc: StateMachineDocument, id: string): void {
  if (!id || id.trim() === '') throw new DomainError('EMPTY_ID', 'El id no puede estar vacío.');
  if (findState(doc, id) || findTransition(doc, id)) {
    throw new DomainError('DUPLICATE_ID', `El id "${id}" ya está en uso.`);
  }
}

function withMachine(doc: StateMachineDocument, machine: Machine): StateMachineDocument {
  return { ...doc, machine };
}

function omitKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!(key in record)) return record;
  const copy = { ...record };
  delete copy[key];
  return copy;
}

// ---------------------------------------------------------------------------
// Máquina
// ---------------------------------------------------------------------------

export function updateMachineMeta(doc: StateMachineDocument, patch: { id?: string; name?: string }): StateMachineDocument {
  if (patch.id !== undefined && patch.id.trim() === '') {
    throw new DomainError('EMPTY_ID', 'El id de la máquina no puede estar vacío.');
  }
  return withMachine(doc, { ...doc.machine, ...patch });
}

export function setInitialState(doc: StateMachineDocument, stateId: string): StateMachineDocument {
  requireState(doc, stateId);
  return withMachine(doc, { ...doc.machine, initialStateId: stateId });
}

// ---------------------------------------------------------------------------
// Estados
// ---------------------------------------------------------------------------

export interface AddStateInput {
  id?: string;
  label: string;
  type?: StateType;
  /** Texto corto dibujado debajo del nodo. */
  subtitle?: string;
  /** Detalle de negocio; no se dibuja. */
  description?: string;
  /** Centro del nodo. Si se omite, se calcula una posición automática (solo para este estado). */
  position?: Position;
}

export function addState(doc: StateMachineDocument, input: AddStateInput): { document: StateMachineDocument; stateId: string } {
  const id = input.id ?? generateId(doc, 'state');
  assertIdAvailable(doc, id);

  const state: State = { id, label: input.label, type: input.type ?? 'normal' };
  if (input.subtitle) state.subtitle = input.subtitle;
  if (input.description) state.description = input.description;

  const machine: Machine = {
    ...doc.machine,
    states: [...doc.machine.states, state],
    // El primer estado de una máquina vacía pasa a ser el inicial.
    initialStateId: doc.machine.initialStateId ?? id,
  };
  let next: StateMachineDocument = withMachine(doc, machine);

  if (input.position) {
    next = { ...next, layout: { ...next.layout, states: { ...next.layout.states, [id]: { ...input.position } } } };
  } else {
    next = { ...next, layout: placeNewStates(next, [id]) };
  }
  return { document: next, stateId: id };
}

export function updateState(
  doc: StateMachineDocument,
  stateId: string,
  patch: Partial<Pick<State, 'label' | 'type' | 'subtitle' | 'description'>>,
): StateMachineDocument {
  requireState(doc, stateId);
  const states = doc.machine.states.map((s) => {
    if (s.id !== stateId) return s;
    const updated: State = { ...s, ...patch };
    for (const key of ['subtitle', 'description'] as const) {
      if (!updated[key]) delete updated[key];
    }
    return updated;
  });
  return withMachine(doc, { ...doc.machine, states });
}

/** Renombra el id de un estado propagando el cambio a transiciones, inicial, layout y estilos. */
export function renameStateId(doc: StateMachineDocument, oldId: string, newId: string): StateMachineDocument {
  requireState(doc, oldId);
  if (oldId === newId) return doc;
  assertIdAvailable(doc, newId);

  const machine: Machine = {
    ...doc.machine,
    initialStateId: doc.machine.initialStateId === oldId ? newId : doc.machine.initialStateId,
    states: doc.machine.states.map((s) => (s.id === oldId ? { ...s, id: newId } : s)),
    transitions: doc.machine.transitions.map((t) =>
      t.from === oldId || t.to === oldId
        ? { ...t, from: t.from === oldId ? newId : t.from, to: t.to === oldId ? newId : t.to }
        : t,
    ),
  };
  const layoutStates = renameKey(doc.layout.states, oldId, newId);
  const styleStates = renameKey(doc.styles.states, oldId, newId);
  return {
    ...doc,
    machine,
    layout: { ...doc.layout, states: layoutStates },
    styles: { ...doc.styles, states: styleStates },
  };
}

export function removeState(doc: StateMachineDocument, stateId: string): StateMachineDocument {
  return removeStates(doc, [stateId]);
}

/**
 * Elimina estados y, en cascada, las transiciones que los referencian, junto
 * con su layout y estilos. Rechaza eliminar el estado inicial: el usuario debe
 * elegir otro primero (así el documento nunca queda sin inicial).
 */
export function removeStates(doc: StateMachineDocument, stateIds: readonly string[]): StateMachineDocument {
  const ids = new Set(stateIds);
  for (const id of ids) requireState(doc, id);
  if (doc.machine.initialStateId != null && ids.has(doc.machine.initialStateId)) {
    throw new DomainError(
      'INITIAL_STATE_REMOVAL',
      `"${doc.machine.initialStateId}" es el estado inicial. Marca otro estado como inicial antes de eliminarlo.`,
    );
  }

  const removedTransitions = doc.machine.transitions.filter((t) => ids.has(t.from) || ids.has(t.to)).map((t) => t.id);
  const removedTransitionSet = new Set(removedTransitions);

  const machine: Machine = {
    ...doc.machine,
    states: doc.machine.states.filter((s) => !ids.has(s.id)),
    transitions: doc.machine.transitions.filter((t) => !removedTransitionSet.has(t.id)),
  };

  let layoutStates = doc.layout.states;
  let styleStates = doc.styles.states;
  let styleTransitions = doc.styles.transitions;
  for (const id of ids) {
    layoutStates = omitKey(layoutStates, id);
    styleStates = omitKey(styleStates, id);
  }
  for (const id of removedTransitions) styleTransitions = omitKey(styleTransitions, id);

  return {
    ...doc,
    machine,
    layout: { ...doc.layout, states: layoutStates },
    styles: { ...doc.styles, states: styleStates, transitions: styleTransitions },
  };
}

// ---------------------------------------------------------------------------
// Transiciones
// ---------------------------------------------------------------------------

export interface AddTransitionInput {
  id?: string;
  from: string;
  to: string;
  label?: string;
  event?: string;
  condition?: string;
  action?: string;
  /** Detalle de negocio; no se dibuja. */
  description?: string;
}

export function addTransition(
  doc: StateMachineDocument,
  input: AddTransitionInput,
): { document: StateMachineDocument; transitionId: string } {
  requireState(doc, input.from);
  requireState(doc, input.to);
  const id = input.id ?? generateId(doc, 'transition');
  assertIdAvailable(doc, id);

  const transition: Transition = { id, from: input.from, to: input.to };
  if (input.label) transition.label = input.label;
  if (input.event) transition.event = input.event;
  if (input.condition) transition.condition = input.condition;
  if (input.action) transition.action = input.action;
  if (input.description) transition.description = input.description;

  const machine: Machine = { ...doc.machine, transitions: [...doc.machine.transitions, transition] };
  return { document: withMachine(doc, machine), transitionId: id };
}

export function updateTransition(
  doc: StateMachineDocument,
  transitionId: string,
  patch: Partial<Pick<Transition, 'from' | 'to' | 'label' | 'event' | 'condition' | 'action' | 'description'>>,
): StateMachineDocument {
  requireTransition(doc, transitionId);
  if (patch.from !== undefined) requireState(doc, patch.from);
  if (patch.to !== undefined) requireState(doc, patch.to);

  const transitions = doc.machine.transitions.map((t) => {
    if (t.id !== transitionId) return t;
    const updated: Transition = { ...t, ...patch };
    for (const key of ['label', 'event', 'condition', 'action', 'description'] as const) {
      if (!updated[key]) delete updated[key];
    }
    return updated;
  });
  return withMachine(doc, { ...doc.machine, transitions });
}

export function renameTransitionId(doc: StateMachineDocument, oldId: string, newId: string): StateMachineDocument {
  requireTransition(doc, oldId);
  if (oldId === newId) return doc;
  assertIdAvailable(doc, newId);
  const machine: Machine = {
    ...doc.machine,
    transitions: doc.machine.transitions.map((t) => (t.id === oldId ? { ...t, id: newId } : t)),
  };
  return {
    ...doc,
    machine,
    styles: { ...doc.styles, transitions: renameKey(doc.styles.transitions, oldId, newId) },
  };
}

export function removeTransition(doc: StateMachineDocument, transitionId: string): StateMachineDocument {
  return removeTransitions(doc, [transitionId]);
}

/** Elimina transiciones y sus estilos. No toca estados ni layout. */
export function removeTransitions(doc: StateMachineDocument, transitionIds: readonly string[]): StateMachineDocument {
  const ids = new Set(transitionIds);
  for (const id of ids) requireTransition(doc, id);
  let styleTransitions = doc.styles.transitions;
  for (const id of ids) styleTransitions = omitKey(styleTransitions, id);
  return {
    ...doc,
    machine: { ...doc.machine, transitions: doc.machine.transitions.filter((t) => !ids.has(t.id)) },
    styles: { ...doc.styles, transitions: styleTransitions },
  };
}

// ---------------------------------------------------------------------------
// Layout (nunca toca `machine`)
// ---------------------------------------------------------------------------

export function moveState(doc: StateMachineDocument, stateId: string, position: Position): StateMachineDocument {
  return moveStates(doc, { [stateId]: position });
}

export function moveStates(doc: StateMachineDocument, positions: Record<string, Position>): StateMachineDocument {
  const next = { ...doc.layout.states };
  for (const [id, position] of Object.entries(positions)) {
    requireState(doc, id);
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) {
      throw new DomainError('INVALID_VALUE', `Posición inválida para "${id}".`);
    }
    next[id] = { x: position.x, y: position.y };
  }
  return { ...doc, layout: { ...doc.layout, states: next } };
}

/** Reemplaza posiciones (herramienta de relayout explícito). Solo acepta estados existentes. */
export function applyLayout(doc: StateMachineDocument, positions: Record<string, Position>): StateMachineDocument {
  return moveStates(doc, positions);
}

export function setViewport(doc: StateMachineDocument, viewport: Viewport | undefined): StateMachineDocument {
  const layout = { ...doc.layout };
  if (viewport) layout.viewport = { ...viewport };
  else delete layout.viewport;
  return { ...doc, layout };
}

// ---------------------------------------------------------------------------
// Estilos (nunca tocan `machine` ni `layout`)
// ---------------------------------------------------------------------------

/** Mezcla `patch` en el estilo del estado. Un valor `undefined` elimina esa propiedad. */
export function setStateStyle(doc: StateMachineDocument, stateId: string, patch: Partial<StateStyle>): StateMachineDocument {
  requireState(doc, stateId);
  const merged = mergeStyle(doc.styles.states[stateId], patch);
  const states = merged ? { ...doc.styles.states, [stateId]: merged } : omitKey(doc.styles.states, stateId);
  return { ...doc, styles: { ...doc.styles, states } };
}

/** Mezcla `patch` en el estilo de la transición. Un valor `undefined` elimina esa propiedad. */
export function setTransitionStyle(
  doc: StateMachineDocument,
  transitionId: string,
  patch: Partial<TransitionStyle>,
): StateMachineDocument {
  requireTransition(doc, transitionId);
  if (patch.curvature !== undefined && (!Number.isFinite(patch.curvature) || patch.curvature < -1 || patch.curvature > 1)) {
    throw new DomainError('INVALID_VALUE', 'La curvatura debe estar en el rango [-1, 1].');
  }
  const merged = mergeStyle(doc.styles.transitions[transitionId], patch);
  const transitions = merged
    ? { ...doc.styles.transitions, [transitionId]: merged }
    : omitKey(doc.styles.transitions, transitionId);
  return { ...doc, styles: { ...doc.styles, transitions } };
}

function mergeStyle<T extends object>(current: T | undefined, patch: Partial<T>): T | undefined {
  const merged: Record<string, unknown> = { ...(current ?? {}) };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete merged[key];
    else merged[key] = value;
  }
  return Object.keys(merged).length > 0 ? (merged as T) : undefined;
}

function renameKey<T>(record: Record<string, T>, oldKey: string, newKey: string): Record<string, T> {
  if (!(oldKey in record)) return record;
  const result: Record<string, T> = {};
  for (const [key, value] of Object.entries(record)) {
    result[key === oldKey ? newKey : key] = value;
  }
  return result;
}
