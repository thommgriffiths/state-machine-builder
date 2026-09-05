/**
 * Envolvente de los estados padre: geometría derivada de las posiciones de sus
 * subestados. El documento no guarda nada de esto.
 */
import { describe, expect, it } from 'vitest';
import { addParent, addState, setStateParent } from '../src/domain';
import type { StateMachineDocument } from '../src/domain';
import { GROUP_PAD, computeParentGroups, convexHull, distanceToHull } from '../src/ui/adapter';
import { fixtureDocument } from './fixtures';

/** A (100,100) y B (400,100) dentro de un padre; C (700,100) queda afuera. */
function conGrupo(): { doc: StateMachineDocument; parentId: string } {
  const { document, parentId } = addParent(fixtureDocument(), { label: 'Antecedentes' });
  return { doc: setStateParent(setStateParent(document, 'A', parentId), 'B', parentId), parentId };
}

describe('computeParentGroups', () => {
  it('envuelve a los subestados y no a los demás', () => {
    const { doc, parentId } = conGrupo();
    const [forma] = computeParentGroups(doc);

    expect(forma?.parentId).toBe(parentId);
    expect(forma?.label).toBe('Antecedentes');
    expect(forma?.substateCount).toBe(2);
    expect(forma?.intruders).toEqual([]);
    // C está en x=700, lejos del grupo A(100)–B(400).
    expect(distanceToHull({ x: 700, y: 100 }, forma!.hull)).toBeGreaterThan(GROUP_PAD);
  });

  it('la forma sigue a los subestados cuando se mueven, sin tocar el documento', () => {
    const { doc } = conGrupo();
    const antes = computeParentGroups(doc)[0]!;
    const movido: StateMachineDocument = {
      ...doc,
      layout: { ...doc.layout, states: { ...doc.layout.states, B: { x: 400, y: 340 } } },
    };
    const despues = computeParentGroups(movido)[0]!;

    expect(despues.bounds.height - antes.bounds.height).toBe(240);
    expect(despues.bounds.width).toBe(antes.bounds.width);
    // El padre nunca tiene entrada propia en el layout: la forma es derivada.
    expect(Object.keys(movido.layout.states)).not.toContain(antes.parentId);
  });

  it('un padre sin subestados no produce forma', () => {
    const { document } = addParent(fixtureDocument(), { label: 'Vacío' });
    expect(computeParentGroups(document)).toEqual([]);
  });

  it('un documento sin padres no produce formas', () => {
    expect(computeParentGroups(fixtureDocument())).toEqual([]);
  });

  it('cada padre produce su propia forma', () => {
    const { doc, parentId } = conGrupo();
    const { document, parentId: segundo } = addParent(doc, { label: 'Otro' });
    const conDos = setStateParent(document, 'C', segundo);
    const formas = computeParentGroups(conDos);
    expect(formas.map((f) => f.parentId)).toEqual([parentId, segundo]);
    expect(formas[1]?.substateCount).toBe(1);
  });
});

describe('un ajeno no queda encerrado por el hueco entre subestados', () => {
  /**
   * El caso real que motivó la regla: en el circuito 6019 el grupo Antecedentes
   * son P01(520,320), T6291(260,520), T6289(780,520) y T6290(520,700), y
   * T5069(200,320) NO le pertenece. Con un rectángulo envolvente (x de 178 a
   * 862, y de 240 a 798) T5069 quedaba adentro.
   */
  function circuito(): StateMachineDocument {
    let doc = fixtureDocument();
    doc = { ...doc, machine: { ...doc.machine, states: [], transitions: [], initialStateId: null }, layout: { states: {} } };
    const posiciones: Record<string, { x: number; y: number }> = {
      P01: { x: 520, y: 320 },
      T6291: { x: 260, y: 520 },
      T6289: { x: 780, y: 520 },
      T6290: { x: 520, y: 700 },
      T5069: { x: 200, y: 320 },
    };
    for (const [id, position] of Object.entries(posiciones)) {
      doc = addState(doc, { id, label: id, position }).document;
    }
    const { document, parentId } = addParent(doc, { label: 'Antecedentes' });
    let conPadre = document;
    for (const id of ['P01', 'T6291', 'T6289', 'T6290']) conPadre = setStateParent(conPadre, id, parentId);
    return conPadre;
  }

  it('T5069 queda fuera de la envolvente, aunque caiga dentro del rectángulo envolvente', () => {
    const doc = circuito();
    const [forma] = computeParentGroups(doc);

    // Dentro del rectángulo envolvente de los cuatro subestados...
    const xs = ['P01', 'T6291', 'T6289', 'T6290'].map((id) => doc.layout.states[id]!.x);
    const ys = ['P01', 'T6291', 'T6289', 'T6290'].map((id) => doc.layout.states[id]!.y);
    const t5069 = doc.layout.states.T5069!;
    expect(t5069.x).toBeGreaterThan(Math.min(...xs) - 100);
    expect(t5069.y).toBeGreaterThanOrEqual(Math.min(...ys));

    // ...pero fuera de la forma que se dibuja.
    expect(forma?.intruders).toEqual([]);
    expect(distanceToHull(t5069, forma!.hull)).toBeGreaterThan(GROUP_PAD);
  });

  it('si un ajeno se mete en el medio del grupo, se detecta y se informa', () => {
    const doc = circuito();
    const enElMedio: StateMachineDocument = {
      ...doc,
      layout: { ...doc.layout, states: { ...doc.layout.states, T5069: { x: 520, y: 500 } } },
    };
    const [forma] = computeParentGroups(enElMedio);
    expect(forma?.intruders).toEqual(['T5069']);
  });
});

describe('convexHull', () => {
  it('descarta los puntos interiores', () => {
    const hull = convexHull([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 5, y: 5 },
    ]);
    expect(hull).toHaveLength(4);
    expect(hull).not.toContainEqual({ x: 5, y: 5 });
  });

  it('tolera pocos puntos', () => {
    expect(convexHull([])).toEqual([]);
    expect(convexHull([{ x: 1, y: 1 }])).toEqual([{ x: 1, y: 1 }]);
    expect(convexHull([{ x: 1, y: 1 }, { x: 2, y: 2 }])).toHaveLength(2);
  });
});

describe('distanceToHull', () => {
  const cuadrado = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];

  it('da 0 dentro y la distancia al lado más cercano fuera', () => {
    expect(distanceToHull({ x: 50, y: 50 }, cuadrado)).toBe(0);
    expect(distanceToHull({ x: 130, y: 50 }, cuadrado)).toBe(30);
    expect(distanceToHull({ x: 50, y: -20 }, cuadrado)).toBe(20);
  });
});
