/**
 * Reconciliación entre `machine` y la metadata de presentación.
 *
 * Caso típico: un agente LLM modificó `machine` (agregó estados/transiciones,
 * eliminó otros) sin tocar `layout` ni `styles`. Esta función:
 *
 *  - asigna posición a los estados que no tienen (solo a ellos);
 *  - elimina entradas de layout/styles que apuntan a elementos inexistentes;
 *  - informa exactamente qué hizo (nada se corrige en silencio).
 *
 * Nunca mueve un estado que ya tenía posición.
 */
import { placeNewStates, type PlacementOptions } from './placement';
import type { StateMachineDocument } from './types';

export interface ReconcileReport {
  placedStates: string[];
  prunedLayoutStates: string[];
  prunedStateStyles: string[];
  prunedTransitionStyles: string[];
}

export function isReportEmpty(report: ReconcileReport): boolean {
  return (
    report.placedStates.length === 0 &&
    report.prunedLayoutStates.length === 0 &&
    report.prunedStateStyles.length === 0 &&
    report.prunedTransitionStyles.length === 0
  );
}

export function reconcileDocument(
  doc: StateMachineDocument,
  placement: Partial<PlacementOptions> = {},
): { document: StateMachineDocument; report: ReconcileReport } {
  const stateIds = new Set(doc.machine.states.map((s) => s.id));
  const transitionIds = new Set(doc.machine.transitions.map((t) => t.id));

  const report: ReconcileReport = {
    placedStates: [],
    prunedLayoutStates: [],
    prunedStateStyles: [],
    prunedTransitionStyles: [],
  };

  const layoutStates: StateMachineDocument['layout']['states'] = {};
  for (const [id, position] of Object.entries(doc.layout.states)) {
    if (stateIds.has(id)) layoutStates[id] = position;
    else report.prunedLayoutStates.push(id);
  }

  const styleStates: StateMachineDocument['styles']['states'] = {};
  for (const [id, style] of Object.entries(doc.styles.states)) {
    if (stateIds.has(id)) styleStates[id] = style;
    else report.prunedStateStyles.push(id);
  }

  const styleTransitions: StateMachineDocument['styles']['transitions'] = {};
  for (const [id, style] of Object.entries(doc.styles.transitions)) {
    if (transitionIds.has(id)) styleTransitions[id] = style;
    else report.prunedTransitionStyles.push(id);
  }

  let next: StateMachineDocument = {
    ...doc,
    layout: { ...doc.layout, states: layoutStates },
    styles: { ...doc.styles, states: styleStates, transitions: styleTransitions },
  };

  const unpositioned = doc.machine.states.map((s) => s.id).filter((id) => !layoutStates[id]);
  if (unpositioned.length > 0) {
    next = { ...next, layout: placeNewStates(next, unpositioned, placement) };
    report.placedStates = unpositioned;
  }

  return { document: next, report };
}
