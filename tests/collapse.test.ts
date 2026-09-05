/**
 * Padres plegados: presentación pura. El documento no cambia; el adaptador
 * reemplaza a los subestados por un nodo en el centroide de la figura y
 * remapea las transiciones que cruzan el borde del grupo.
 */
import { describe, expect, it } from 'vitest';
import { addParent, addState, setStateParent } from '../src/domain';
import type { StateMachineDocument } from '../src/domain';
import {
  NODE_BOX,
  computeParentGroups,
  documentToFlow,
  effectiveTransitions,
  nodePositionToCenter,
  polygonCentroid,
  resolveCurvatures,
  substatePositionsForGroupMove,
} from '../src/ui/adapter';
import { fixtureDocument } from './fixtures';

/** A y B dentro de un padre; C suelto. Transiciones: A->B, B->C, B->A, B->B. */
function conGrupo(): { doc: StateMachineDocument; parentId: string } {
  const { document, parentId } = addParent(fixtureDocument(), { label: 'Grupo' });
  return { doc: setStateParent(setStateParent(document, 'A', parentId), 'B', parentId), parentId };
}

const sinSeleccion = { stateIds: new Set<string>(), transitionIds: new Set<string>() };

describe('polygonCentroid', () => {
  it('el centroide de un cuadrado es su centro', () => {
    const c = polygonCentroid([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ]);
    expect(c.x).toBeCloseTo(50);
    expect(c.y).toBeCloseTo(50);
  });

  it('el centroide de un triángulo es el promedio de sus vértices', () => {
    const c = polygonCentroid([
      { x: 0, y: 0 },
      { x: 90, y: 0 },
      { x: 0, y: 60 },
    ]);
    expect(c.x).toBeCloseTo(30);
    expect(c.y).toBeCloseTo(20);
  });

  it('no depende de la orientación del polígono', () => {
    const horario = polygonCentroid([
      { x: 0, y: 0 },
      { x: 0, y: 40 },
      { x: 100, y: 40 },
      { x: 100, y: 0 },
    ]);
    expect(horario.x).toBeCloseTo(50);
    expect(horario.y).toBeCloseTo(20);
  });

  it('no es el promedio de los vértices cuando están repartidos de forma desigual', () => {
    // Muchos vértices sobre un lado no arrastran el centro hacia ese lado.
    const c = polygonCentroid([
      { x: 0, y: 0 },
      { x: 25, y: 0 },
      { x: 50, y: 0 },
      { x: 75, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ]);
    expect(c.x).toBeCloseTo(50);
    expect(c.y).toBeCloseTo(50);
  });

  it('degenera con gracia: vacío, un punto, segmento, colineales', () => {
    expect(polygonCentroid([])).toEqual({ x: 0, y: 0 });
    expect(polygonCentroid([{ x: 3, y: 4 }])).toEqual({ x: 3, y: 4 });
    expect(polygonCentroid([{ x: 0, y: 0 }, { x: 10, y: 0 }])).toEqual({ x: 5, y: 0 });
    expect(polygonCentroid([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }])).toEqual({ x: 10, y: 0 });
  });
});

