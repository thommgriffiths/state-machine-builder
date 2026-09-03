/**
 * Posicionamiento automático de estados NUEVOS.
 *
 * Solo asigna coordenadas a los estados indicados. Los estados que ya tienen
 * posición conservan exactamente sus coordenadas. Nunca es un relayout global
 * (para eso existe autolayout.ts, que solo se ejecuta a pedido del usuario).
 *
 * Heurística (determinista):
 *  1. Si el estado tiene predecesores posicionados: a la derecha del más a la
 *     derecha, a la altura promedio de sus vecinos.
 *  2. Si solo tiene sucesores posicionados: a la izquierda del más a la izquierda.
 *  3. Si está aislado (o sus vecinos tampoco tienen posición): en una columna
 *     nueva a la derecha del diagrama, o en el origen si el lienzo está vacío.
 *  4. Si el candidato choca con otro nodo, se busca el hueco libre más cercano
 *     en anillos crecientes (primero vertical, luego horizontal y diagonales).
 */
import type { Layout, Position, StateMachineDocument } from './types';

export interface PlacementOptions {
  /** Separación horizontal entre columnas de estados. */
  spacingX: number;
  /** Separación vertical entre filas de estados. */
  spacingY: number;
  /** Distancia mínima entre centros para considerar que dos nodos no chocan. */
  minDistance: number;
  /** Posición del primer estado cuando el lienzo está vacío. */
  origin: Position;
}

export const DEFAULT_PLACEMENT_OPTIONS: PlacementOptions = {
  spacingX: 220,
  spacingY: 140,
  minDistance: 120,
  origin: { x: 200, y: 200 },
};

/**
 * Devuelve un layout nuevo con posiciones para `stateIds` (los que aún no la
 * tengan). Las entradas existentes se copian sin modificar.
 */
export function placeNewStates(
  doc: StateMachineDocument,
  stateIds: readonly string[],
  options: Partial<PlacementOptions> = {},
): Layout {
  const opts = { ...DEFAULT_PLACEMENT_OPTIONS, ...options };
  const positions: Record<string, Position> = { ...doc.layout.states };
  const known = new Set(doc.machine.states.map((s) => s.id));

  // Orden determinista: el orden en machine.states.
  const wanted = new Set(stateIds);
  let pending = doc.machine.states.map((s) => s.id).filter((id) => wanted.has(id) && known.has(id) && !positions[id]);

  const placeAt = (id: string, candidate: Position) => {
    positions[id] = findFreeSpot(candidate, Object.values(positions), opts);
  };

  while (pending.length > 0) {
    let progressed = false;
    for (const id of [...pending]) {
      const preds: Position[] = [];
      const succs: Position[] = [];
      for (const t of doc.machine.transitions) {
        if (t.to === id && t.from !== id) {
          const p = positions[t.from];
          if (p) preds.push(p);
        }
        if (t.from === id && t.to !== id) {
          const p = positions[t.to];
          if (p) succs.push(p);
        }
      }
      if (preds.length === 0 && succs.length === 0) continue;

      const neighbours = [...preds, ...succs];
      const avgY = neighbours.reduce((acc, p) => acc + p.y, 0) / neighbours.length;
      const candidate: Position =
        preds.length > 0
          ? { x: Math.max(...preds.map((p) => p.x)) + opts.spacingX, y: avgY }
          : { x: Math.min(...succs.map((p) => p.x)) - opts.spacingX, y: avgY };

      placeAt(id, candidate);
      pending = pending.filter((p) => p !== id);
      progressed = true;
    }

    if (!progressed) {
      // Ningún pendiente tiene vecinos posicionados: columna nueva a la derecha.
      const id = pending[0] as string;
      const placed = Object.values(positions);
      let candidate: Position;
      if (placed.length === 0) {
        candidate = { ...opts.origin };
      } else {
        const maxX = Math.max(...placed.map((p) => p.x));
        const minY = Math.min(...placed.map((p) => p.y));
        const maxY = Math.max(...placed.map((p) => p.y));
        candidate = { x: maxX + opts.spacingX, y: (minY + maxY) / 2 };
      }
      placeAt(id, candidate);
      pending = pending.filter((p) => p !== id);
    }
  }

  return { ...doc.layout, states: positions };
}

/** Busca la posición libre más cercana al candidato (anillos crecientes). */
export function findFreeSpot(candidate: Position, taken: readonly Position[], opts: PlacementOptions): Position {
  const rounded = { x: Math.round(candidate.x), y: Math.round(candidate.y) };
  if (isFree(rounded, taken, opts.minDistance)) return rounded;

  const stepX = opts.spacingX * 0.5;
  const stepY = opts.spacingY;
  for (let ring = 1; ring <= 40; ring += 1) {
    const offsets: Array<[number, number]> = [
      [0, ring],
      [0, -ring],
      [ring, 0],
      [-ring, 0],
      [ring, ring],
      [ring, -ring],
      [-ring, ring],
      [-ring, -ring],
    ];
    for (const [dx, dy] of offsets) {
      const p = { x: Math.round(rounded.x + dx * stepX), y: Math.round(rounded.y + dy * stepY) };
      if (isFree(p, taken, opts.minDistance)) return p;
    }
  }
  return { x: rounded.x, y: rounded.y + 41 * stepY };
}

function isFree(p: Position, taken: readonly Position[], minDistance: number): boolean {
  return taken.every((q) => Math.hypot(q.x - p.x, q.y - p.y) >= minDistance);
}
