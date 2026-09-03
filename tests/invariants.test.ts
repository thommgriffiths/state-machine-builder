/**
 * Invariantes principales del sistema (ver requerimiento, sección 28).
 */
import { describe, expect, it } from 'vitest';
import {
  DomainError,
  addState,
  addTransition,
  moveState,
  moveStates,
  reconcileDocument,
  removeTransition,
  setTransitionStyle,
  setViewport,
  validateDocument,
  parseDocumentObject,
} from '../src/domain';
import { NODE_RADIUS, documentToFlow } from '../src/ui/adapter';
import { deepClone, fixtureDocument } from './fixtures';

const noSelection = { stateIds: new Set<string>(), transitionIds: new Set<string>() };

describe('Mover un estado no modifica ninguna transición', () => {
  it('conserva machine por identidad y por valor', () => {
    const doc = fixtureDocument();
    const before = deepClone(doc.machine);
    const moved = moveState(doc, 'B', { x: 1234, y: -50 });

    expect(moved.machine).toBe(doc.machine);
    expect(moved.machine).toEqual(before);
    expect(moved.layout.states.B).toEqual({ x: 1234, y: -50 });
    expect(moved.layout.states.A).toEqual(doc.layout.states.A);
    expect(moved.layout.states.C).toEqual(doc.layout.states.C);
    expect(moved.styles).toBe(doc.styles);
  });

  it('no muta el documento original', () => {
    const doc = fixtureDocument();
    const snapshot = deepClone(doc);
    moveState(doc, 'A', { x: 5, y: 5 });
    expect(doc).toEqual(snapshot);
  });
});

describe('Agregar un estado no modifica las coordenadas de estados existentes', () => {
  it('solo agrega la posición del estado nuevo', () => {
    const doc = fixtureDocument();
    const { document: next, stateId } = addState(doc, { label: 'Nuevo' });

    for (const id of Object.keys(doc.layout.states)) {
      expect(next.layout.states[id]).toEqual(doc.layout.states[id]);
    }
    expect(next.layout.states[stateId]).toBeDefined();
    expect(next.machine.states).toHaveLength(doc.machine.states.length + 1);
    expect(next.machine.transitions).toEqual(doc.machine.transitions);
  });

  it('respeta una posición explícita si se indica', () => {
    const doc = fixtureDocument();
    const { document: next, stateId } = addState(doc, { label: 'Nuevo', position: { x: 42, y: 84 } });
    expect(next.layout.states[stateId]).toEqual({ x: 42, y: 84 });
  });
});

describe('Agregar o eliminar una transición no mueve ningún estado', () => {
  it('addTransition conserva layout por identidad', () => {
    const doc = fixtureDocument();
    const { document: next } = addTransition(doc, { from: 'A', to: 'C', label: 'atajo' });
    expect(next.layout).toBe(doc.layout);
  });

  it('removeTransition conserva layout por identidad y por valor', () => {
    const doc = fixtureDocument();
    const next = removeTransition(doc, 't-ab');
    expect(next.layout).toBe(doc.layout);
    expect(next.layout).toEqual(fixtureDocument().layout);
    expect(next.machine.transitions.map((t) => t.id)).toEqual(['t-bc', 't-ba', 't-bb']);
  });
});

describe('Una transición continúa conectando los mismos IDs aunque ambos estados sean movidos', () => {
  it('mantiene from/to y la flecha sigue a los nodos', () => {
    const doc = fixtureDocument();
    const moved = moveStates(doc, { A: { x: 900, y: 600 }, B: { x: 100, y: 650 } });

    const transition = moved.machine.transitions.find((t) => t.id === 't-ab');
    expect(transition).toEqual({ id: 't-ab', from: 'A', to: 'B', label: 'ir a B', event: 'GO' });

    const { edges } = documentToFlow(moved, noSelection);
    const edge = edges.find((e) => e.id === 't-ab');
    expect(edge?.source).toBe('A');
    expect(edge?.target).toBe('B');

    // La punta de la flecha está sobre el borde de la NUEVA posición de B.
    const tip = edge?.data?.geometry.end;
    expect(tip).toBeDefined();
    const distance = Math.hypot((tip?.x ?? 0) - 100, (tip?.y ?? 0) - 650);
    expect(distance).toBeCloseTo(NODE_RADIUS, 6);
  });
});

