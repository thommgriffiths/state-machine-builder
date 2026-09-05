/**
 * Adaptador Documento -> React Flow.
 *
 * Único punto donde el modelo de dominio se traduce a las estructuras de la
 * librería gráfica. Nada de lo que produce se persiste. Si se cambiara la
 * librería, solo habría que reescribir este archivo y los componentes de UI.
 *
 * Los estados padre plegados son un caso puramente de presentación: el
 * documento no sabe nada de ellos. Un padre plegado se dibuja como un único
 * nodo en el centroide de su figura, sus subestados no se dibujan, y las
 * transiciones se remapean: las que entran o salen de un subestado apuntan al
 * nodo plegado, y las internas al grupo se ocultan.
 */
import type { Edge, Node } from '@xyflow/react';
import type { LineStyle, Position, StateMachineDocument, Transition } from '../../domain';
import { ARROW_LENGTH, ARROW_WIDTH, NODE_BOX, NODE_RADIUS, PARALLEL_SPREAD, SELF_LOOP_SIZE } from './constants';
import { computeTransitionGeometry, type TransitionGeometry } from './geometry';
import { computeParentGroups } from './groups';

export interface StateNodeData extends Record<string, unknown> {
  stateId: string;
  label: string;
  subtitle?: string;
  isInitial: boolean;
  isFinal: boolean;
  color: string;
}

/** Nodo que reemplaza a un estado padre plegado. */
export interface CollapsedParentNodeData extends Record<string, unknown> {
  parentId: string;
  label: string;
  substateCount: number;
  /** El estado inicial está adentro: el marcador de entrada se dibuja sobre el nodo plegado. */
  containsInitial: boolean;
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
export type CollapsedParentFlowNode = Node<CollapsedParentNodeData, 'parent'>;
export type FlowNode = StateFlowNode | CollapsedParentFlowNode;
export type TransitionFlowEdge = Edge<TransitionEdgeData, 'transition'>;

export interface FlowSelection {
  stateIds: ReadonlySet<string>;
  transitionIds: ReadonlySet<string>;
  /** Padres plegados. Estado de la vista, no del documento. */
  collapsedParentIds?: ReadonlySet<string>;
}

export interface FlowModel {
  nodes: FlowNode[];
  edges: TransitionFlowEdge[];
}

/** Extremos de una transición tal como se dibujan (tras remapear los plegados). */
export interface EffectiveEndpoints {
  id: string;
  from: string;
  to: string;
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

/**
 * Transiciones con sus extremos remapeados por los padres plegados, y sin las
 * que quedan enteras dentro de un mismo grupo plegado (incluidos los bucles
 * sobre un subestado plegado).
 */
export function effectiveTransitions(doc: StateMachineDocument, collapsed: ReadonlySet<string>): EffectiveEndpoints[] {
  const collapsedParentOf = new Map<string, string>();
  for (const s of doc.machine.states) {
    if (s.parentId !== undefined && collapsed.has(s.parentId)) collapsedParentOf.set(s.id, s.parentId);
  }
  const result: EffectiveEndpoints[] = [];
  for (const t of doc.machine.transitions) {
    const pf = collapsedParentOf.get(t.from);
    const pt = collapsedParentOf.get(t.to);
    if (pf !== undefined && pf === pt) continue; // interna al grupo plegado: no se dibuja
    result.push({ id: t.id, from: pf ?? t.from, to: pt ?? t.to });
  }
  return result;
}

export function documentToFlow(doc: StateMachineDocument, selection: FlowSelection): FlowModel {
  const { machine, layout, styles } = doc;
  const collapsed = selection.collapsedParentIds ?? new Set<string>();
  const centers = new Map<string, Position>();
  const nodes: FlowNode[] = [];

  machine.states.forEach((state, index) => {
    if (state.parentId !== undefined && collapsed.has(state.parentId)) return; // plegado: no se dibuja
    // Todo estado debería tener posición tras la reconciliación; el fallback
    // solo evita romper el render si alguien saltó ese paso.
    const center = layout.states[state.id] ?? { x: 200 + index * 200, y: 200 };
    centers.set(state.id, center);
    nodes.push({
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
        subtitle: state.subtitle,
        isInitial: machine.initialStateId === state.id,
        isFinal: state.type === 'final',
        color: styles.states[state.id]?.color ?? styles.defaults.stateColor,
      },
    });
  });

  if (collapsed.size > 0) {
    for (const shape of computeParentGroups(doc)) {
      if (!collapsed.has(shape.parentId)) continue;
      centers.set(shape.parentId, shape.centroid);
      nodes.push({
        id: shape.parentId,
        type: 'parent',
        position: centerToNodePosition(shape.centroid),
        width: NODE_BOX,
        height: NODE_BOX,
        measured: { width: NODE_BOX, height: NODE_BOX },
        // Arrastrarlo mueve a todos sus subestados; seleccionarlo no tiene
        // sentido porque no es un elemento del modelo.
        draggable: true,
        selectable: false,
        data: {
          parentId: shape.parentId,
          label: shape.label,
          substateCount: shape.substateCount,
          containsInitial: machine.states.some((s) => s.parentId === shape.parentId && s.id === machine.initialStateId),
          color: styles.defaults.stateColor,
        },
      });
    }
  }

  const effective = effectiveTransitions(doc, collapsed);
  const curvatures = resolveCurvatures(doc, effective);
  const byId = new Map(machine.transitions.map((t) => [t.id, t]));

  const edges: TransitionFlowEdge[] = effective
    .filter((e) => centers.has(e.from) && centers.has(e.to))
    .map((e) => {
      const transition = byId.get(e.id) as Transition;
      const from = centers.get(e.from) as Position;
      const to = centers.get(e.to) as Position;
      const style = styles.transitions[e.id];
      const geometry = computeTransitionGeometry(from, to, {
        radius: NODE_RADIUS,
        curvature: curvatures[e.id] ?? 0,
        arrowLength: ARROW_LENGTH,
        arrowWidth: ARROW_WIDTH,
        loopSize: SELF_LOOP_SIZE,
      });
      const texts = transitionTexts(transition);
      return {
        id: e.id,
        type: 'transition',
        source: e.from,
        target: e.to,
        selected: selection.transitionIds.has(e.id),
        data: {
          transitionId: e.id,
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
 * automática que separa transiciones entre el mismo par de extremos (en
 * cualquier sentido) y distribuye los bucles de un mismo nodo.
 *
 * Se calcula sobre los extremos tal como se dibujan: al plegar un grupo, varias
 * transiciones pueden pasar a compartir extremos y necesitan separarse.
 */
export function resolveCurvatures(
  doc: StateMachineDocument,
  endpoints: ReadonlyArray<EffectiveEndpoints> = doc.machine.transitions,
): Record<string, number> {
  const result: Record<string, number> = {};
  const groups = new Map<string, EffectiveEndpoints[]>();
  for (const t of endpoints) {
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