describe('documentToFlow con un padre plegado', () => {
  it('sin plegar, todo se dibuja como siempre', () => {
    const { doc } = conGrupo();
    const model = documentToFlow(doc, sinSeleccion);
    expect(model.nodes.map((n) => n.id)).toEqual(['A', 'B', 'C']);
    expect(model.edges.map((e) => e.id)).toEqual(['t-ab', 't-bc', 't-ba', 't-bb']);
  });

  it('oculta los subestados y agrega un nodo por el padre, en el centroide de la figura', () => {
    const { doc, parentId } = conGrupo();
    const model = documentToFlow(doc, { ...sinSeleccion, collapsedParentIds: new Set([parentId]) });

    expect(model.nodes.map((n) => n.id)).toEqual(['C', parentId]);
    const padre = model.nodes.find((n) => n.id === parentId)!;
    expect(padre.type).toBe('parent');
    expect(padre.selectable).toBe(false);
    expect(padre.draggable).toBe(true);
    expect(padre.measured).toEqual({ width: NODE_BOX, height: NODE_BOX });

    const forma = computeParentGroups(doc).find((g) => g.parentId === parentId)!;
    expect(nodePositionToCenter(padre.position)).toEqual(forma.centroid);
    // A(100,100) y B(400,100): el centro queda entre ambos. En y cae un poco
    // por debajo de 100 porque la huella incluye el subtítulo bajo cada nodo.
    expect(forma.centroid.x).toBeCloseTo(250);
    expect(forma.centroid.y).toBeGreaterThan(100);
    expect(forma.centroid.y).toBeLessThan(140);

    expect(padre.data).toMatchObject({ parentId, label: 'Grupo', substateCount: 2, containsInitial: true });
  });

  it('redirige al nodo plegado las transiciones que cruzan el borde y oculta las internas', () => {
    const { doc, parentId } = conGrupo();
    const model = documentToFlow(doc, { ...sinSeleccion, collapsedParentIds: new Set([parentId]) });

    // A->B, B->A y el bucle B->B quedan adentro: no se dibujan.
    expect(model.edges.map((e) => e.id)).toEqual(['t-bc']);
    const bc = model.edges[0]!;
    expect(bc.source).toBe(parentId);
    expect(bc.target).toBe('C');
    // La geometría parte del nodo plegado, no de donde estaba B.
    expect(bc.data?.geometry.start.x).toBeGreaterThan(250);
    expect(bc.data?.geometry.start.x).toBeLessThan(400);
    // Las propiedades de la transición siguen siendo las suyas.
    expect(bc.data?.transitionId).toBe('t-bc');
    expect(bc.data?.color).toBe('#D32F2F');
  });

  it('el documento no se toca al plegar', () => {
    const { doc, parentId } = conGrupo();
    const antes = JSON.stringify(doc);
    documentToFlow(doc, { ...sinSeleccion, collapsedParentIds: new Set([parentId]) });
    expect(JSON.stringify(doc)).toBe(antes);
    expect(doc.layout.states[parentId]).toBeUndefined();
  });

  it('un padre plegado sin subestados no produce nodo', () => {
    const { document, parentId } = addParent(fixtureDocument(), { label: 'Vacío' });
    const model = documentToFlow(document, { ...sinSeleccion, collapsedParentIds: new Set([parentId]) });
    expect(model.nodes.map((n) => n.id)).toEqual(['A', 'B', 'C']);
  });

  it('el marcador de inicial solo aparece si el inicial está adentro', () => {
    const { document, parentId } = addParent(fixtureDocument(), { label: 'Solo C' });
    const doc = setStateParent(document, 'C', parentId);
    const model = documentToFlow(doc, { ...sinSeleccion, collapsedParentIds: new Set([parentId]) });
    const padre = model.nodes.find((n) => n.id === parentId)!;
    expect(padre.data).toMatchObject({ containsInitial: false, substateCount: 1 });
    // A sigue siendo el inicial dibujado.
    expect(model.nodes.find((n) => n.id === 'A')?.data).toMatchObject({ isInitial: true });
  });
});

describe('effectiveTransitions y curvaturas al plegar', () => {
  /** Dos grupos: {A,B} y {C}; transiciones A->C y B->C pasan a compartir extremos. */
  function dosGrupos(): { doc: StateMachineDocument; g1: string; g2: string } {
    let doc = fixtureDocument();
    doc = { ...doc, machine: { ...doc.machine, transitions: [
      { id: 'ac', from: 'A', to: 'C' },
      { id: 'bc', from: 'B', to: 'C' },
      { id: 'ca', from: 'C', to: 'A' },
    ] }, styles: { ...doc.styles, transitions: {} } };
    const r1 = addParent(doc, { label: 'G1' });
    doc = setStateParent(setStateParent(r1.document, 'A', r1.parentId), 'B', r1.parentId);
    const r2 = addParent(doc, { label: 'G2' });
    doc = setStateParent(r2.document, 'C', r2.parentId);
    return { doc, g1: r1.parentId, g2: r2.parentId };
  }

  it('remapea los extremos de cada transición según los padres plegados', () => {
    const { doc, g1, g2 } = dosGrupos();
    expect(effectiveTransitions(doc, new Set([g1]))).toEqual([
      { id: 'ac', from: g1, to: 'C' },
      { id: 'bc', from: g1, to: 'C' },
      { id: 'ca', from: 'C', to: g1 },
    ]);
    expect(effectiveTransitions(doc, new Set([g1, g2]))).toEqual([
      { id: 'ac', from: g1, to: g2 },
      { id: 'bc', from: g1, to: g2 },
      { id: 'ca', from: g2, to: g1 },
    ]);
  });

  it('separa las transiciones que pasan a compartir extremos', () => {
    const { doc, g1 } = dosGrupos();
    // Sin plegar, A->C y B->C no comparten extremos: van rectas (salvo C->A, que es el par de A->C).
    const rectas = resolveCurvatures(doc);
    expect(rectas.bc).toBe(0);

    const plegadas = resolveCurvatures(doc, effectiveTransitions(doc, new Set([g1])));
    expect(Object.keys(plegadas).sort()).toEqual(['ac', 'bc', 'ca']);
    // Lo observable: las tres curvas van por caminos distintos (etiquetas en
    // puntos distintos). La curvatura es relativa al sentido de cada una, así
    // que dos valores iguales en sentidos opuestos son lados opuestos.
    const model = documentToFlow(doc, { ...sinSeleccion, collapsedParentIds: new Set([g1]) });
    const etiquetas = model.edges.map((e) => e.data!.geometry.labelPosition);
    expect(etiquetas).toHaveLength(3);
    const claves = new Set(etiquetas.map((p) => Math.round(p.x) + ',' + Math.round(p.y)));
    expect(claves.size).toBe(3);
  });

  it('la curvatura explícita se respeta aunque cambien los extremos', () => {
    const { doc, g1 } = dosGrupos();
    const conExplicita = { ...doc, styles: { ...doc.styles, transitions: { bc: { curvature: 0.7 } } } };
    const plegadas = resolveCurvatures(conExplicita, effectiveTransitions(conExplicita, new Set([g1])));
    expect(plegadas.bc).toBe(0.7);
  });
});