describe('Una transición siempre apunta visualmente hacia su campo `to`', () => {
  it('la punta está en el borde del estado destino y su dirección apunta al centro de `to`', () => {
    const doc = fixtureDocument();
    const { edges } = documentToFlow(doc, noSelection);
    expect(edges.length).toBe(doc.machine.transitions.length);

    for (const edge of edges) {
      const transition = doc.machine.transitions.find((t) => t.id === edge.id);
      expect(transition).toBeDefined();
      expect(edge.target).toBe(transition?.to);
      const toCenter = doc.layout.states[transition?.to ?? ''];
      expect(toCenter).toBeDefined();
      const geometry = edge.data?.geometry;
      expect(geometry).toBeDefined();
      if (!geometry || !toCenter) continue;

      const distance = Math.hypot(geometry.end.x - toCenter.x, geometry.end.y - toCenter.y);
      expect(distance).toBeCloseTo(NODE_RADIUS, 6);

      const towardsCenter = {
        x: (toCenter.x - geometry.end.x) / distance,
        y: (toCenter.y - geometry.end.y) / distance,
      };
      const dot = towardsCenter.x * geometry.endDirection.x + towardsCenter.y * geometry.endDirection.y;
      expect(dot).toBeCloseTo(1, 6);
      expect(geometry.arrowhead[0]).toEqual(geometry.end);
    }
  });

  it('invertir from/to mueve la punta al otro estado sin tocar posiciones', () => {
    const doc = fixtureDocument();
    const swapped = {
      ...doc,
      machine: {
        ...doc.machine,
        transitions: doc.machine.transitions.map((t) => (t.id === 't-ab' ? { ...t, from: 'B', to: 'A' } : t)),
      },
    };
    const original = documentToFlow(doc, noSelection).edges.find((e) => e.id === 't-ab');
    const inverted = documentToFlow(swapped, noSelection).edges.find((e) => e.id === 't-ab');

    const distOriginalToB = Math.hypot((original?.data?.geometry.end.x ?? 0) - 400, (original?.data?.geometry.end.y ?? 0) - 100);
    const distInvertedToA = Math.hypot((inverted?.data?.geometry.end.x ?? 0) - 100, (inverted?.data?.geometry.end.y ?? 0) - 100);
    expect(distOriginalToB).toBeCloseTo(NODE_RADIUS, 6);
    expect(distInvertedToA).toBeCloseTo(NODE_RADIUS, 6);
    expect(swapped.layout).toBe(doc.layout);
  });
});

