import { describe, expect, it } from 'vitest';
import { DEFAULT_PLACEMENT_OPTIONS, computeAutoLayout, placeNewStates, reconcileDocument } from '../src/domain';
import type { StateMachineDocument } from '../src/domain';
import { fixtureDocument } from './fixtures';

function withStates(doc: StateMachineDocument, ids: string[], transitions: Array<[string, string]>): StateMachineDocument {
  return {
    ...doc,
    machine: {
      ...doc.machine,
      states: [...doc.machine.states, ...ids.map((id) => ({ id, label: id, type: 'normal' as const }))],
      transitions: [
        ...doc.machine.transitions,
        ...transitions.map(([from, to], i) => ({ id: 'new-' + i, from, to })),
      ],
    },
  };
}

function minDistanceBetween(positions: Record<string, { x: number; y: number }>): number {
  const values = Object.values(positions);
  let min = Number.POSITIVE_INFINITY;
  for (let i = 0; i < values.length; i += 1) {
    for (let j = i + 1; j < values.length; j += 1) {
      const a = values[i];
      const b = values[j];
      if (a && b) min = Math.min(min, Math.hypot(a.x - b.x, a.y - b.y));
    }
  }
  return min;
}

describe('placeNewStates', () => {
  it('coloca un sucesor a la derecha de su predecesor, sin solaparse', () => {
    const doc = withStates(fixtureDocument(), ['D'], [['C', 'D']]);
    const layout = placeNewStates(doc, ['D']);
    expect(layout.states.D?.x).toBe(700 + DEFAULT_PLACEMENT_OPTIONS.spacingX);
    expect(layout.states.D?.y).toBe(100);
    expect(minDistanceBetween(layout.states)).toBeGreaterThanOrEqual(DEFAULT_PLACEMENT_OPTIONS.minDistance);
  });

  it('coloca un predecesor a la izquierda de su sucesor', () => {
    const doc = withStates(fixtureDocument(), ['Z'], [['Z', 'A']]);
    const layout = placeNewStates(doc, ['Z']);
    expect(layout.states.Z?.x).toBe(100 - DEFAULT_PLACEMENT_OPTIONS.spacingX);
  });

  it('evita choques buscando un hueco cercano', () => {
    // D quiere ir a x=300 (a la derecha de A) pero B está en 400 y la distancia mínima es 120.
    const doc = withStates(fixtureDocument(), ['D'], [['A', 'D']]);
    const layout = placeNewStates(doc, ['D'], { spacingX: 300 });
    const d = layout.states.D;
    expect(d).toBeDefined();
    expect(minDistanceBetween(layout.states)).toBeGreaterThanOrEqual(DEFAULT_PLACEMENT_OPTIONS.minDistance);
  });

  it('coloca una cadena de estados nuevos en orden y sin solaparse', () => {
    const doc = withStates(fixtureDocument(), ['D', 'E', 'F'], [['C', 'D'], ['D', 'E'], ['E', 'F']]);
    const layout = placeNewStates(doc, ['D', 'E', 'F']);
    expect(layout.states.D?.x ?? 0).toBeLessThan(layout.states.E?.x ?? 0);
    expect(layout.states.E?.x ?? 0).toBeLessThan(layout.states.F?.x ?? 0);
    expect(minDistanceBetween(layout.states)).toBeGreaterThanOrEqual(DEFAULT_PLACEMENT_OPTIONS.minDistance);
  });

  it('coloca estados aislados en una columna nueva a la derecha', () => {
    const doc = withStates(fixtureDocument(), ['solo'], []);
    const layout = placeNewStates(doc, ['solo']);
    expect(layout.states.solo?.x ?? 0).toBeGreaterThan(700);
  });

  it('usa el origen cuando el lienzo está vacío', () => {
    const doc: StateMachineDocument = {
      ...fixtureDocument(),
      machine: { id: 'm', name: 'm', initialStateId: 'a', states: [{ id: 'a', label: 'a', type: 'normal' }], transitions: [], parents: [] },
      layout: { states: {} },
    };
    const layout = placeNewStates(doc, ['a']);
    expect(layout.states.a).toEqual(DEFAULT_PLACEMENT_OPTIONS.origin);
  });

  it('es determinista', () => {
    const doc = withStates(fixtureDocument(), ['D', 'E'], [['C', 'D'], ['C', 'E']]);
    expect(placeNewStates(doc, ['D', 'E'])).toEqual(placeNewStates(doc, ['D', 'E']));
  });
});

describe('reconcileDocument', () => {
  it('elimina metadata huérfana y lo informa', () => {
    const doc = fixtureDocument();
    doc.layout.states.ZZ = { x: 1, y: 1 };
    doc.styles.states.YY = { color: '#fff' };
    doc.styles.transitions.XX = { curvature: 0.1 };
    doc.styles.parents.WW = { color: '#fff' };
    const { document, report } = reconcileDocument(doc);
    expect(report).toEqual({
      placedStates: [],
      prunedLayoutStates: ['ZZ'],
      prunedStateStyles: ['YY'],
      prunedTransitionStyles: ['XX'],
      prunedParentStyles: ['WW'],
    });
    expect(document.layout.states.ZZ).toBeUndefined();
    expect(document.layout.states.A).toEqual({ x: 100, y: 100 });
  });

  it('no mueve nada cuando no hay nada que reconciliar', () => {
    const doc = fixtureDocument();
    const { document, report } = reconcileDocument(doc);
    expect(document.layout.states).toEqual(doc.layout.states);
    expect(report.placedStates).toEqual([]);
  });
});

describe('computeAutoLayout (herramienta explícita)', () => {
  it('devuelve una posición para cada estado y es determinista', () => {
    const doc = fixtureDocument();
    const positions = computeAutoLayout(doc.machine);
    expect(Object.keys(positions).sort()).toEqual(['A', 'B', 'C']);
    expect(computeAutoLayout(doc.machine)).toEqual(positions);
    // De izquierda a derecha siguiendo el flujo A -> B -> C.
    expect(positions.A?.x ?? 0).toBeLessThan(positions.B?.x ?? 0);
    expect(positions.B?.x ?? 0).toBeLessThan(positions.C?.x ?? 0);
  });
});
