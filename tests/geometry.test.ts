import { describe, expect, it } from 'vitest';
import { computeTransitionGeometry, resolveCurvatures } from '../src/ui/adapter';
import { fixtureDocument } from './fixtures';

const options = { radius: 36, curvature: 0, arrowLength: 13, arrowWidth: 11, loopSize: 80 };

describe('computeTransitionGeometry', () => {
  const cases = [
    { from: { x: 0, y: 0 }, to: { x: 300, y: 0 } },
    { from: { x: 300, y: 0 }, to: { x: 0, y: 0 } },
    { from: { x: 0, y: 0 }, to: { x: 0, y: 250 } },
    { from: { x: 10, y: 20 }, to: { x: -200, y: 180 } },
    { from: { x: 100, y: 100 }, to: { x: 180, y: 120 } },
  ];
  const curvatures = [-1, -0.5, -0.1, 0, 0.1, 0.35, 1];

  it('salida y llegada están sobre los bordes de los círculos y la punta apunta al centro de `to`', () => {
    for (const { from, to } of cases) {
      for (const curvature of curvatures) {
        const g = computeTransitionGeometry(from, to, { ...options, curvature });
        expect(g.kind).toBe('curve');
        expect(Math.hypot(g.start.x - from.x, g.start.y - from.y)).toBeCloseTo(36, 6);
        expect(Math.hypot(g.end.x - to.x, g.end.y - to.y)).toBeCloseTo(36, 6);

        const d = Math.hypot(to.x - g.end.x, to.y - g.end.y);
        const dot = ((to.x - g.end.x) / d) * g.endDirection.x + ((to.y - g.end.y) / d) * g.endDirection.y;
        expect(dot).toBeCloseTo(1, 6);
        expect(g.arrowhead[0]).toEqual(g.end);
        expect(g.path.startsWith('M ')).toBe(true);
      }
    }
  });

  it('con curvatura 0 la línea es recta entre centros y la etiqueta se centra en su punto medio', () => {
    const g = computeTransitionGeometry({ x: 0, y: 0 }, { x: 300, y: 0 }, options);
    expect(g.start).toEqual({ x: 36, y: 0 });
    expect(g.end).toEqual({ x: 264, y: 0 });
    expect(g.labelAnchor).toEqual({ x: 0, y: -1 });
    expect(g.labelPosition).toEqual({ x: 150, y: 0 });
    // Da igual el sentido: la etiqueta de una recta horizontal siempre va arriba.
    const reverse = computeTransitionGeometry({ x: 300, y: 0 }, { x: 0, y: 0 }, options);
    expect(reverse.labelAnchor).toEqual({ x: 0, y: -1 });
    // En una recta vertical va a la izquierda.
    const vertical = computeTransitionGeometry({ x: 0, y: 0 }, { x: 0, y: 300 }, options);
    expect(vertical.labelAnchor).toEqual({ x: -1, y: 0 });
  });

  it('el signo de la curvatura decide el lado del abombamiento', () => {
    const plus = computeTransitionGeometry({ x: 0, y: 0 }, { x: 300, y: 0 }, { ...options, curvature: 0.3 });
    const minus = computeTransitionGeometry({ x: 0, y: 0 }, { x: 300, y: 0 }, { ...options, curvature: -0.3 });
    expect(plus.labelPosition.y).toBeGreaterThan(0);
    expect(minus.labelPosition.y).toBeLessThan(0);
    expect(plus.labelPosition.y).toBeCloseTo(-minus.labelPosition.y, 6);
  });

  it('una auto-transición produce un bucle que sale y vuelve al mismo círculo', () => {
    const center = { x: 50, y: 50 };
    for (const curvature of [-1, -0.5, 0, 0.5, 1]) {
      const g = computeTransitionGeometry(center, center, { ...options, curvature });
      expect(g.kind).toBe('loop');
      expect(Math.hypot(g.start.x - center.x, g.start.y - center.y)).toBeCloseTo(36, 6);
      expect(Math.hypot(g.end.x - center.x, g.end.y - center.y)).toBeCloseTo(36, 6);
      const d = Math.hypot(center.x - g.end.x, center.y - g.end.y);
      const dot = ((center.x - g.end.x) / d) * g.endDirection.x + ((center.y - g.end.y) / d) * g.endDirection.y;
      expect(dot).toBeCloseTo(1, 6);
      // La etiqueta queda fuera del círculo.
      expect(Math.hypot(g.labelPosition.x - center.x, g.labelPosition.y - center.y)).toBeGreaterThan(36);
    }
    const top = computeTransitionGeometry(center, center, { ...options, curvature: 0 });
    expect(top.labelPosition.y).toBeLessThan(center.y);
    const bottom = computeTransitionGeometry(center, center, { ...options, curvature: 1 });
    expect(bottom.labelPosition.y).toBeGreaterThan(center.y);
  });
});

describe('resolveCurvatures', () => {
  it('respeta la curvatura explícita y separa pares antiparalelos automáticamente', () => {
    const doc = fixtureDocument();
    const curvatures = resolveCurvatures(doc);
    expect(curvatures['t-bc']).toBe(0.25);
    // A->B y B->A: curvaturas no nulas de igual signo en su propio marco, lo que
    // en coordenadas del lienzo las envía a lados opuestos de la cuerda.
    expect(curvatures['t-ab']).not.toBe(0);
    expect(curvatures['t-ba']).not.toBe(0);
    const ab = computeTransitionGeometry(doc.layout.states.A!, doc.layout.states.B!, { ...options, curvature: curvatures['t-ab']! });
    const ba = computeTransitionGeometry(doc.layout.states.B!, doc.layout.states.A!, { ...options, curvature: curvatures['t-ba']! });
    expect(Math.sign(ab.labelPosition.y - 100)).toBe(-Math.sign(ba.labelPosition.y - 100));
    // El bucle único queda arriba.
    expect(curvatures['t-bb']).toBe(0);
  });

  it('una curvatura explícita 0 fuerza la línea recta aunque exista la antiparalela', () => {
    const doc = fixtureDocument();
    doc.styles.transitions['t-ab'] = { curvature: 0 };
    expect(resolveCurvatures(doc)['t-ab']).toBe(0);
  });

  it('una transición sola entre dos estados es recta', () => {
    const doc = fixtureDocument();
    doc.machine.transitions = doc.machine.transitions.filter((t) => t.id !== 't-ba');
    expect(resolveCurvatures(doc)['t-ab']).toBe(0);
  });
});