describe('Un estado nuevo sin layout recibe automáticamente una posición', () => {
  it('reconcile posiciona solo el estado nuevo y conserva los demás', () => {
    const doc = fixtureDocument();
    const withD: typeof doc = {
      ...doc,
      machine: {
        ...doc.machine,
        states: [...doc.machine.states, { id: 'D', label: 'D', type: 'normal' }],
        transitions: [...doc.machine.transitions, { id: 't-cd', from: 'C', to: 'D' }],
      },
    };
    expect(withD.layout.states.D).toBeUndefined();

    const { document: reconciled, report } = reconcileDocument(withD);

    expect(report.placedStates).toEqual(['D']);
    expect(reconciled.layout.states.D).toBeDefined();
    // Los estados existentes conservan exactamente sus coordenadas.
    expect(reconciled.layout.states.A).toEqual({ x: 100, y: 100 });
    expect(reconciled.layout.states.B).toEqual({ x: 400, y: 100 });
    expect(reconciled.layout.states.C).toEqual({ x: 700, y: 100 });
    // El nuevo queda a la derecha de su predecesor C.
    expect(reconciled.layout.states.D?.x ?? 0).toBeGreaterThan(700);
    // Y la transición C -> D aparece en la vista.
    const { edges } = documentToFlow(reconciled, noSelection);
    expect(edges.find((e) => e.id === 't-cd')?.target).toBe('D');
  });

  it('parseDocumentObject acepta un documento con solo `machine` (sin layout ni styles)', () => {
    const result = parseDocumentObject({
      version: 2,
      machine: {
        id: 'm',
        name: 'Solo máquina',
        initialStateId: 's1',
        states: [
          { id: 's1', label: 'Uno' },
          { id: 's2', label: 'Dos', type: 'final' },
        ],
        transitions: [{ id: 't1', from: 's1', to: 's2', event: 'NEXT', condition: null, action: null }],
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.placedStates).toEqual(['s1', 's2']);
    expect(result.document.layout.states.s1).toBeDefined();
    expect(result.document.layout.states.s2).toBeDefined();
    expect(result.document.styles.defaults).toEqual({ stateColor: '#000000', transitionColor: '#000000' });
    expect(result.document.machine.transitions[0]).toEqual({ id: 't1', from: 's1', to: 's2', event: 'NEXT' });
  });
});

describe('Mover varios estados a la vez preserva la semántica y las distancias relativas', () => {
  it('aplica el mismo delta a todos los seleccionados y no toca las transiciones', () => {
    const doc = fixtureDocument();
    const before = deepClone(doc.machine);
    const seleccionados = ['A', 'B'];
    const delta = { x: 250, y: -80 };

    const positions = Object.fromEntries(
      seleccionados.map((id) => {
        const p = doc.layout.states[id];
        if (!p) throw new Error('falta layout de ' + id);
        return [id, { x: p.x + delta.x, y: p.y + delta.y }];
      }),
    );
    const moved = moveStates(doc, positions);

    // La semántica no se toca en absoluto.
    expect(moved.machine).toBe(doc.machine);
    expect(moved.machine).toEqual(before);
    expect(moved.styles).toBe(doc.styles);

    // Cada estado movido recibió exactamente el mismo desplazamiento...
    for (const id of seleccionados) {
      expect(moved.layout.states[id]).toEqual({
        x: (doc.layout.states[id]?.x ?? 0) + delta.x,
        y: (doc.layout.states[id]?.y ?? 0) + delta.y,
      });
    }
    // ...y la distancia relativa entre ellos se conserva.
    const dist = (d: typeof doc, a: string, b: string) =>
      Math.hypot((d.layout.states[a]?.x ?? 0) - (d.layout.states[b]?.x ?? 0), (d.layout.states[a]?.y ?? 0) - (d.layout.states[b]?.y ?? 0));
    expect(dist(moved, 'A', 'B')).toBeCloseTo(dist(doc, 'A', 'B'), 9);

    // Los estados no seleccionados se quedan donde estaban.
    expect(moved.layout.states.C).toEqual(doc.layout.states.C);
  });

  it('las flechas siguen a todos los estados movidos', () => {
    const doc = fixtureDocument();
    const moved = moveStates(doc, { A: { x: -300, y: 900 }, B: { x: 40, y: 950 } });
    const edge = documentToFlow(moved, noSelection).edges.find((e) => e.id === 't-ab');

    expect(edge?.source).toBe('A');
    expect(edge?.target).toBe('B');
    const tip = edge?.data?.geometry.end;
    expect(Math.hypot((tip?.x ?? 0) - 40, (tip?.y ?? 0) - 950)).toBeCloseTo(NODE_RADIUS, 6);
  });
});

describe('Desplazar la cámara no modifica el modelo ni las posiciones de los estados', () => {
  it('setViewport solo toca layout.viewport', () => {
    const doc = fixtureDocument();
    const snapshot = deepClone(doc);
    const panned = setViewport(doc, { x: -640, y: 220, zoom: 1.75 });

    expect(panned.layout.viewport).toEqual({ x: -640, y: 220, zoom: 1.75 });
    // La semántica, las coordenadas de los estados y los estilos quedan intactos.
    expect(panned.machine).toBe(doc.machine);
    expect(panned.layout.states).toBe(doc.layout.states);
    expect(panned.styles).toBe(doc.styles);
    expect(doc).toEqual(snapshot);
  });

  it('quitar el viewport tampoco toca nada más', () => {
    const doc = setViewport(fixtureDocument(), { x: 10, y: 20, zoom: 2 });
    const cleared = setViewport(doc, undefined);
    expect(cleared.layout.viewport).toBeUndefined();
    expect(cleared.layout.states).toEqual(fixtureDocument().layout.states);
    expect(cleared.machine).toBe(doc.machine);
  });
});

describe('Cambiar el color de una transición no cambia su semántica', () => {
  it('machine se conserva por identidad', () => {
    const doc = fixtureDocument();
    const next = setTransitionStyle(doc, 't-ab', { color: '#D32F2F' });
    expect(next.machine).toBe(doc.machine);
    expect(next.layout).toBe(doc.layout);
    expect(next.styles.transitions['t-ab']).toEqual({ color: '#D32F2F' });
  });
});

describe('Cambiar la curvatura no modifica from ni to', () => {
  it('solo cambia styles.transitions[id].curvature', () => {
    const doc = fixtureDocument();
    const next = setTransitionStyle(doc, 't-ab', { curvature: -0.4 });
    const transition = next.machine.transitions.find((t) => t.id === 't-ab');
    expect(transition?.from).toBe('A');
    expect(transition?.to).toBe('B');
    expect(next.machine).toBe(doc.machine);
    expect(next.styles.transitions['t-ab']?.curvature).toBe(-0.4);
  });

  it('rechaza curvaturas fuera de rango', () => {
    const doc = fixtureDocument();
    expect(() => setTransitionStyle(doc, 't-ab', { curvature: 3 })).toThrow(DomainError);
  });
});

describe('Una transición hacia un ID inexistente es rechazada por validación', () => {
  it('validateDocument reporta UNKNOWN_TO_STATE', () => {
    const doc = fixtureDocument();
    doc.machine.transitions.push({ id: 't-bad', from: 'A', to: 'NO-EXISTE' });
    const issues = validateDocument(doc);
    const issue = issues.find((i) => i.code === 'UNKNOWN_TO_STATE');
    expect(issue?.severity).toBe('error');
    expect(issue?.elementId).toBe('t-bad');
  });

  it('parseDocumentObject devuelve ok=false', () => {
    const doc = fixtureDocument();
    doc.machine.transitions.push({ id: 't-bad', from: 'NO-EXISTE', to: 'A' });
    const result = parseDocumentObject(doc);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((i) => i.code === 'UNKNOWN_FROM_STATE')).toBe(true);
  });

  it('addTransition lanza DomainError', () => {
    const doc = fixtureDocument();
    expect(() => addTransition(doc, { from: 'A', to: 'ZZZ' })).toThrow(DomainError);
  });
});
