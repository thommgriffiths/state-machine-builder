/**
 * Validación referencial del documento.
 *
 * Los errores (`severity: "error"`) hacen que el documento no sea aceptable.
 * Las advertencias señalan inconsistencias o lints que la UI muestra pero que
 * no bloquean (la reconciliación corrige las de metadata huérfana y lo informa).
 */
import type { State, StateMachineDocument } from './types';

export type Severity = 'error' | 'warning';

export type IssueCode =
  | 'SCHEMA'
  | 'EMPTY_ID'
  | 'DUPLICATE_ID'
  | 'UNKNOWN_FROM_STATE'
  | 'UNKNOWN_TO_STATE'
  | 'INITIAL_STATE_MISSING'
  | 'UNKNOWN_INITIAL_STATE'
  | 'UNKNOWN_PARENT_STATE'
  | 'EMPTY_PARENT'
  | 'INVALID_POSITION'
  | 'ORPHAN_LAYOUT'
  | 'ORPHAN_STATE_STYLE'
  | 'ORPHAN_TRANSITION_STYLE'
  | 'ORPHAN_PARENT_STYLE'
  | 'NO_FINAL_STATE'
  | 'UNREACHABLE_STATE'
  | 'FINAL_STATE_HAS_OUTGOING';

export interface ValidationIssue {
  severity: Severity;
  code: IssueCode;
  message: string;
  /** Ruta JSON aproximada del elemento afectado (para orientar al lector). */
  path: string;
  /** ID del estado o transición afectados, si aplica. */
  elementId?: string;
}

