/**
 * Adaptador Documento -> React Flow.
 *
 * Único punto donde el modelo de dominio se traduce a las estructuras de la
 * librería gráfica. Nada de lo que produce se persiste. Si se cambiara la
 * librería, solo habría que reescribir este archivo y los componentes de UI.
 */
import type { Edge, Node } from '@xyflow/react';
import type { LineStyle, Position, StateMachineDocument, Transition } from '../../domain';
import { ARROW_LENGTH, ARROW_WIDTH, NODE_BOX, NODE_RADIUS, PARALLEL_SPREAD, SELF_LOOP_SIZE } from './constants';
import { computeTransitionGeometry, type TransitionGeometry } from './geometry';

export interface StateNodeData extends Record<string, unknown> {
  stateId: string;
  label: string;
  description?: string;
  isInitial: boolean;
  isFinal: boolean;
  color: string;
}

export interface TransitionEdgeData extends Record<string, unknown> {
  transitionId: string;
  geometry: TransitionGeometry;
  color: string;
  lineStyle: LineStyle;
  primaryText?: string;
  secondaryText?: string;
}

export type StateFlowNode = Node<StateNodeData, 'state'>;
export type TransitionFlowEdge = Edge<TransitionEdgeData, 'transition'>;

export interface FlowSelection {
  stateIds: ReadonlySet<string>;
  transitionIds: ReadonlySet<string>;
}

export interface FlowModel {
  nodes: StateFlowNode[];
  edges: TransitionFlowEdge[];
}

const HALF_BOX = NODE_BOX / 2;

/** Centro (layout) -> esquina superior izquierda del cuadro DOM (React Flow). */
export function centerToNodePosition(center: Position): Position {
  return { x: center.x - HALF_BOX, y: center.y - HALF_BOX };
}

/** Esquina superior izquierda (React Flow) -> centro (layout). */
export function nodePositionToCenter(position: Position): Position {
  return { x: position.x + HALF_BOX, y: position.y + HALF_BOX };
}

export function documentToFlow(doc: StateMachineDocument, selection: FlowSelection): FlowModel {
  const { machine, layout, styles } = doc;
  const centers = new Map<string, Position>();

  const nodes: StateFlowNode[] = machine.states.map((state, index) => {
    // Todo estado debería tener posición tras la reconciliación; el fallback
    // solo evita romper el render si alguien saltó ese paso.
    const center = layout.states[state.id] ?? { x: 200 + index * 200, y: 200 };
    centers.set(state.id, center);
    return {
      id: state.id,
      type: 'state',
      position: centerToNodePosition(center),
      width: NODE_BOX,
      height: NODE_BOX,
      // El tamaño del nodo es fijo, así que se declara como ya medido. Sin esto,
      // React Flow considera "no inicializados" a los nodos regenerados en cada
      // render y nunca ejecuta fitView (los nodos con width/height explícitos no
      // se vuelven a medir).
      measured: { width: NODE_BOX, height: NODE_BOX },
      selected: selection.stateIds.has(state.id),
      data: {
        stateId: state.id,
        label: state.label,
        description: state.description,
        isInitial: machine.initialStateId === state.id,
        isFinal: state.type === 'final',
        color: styles.states[state.id]?.color ?? styles.defaults.stateColor,
      },
    };
  });

  const curvatures = resolveCurvatures(doc);

  const edges: TransitionFlowEdge[] = machine.transitions
    .filter((t) => centers.has(t.from) && centers.has(t.to))
    .map((transition) => {
      const from = centers.get(transition.from) as Position;
      const to = centers.get(transition.to) as Position;
      const style = styles.transitions[transition.id];
      const geometry = computeTransitionGeometry(from, to, {
        radius: NODE_RADIUS,
        curvature: curvatures[transition.id] ?? 0,
        arrowLength: ARROW_LENGTH,
        arrowWidth: ARROW_WIDTH,
        loopSize: SELF_LOOP_SIZE,
      });
      const texts = transitionTexts(transition);
      return {
        id: transition.id,
        type: 'transition',
        source: transition.from,
        target: transition.to,
        selected: selection.transitionIds.has(transition.id),
        data: {
          transitionId: transition.id,
          geometry,
          color: style?.color ?? styles.defaults.transitionColor,
          lineStyle: style?.lineStyle ?? 'solid',
          primaryText: texts.primary,
          secondaryText: texts.secondary,
        },
      };
    });

  return { nodes, edges };
}

/**
 * Curvatura efectiva por transición: la explícita si existe; si no, una
 * automática que separa transiciones entre el mismo par de estados (en
 * cualquier sentido) y distribuye los bucles de un mismo estado.
 */
export function resolveCurvatures(doc: StateMachineDocument): Record<string, number> {
  const result: Record<string, number> = {};
  const groups = new Map<string, Transition[]>();
  for (const t of doc.machine.transitions) {
    const key = t.from === t.to ? 'loop:' + t.from : [t.from, t.to].sort().join(' ');
    const group = groups.get(key);
    if (group) group.push(t);
    else groups.set(key, [t]);
  }

  for (const [key, group] of groups) {
    const n = group.length;
    group.forEach((t, i) => {
      const explicit = doc.styles.transitions[t.id]?.curvature;
      if (explicit !== undefined) {
        result[t.id] = explicit;
        return;
      }
      if (key.startsWith('loop:')) {
        result[t.id] = wrapCurvature((i * 2) / n);
        return;
      }
      const slot = (i - (n - 1) / 2) * PARALLEL_SPREAD;
      const canonical = [t.from, t.to].sort()[0] === t.from;
      result[t.id] = canonical ? slot : -slot;
    });
  }
  return result;
}

function wrapCurvature(value: number): number {
  const wrapped = ((((value + 1) % 2) + 2) % 2) - 1;
  return Math.round(wrapped * 1000) / 1000;
}

/** Texto de la etiqueta: línea principal (label) y línea secundaria (event [condition] / action). */
export function transitionTexts(t: Transition): { primary?: string; secondary?: string } {
  const parts: string[] = [];
  if (t.event) parts.push(t.event);
  if (t.condition) parts.push('[' + t.condition + ']');
  if (t.action) parts.push('/ ' + t.action);
  const technical = parts.length > 0 ? parts.join(' ') : undefined;
  if (t.label) return { primary: t.label, secondary: technical };
  return { primary: technical };
}
