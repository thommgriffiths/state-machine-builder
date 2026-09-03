/**
 * Auto-layout GLOBAL (herramienta auxiliar).
 *
 * Calcula posiciones para todos los estados con Dagre (grafo dirigido por
 * capas, izquierda -> derecha). Es una operación explícita del usuario
 * ("Reorganizar diagrama"): nunca se ejecuta como consecuencia de editar la
 * máquina. Devuelve solo posiciones; aplicar el resultado es decisión de quien
 * llama (ver operations.applyLayout).
 */
import dagre from '@dagrejs/dagre';
import type { Machine, Position } from './types';

export interface AutoLayoutOptions {
  direction: 'LR' | 'TB';
  nodeWidth: number;
  nodeHeight: number;
  nodeSeparation: number;
  rankSeparation: number;
  margin: number;
}

export const DEFAULT_AUTOLAYOUT_OPTIONS: AutoLayoutOptions = {
  direction: 'LR',
  nodeWidth: 150,
  nodeHeight: 120,
  nodeSeparation: 40,
  rankSeparation: 90,
  margin: 120,
};

export function computeAutoLayout(machine: Machine, options: Partial<AutoLayoutOptions> = {}): Record<string, Position> {
  const opts = { ...DEFAULT_AUTOLAYOUT_OPTIONS, ...options };
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({
    rankdir: opts.direction,
    nodesep: opts.nodeSeparation,
    ranksep: opts.rankSeparation,
    marginx: opts.margin,
    marginy: opts.margin,
  });
  graph.setDefaultEdgeLabel(() => ({}));

  for (const state of machine.states) {
    graph.setNode(state.id, { width: opts.nodeWidth, height: opts.nodeHeight });
  }
  const stateIds = new Set(machine.states.map((s) => s.id));
  for (const transition of machine.transitions) {
    if (transition.from === transition.to) continue;
    if (!stateIds.has(transition.from) || !stateIds.has(transition.to)) continue;
    graph.setEdge(transition.from, transition.to);
  }

  dagre.layout(graph);

  const positions: Record<string, Position> = {};
  for (const state of machine.states) {
    const node = graph.node(state.id);
    positions[state.id] = { x: Math.round(node.x), y: Math.round(node.y) };
  }
  return positions;
}