export function validateDocument(doc: StateMachineDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { machine, layout, styles } = doc;

  const stateIds = new Set<string>();
  const allIds = new Map<string, string>(); // id -> path del primer uso

  machine.states.forEach((state, index) => {
    const path = `machine.states[${index}]`;
    if (!state.id) {
      issues.push({ severity: 'error', code: 'EMPTY_ID', message: 'Un estado tiene un id vacío.', path });
      return;
    }
    if (allIds.has(state.id)) {
      issues.push({
        severity: 'error',
        code: 'DUPLICATE_ID',
        message: `El id "${state.id}" está duplicado (ya usado en ${allIds.get(state.id)}).`,
        path,
        elementId: state.id,
      });
      return;
    }
    allIds.set(state.id, path);
    stateIds.add(state.id);
  });

  const parentIds = new Set<string>();
  machine.parents.forEach((parent, index) => {
    const path = `machine.parents[${index}]`;
    if (!parent.id) {
      issues.push({ severity: 'error', code: 'EMPTY_ID', message: 'Un estado padre tiene un id vacío.', path });
      return;
    }
    if (allIds.has(parent.id)) {
      issues.push({
        severity: 'error',
        code: 'DUPLICATE_ID',
        message: `El id "${parent.id}" está duplicado (ya usado en ${allIds.get(parent.id)}).`,
        path,
        elementId: parent.id,
      });
      return;
    }
    allIds.set(parent.id, path);
    parentIds.add(parent.id);
  });

  machine.transitions.forEach((transition, index) => {
    const path = `machine.transitions[${index}]`;
    if (!transition.id) {
      issues.push({ severity: 'error', code: 'EMPTY_ID', message: 'Una transición tiene un id vacío.', path });
    } else if (allIds.has(transition.id)) {
      issues.push({
        severity: 'error',
        code: 'DUPLICATE_ID',
        message: `El id "${transition.id}" está duplicado (ya usado en ${allIds.get(transition.id)}).`,
        path,
        elementId: transition.id,
      });
    } else {
      allIds.set(transition.id, path);
    }
    if (!stateIds.has(transition.from)) {
      issues.push({
        severity: 'error',
        code: 'UNKNOWN_FROM_STATE',
        message: `La transición "${transition.id}" sale de un estado inexistente: "${transition.from}".`,
        path: `${path}.from`,
        elementId: transition.id,
      });
    }
    if (!stateIds.has(transition.to)) {
      issues.push({
        severity: 'error',
        code: 'UNKNOWN_TO_STATE',
        message: `La transición "${transition.id}" apunta a un estado inexistente: "${transition.to}".`,
        path: `${path}.to`,
        elementId: transition.id,
      });
    }
  });

  // Jerarquía: el padre referenciado debe existir en machine.parents.
  machine.states.forEach((state, index) => {
    if (state.parentId === undefined) return;
    if (!parentIds.has(state.parentId)) {
      issues.push({
        severity: 'error',
        code: 'UNKNOWN_PARENT_STATE',
        message: `El subestado "${state.id}" pertenece al estado padre "${state.parentId}", que no existe.`,
        path: `machine.states[${index}].parentId`,
        elementId: state.id,
      });
    }
  });

  if (machine.initialStateId == null) {
    if (machine.states.length > 0) {
      issues.push({
        severity: 'error',
        code: 'INITIAL_STATE_MISSING',
        message: 'La máquina tiene estados pero no define un estado inicial (initialStateId).',
        path: 'machine.initialStateId',
      });
    }
  } else if (!stateIds.has(machine.initialStateId)) {
    issues.push({
      severity: 'error',
      code: 'UNKNOWN_INITIAL_STATE',
      message: `El estado inicial "${machine.initialStateId}" no existe.`,
      path: 'machine.initialStateId',
      elementId: machine.initialStateId,
    });
  }

  // Layout: posiciones válidas y sin huérfanos.
  for (const [id, position] of Object.entries(layout.states)) {
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) {
      issues.push({
        severity: 'error',
        code: 'INVALID_POSITION',
        message: `La posición de "${id}" no es numérica.`,
        path: `layout.states.${id}`,
        elementId: id,
      });
    }
    if (!stateIds.has(id)) {
      issues.push({
        severity: 'warning',
        code: 'ORPHAN_LAYOUT',
        message: `layout.states tiene una entrada para el estado inexistente "${id}".`,
        path: `layout.states.${id}`,
        elementId: id,
      });
    }
  }

  const transitionIds = new Set(machine.transitions.map((t) => t.id));
  for (const id of Object.keys(styles.states)) {
    if (!stateIds.has(id)) {
      issues.push({
        severity: 'warning',
        code: 'ORPHAN_STATE_STYLE',
        message: `styles.states tiene una entrada para el estado inexistente "${id}".`,
        path: `styles.states.${id}`,
        elementId: id,
      });
    }
  }
  for (const id of Object.keys(styles.transitions)) {
    if (!transitionIds.has(id)) {
      issues.push({
        severity: 'warning',
        code: 'ORPHAN_TRANSITION_STYLE',
        message: `styles.transitions tiene una entrada para la transición inexistente "${id}".`,
        path: `styles.transitions.${id}`,
        elementId: id,
      });
    }
  }

  for (const id of Object.keys(styles.parents)) {
    if (!parentIds.has(id)) {
      issues.push({
        severity: 'warning',
        code: 'ORPHAN_PARENT_STYLE',
        message: `styles.parents tiene una entrada para el estado padre inexistente "${id}".`,
        path: `styles.parents.${id}`,
        elementId: id,
      });
    }
  }

  // Lints semánticos (no bloqueantes).
  if (machine.states.length > 0 && !machine.states.some((s) => s.type === 'final')) {
    issues.push({
      severity: 'warning',
      code: 'NO_FINAL_STATE',
      message: 'La máquina no tiene ningún estado final (type: "final").',
      path: 'machine.states',
    });
  }

  if (machine.initialStateId != null && stateIds.has(machine.initialStateId)) {
    const reachable = reachableFrom(doc, machine.initialStateId);
    for (const state of machine.states) {
      if (!reachable.has(state.id)) {
        issues.push({
          severity: 'warning',
          code: 'UNREACHABLE_STATE',
          message: `El estado "${state.id}" no es alcanzable desde el estado inicial.`,
          path: 'machine.states',
          elementId: state.id,
        });
      }
    }
  }

  for (const parent of machine.parents) {
    if (!machine.states.some((s) => s.parentId === parent.id)) {
      issues.push({
        severity: 'warning',
        code: 'EMPTY_PARENT',
        message: `El estado padre "${parent.id}" no agrupa ningún subestado.`,
        path: 'machine.parents',
        elementId: parent.id,
      });
    }
  }

  for (const state of machine.states) {
    if (state.type === 'final' && machine.transitions.some((t) => t.from === state.id)) {
      issues.push({
        severity: 'warning',
        code: 'FINAL_STATE_HAS_OUTGOING',
        message: `El estado final "${state.id}" tiene transiciones salientes.`,
        path: 'machine.transitions',
        elementId: state.id,
      });
    }
  }

  return issues;
}

/** Subestados de un estado padre, en el orden en que aparecen en `machine.states`. */
export function substatesOf(states: readonly State[], parentId: string): State[] {
  return states.filter((s) => s.parentId === parentId);
}

export function reachableFrom(doc: StateMachineDocument, startId: string): Set<string> {
  const adjacency = new Map<string, string[]>();
  for (const t of doc.machine.transitions) {
    const list = adjacency.get(t.from);
    if (list) list.push(t.to);
    else adjacency.set(t.from, [t.to]);
  }
  const seen = new Set<string>([startId]);
  const queue = [startId];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const next of adjacency.get(current) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

export function errorsOf(issues: ValidationIssue[]): ValidationIssue[] {
  return issues.filter((i) => i.severity === 'error');
}

export function hasErrors(issues: ValidationIssue[]): boolean {
  return issues.some((i) => i.severity === 'error');
}