describe('substatePositionsForGroupMove', () => {
  it('traslada a todos los subestados el mismo delta, sin tocar a los demás', () => {
    const { doc, parentId } = conGrupo();
    const forma = computeParentGroups(doc).find((g) => g.parentId === parentId)!;
    const destino = { x: forma.centroid.x + 30, y: forma.centroid.y - 50 };

    const posiciones = substatePositionsForGroupMove(doc, parentId, destino);
    expect(Object.keys(posiciones).sort()).toEqual(['A', 'B']);
    expect(posiciones.A).toEqual({ x: 130, y: 50 });
    expect(posiciones.B).toEqual({ x: 430, y: 50 });
  });

  it('tras aplicar el movimiento, el centroide queda en el destino', () => {
    const { doc, parentId } = conGrupo();
    const destino = { x: 1000, y: 800 };
    const posiciones = substatePositionsForGroupMove(doc, parentId, destino);
    const movido: StateMachineDocument = { ...doc, layout: { ...doc.layout, states: { ...doc.layout.states, ...posiciones } } };
    const forma = computeParentGroups(movido).find((g) => g.parentId === parentId)!;
    expect(forma.centroid.x).toBeCloseTo(destino.x);
    expect(forma.centroid.y).toBeCloseTo(destino.y);
  });

  it('un padre inexistente o vacío no mueve nada', () => {
    const { doc } = conGrupo();
    expect(substatePositionsForGroupMove(doc, 'no-existe', { x: 0, y: 0 })).toEqual({});
    const { document, parentId } = addParent(doc, { label: 'Vacío' });
    expect(substatePositionsForGroupMove(document, parentId, { x: 0, y: 0 })).toEqual({});
  });
});

describe('centroide del circuito 6019', () => {
  it('el nodo plegado de Antecedentes cae dentro del rombo de sus subestados', () => {
    let doc = fixtureDocument();
    doc = { ...doc, machine: { ...doc.machine, states: [], transitions: [], initialStateId: null }, layout: { states: {} } };
    const posiciones: Record<string, { x: number; y: number }> = {
      P01: { x: 520, y: 320 },
      T6291: { x: 260, y: 520 },
      T6289: { x: 780, y: 520 },
      T6290: { x: 520, y: 700 },
    };
    for (const [id, position] of Object.entries(posiciones)) doc = addState(doc, { id, label: id, position }).document;
    const { document, parentId } = addParent(doc, { label: 'Antecedentes' });
    let conPadre = document;
    for (const id of Object.keys(posiciones)) conPadre = setStateParent(conPadre, id, parentId);

    const forma = computeParentGroups(conPadre)[0]!;
    // El rombo es simétrico en x alrededor de 520; en y, el subtítulo bajo cada
    // nodo estira la figura hacia abajo, así que el centro queda apenas por
    // debajo del punto medio vertical (510).
    expect(forma.centroid.x).toBeCloseTo(520, 0);
    expect(forma.centroid.y).toBeGreaterThan(500);
    expect(forma.centroid.y).toBeLessThan(560);
  });
});
