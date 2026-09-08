/**
 * Color de los estados padre: `styles.parents[id].color`.
 *
 * Es una clave de presentación más, con las mismas reglas que las de estados y
 * transiciones: no toca `machine`, se poda cuando queda huérfana y no cambia la
 * versión del formato.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STYLE_DEFAULTS,
  addParent,
  parseDocumentObject,
  reconcileDocument,
  removeParent,
  serializeDocument,
  setParentStyle,
  setStateParent,
  validateDocument,
} from '../src/domain';
import type { StateMachineDocument } from '../src/domain';
import { documentToFlow, parentPalette } from '../src/ui/adapter';
import { fixtureDocument } from './fixtures';

/** A y B dentro de un padre. */
function conGrupo(): { doc: StateMachineDocument; parentId: string } {
  const { document, parentId } = addParent(fixtureDocument(), { label: 'Grupo' });
  return { doc: setStateParent(setStateParent(document, 'A', parentId), 'B', parentId), parentId };
}

const sinSeleccion = { stateIds: new Set<string>(), transitionIds: new Set<string>() };

describe('parentPalette', () => {
  it('deriva un tinte claro, un borde intermedio y una etiqueta oscura', () => {
    const p = parentPalette('#1F6FB2');
    // Un solo color de entrada, tres de salida, ordenados de claro a oscuro.
    expect(luminancia(p.fill)).toBeGreaterThan(luminancia(p.border));
    expect(luminancia(p.border)).toBeGreaterThan(luminancia(p.label));
    // El fondo tiene que dejarse escribir encima: casi blanco.
    expect(luminancia(p.fill)).toBeGreaterThan(220);
  });

  it('el color por defecto reproduce el aspecto histórico de la envolvente', () => {
    // Antes de que el color fuera editable, la envolvente estaba pintada con
    // estos tres valores fijos. Cambiarlos cambiaría cómo se ve todo documento
    // que no elige color, así que quedan clavados acá.
    const p = parentPalette(DEFAULT_STYLE_DEFAULTS.parentColor);
    expect(cerca(p.fill, '#e4ecf4')).toBe(true);
    expect(cerca(p.border, '#a9c3da')).toBe(true);
    expect(cerca(p.label, '#14507f')).toBe(true);
  });

  it('acepta hex de tres dígitos', () => {
    expect(parentPalette('#f00')).toEqual(parentPalette('#ff0000'));
  });

  it('cada color da una paleta distinta', () => {
    expect(parentPalette('#C0392B').fill).not.toBe(parentPalette('#2E7D32').fill);
  });

  it('un color CSS no hexadecimal se delega al navegador en vez de romper', () => {
    const p = parentPalette('rebeccapurple');
    expect(p.fill).toContain('color-mix');
    expect(p.fill).toContain('rebeccapurple');
    expect(p.label).toBe('rebeccapurple');
  });
});

describe('setParentStyle', () => {
  it('guarda el color sin tocar machine ni layout', () => {
    const { doc, parentId } = conGrupo();
    const next = setParentStyle(doc, parentId, { color: '#7B3FA0' });

    expect(next.styles.parents[parentId]).toEqual({ color: '#7B3FA0' });
    expect(next.machine).toBe(doc.machine);
    expect(next.layout).toBe(doc.layout);
    expect(doc.styles.parents[parentId]).toBeUndefined(); // el original no se muta
  });

  it('un color undefined vuelve al predeterminado y no deja entrada vacía', () => {
    const { doc, parentId } = conGrupo();
    const pintado = setParentStyle(doc, parentId, { color: '#7B3FA0' });
    const limpio = setParentStyle(pintado, parentId, { color: undefined });
    expect(limpio.styles.parents[parentId]).toBeUndefined();
    expect(Object.keys(limpio.styles.parents)).toEqual([]);
  });

  it('rechaza un padre inexistente', () => {
    const { doc } = conGrupo();
    expect(() => setParentStyle(doc, 'no-existe', { color: '#000000' })).toThrow(/no existe/i);
  });

  it('eliminar el padre se lleva su color', () => {
    const { doc, parentId } = conGrupo();
    const pintado = setParentStyle(doc, parentId, { color: '#7B3FA0' });
    const sinPadre = removeParent(pintado, parentId);
    expect(sinPadre.styles.parents[parentId]).toBeUndefined();
    expect(validateDocument(sinPadre)).not.toContainEqual(expect.objectContaining({ code: 'ORPHAN_PARENT_STYLE' }));
  });
});

describe('metadata huérfana', () => {
  it('se avisa y se poda un color que apunta a un padre inexistente', () => {
    const { doc } = conGrupo();
    const huerfano: StateMachineDocument = {
      ...doc,
      styles: { ...doc.styles, parents: { fantasma: { color: '#000000' } } },
    };

    expect(validateDocument(huerfano)).toContainEqual(
      expect.objectContaining({ code: 'ORPHAN_PARENT_STYLE', severity: 'warning', elementId: 'fantasma' }),
    );

    const { document, report } = reconcileDocument(huerfano);
    expect(report.prunedParentStyles).toEqual(['fantasma']);
    expect(document.styles.parents).toEqual({});
  });
});

describe('serialización', () => {
  it('el color sobrevive a un viaje de ida y vuelta por JSON', () => {
    const { doc, parentId } = conGrupo();
    const pintado = setParentStyle(doc, parentId, { color: '#7B3FA0' });
    const result = parseDocumentObject(JSON.parse(serializeDocument(pintado)));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.styles.parents[parentId]).toEqual({ color: '#7B3FA0' });
  });

  it('un documento sin styles.parents sigue siendo válido y no gana nada raro', () => {
    // Compatibilidad hacia atrás: todo JSON escrito antes de que existiera esta
    // clave tiene que seguir abriéndose sin migración ni aviso.
    const previo = {
      version: 2,
      machine: {
        id: 'm',
        name: 'M',
        initialStateId: 'a',
        states: [{ id: 'a', label: 'A' }],
        transitions: [],
      },
      styles: { defaults: { stateColor: '#000000', transitionColor: '#000000' }, states: {}, transitions: {} },
    };
    const result = parseDocumentObject(previo);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.styles.parents).toEqual({});
    expect(result.document.styles.defaults.parentColor).toBe(DEFAULT_STYLE_DEFAULTS.parentColor);
    expect(result.migrations).toEqual([]);
  });

  it('rechaza una clave desconocida dentro del estilo del padre', () => {
    const { doc, parentId } = conGrupo();
    const raro = JSON.parse(serializeDocument(doc));
    raro.styles.parents = { [parentId]: { colour: '#000000' } };
    expect(parseDocumentObject(raro).ok).toBe(false);
  });
});

describe('el nodo plegado usa el color del grupo', () => {
  it('toma el del padre si lo tiene', () => {
    const { doc, parentId } = conGrupo();
    const pintado = setParentStyle(doc, parentId, { color: '#7B3FA0' });
    const model = documentToFlow(pintado, { ...sinSeleccion, collapsedParentIds: new Set([parentId]) });
    expect(model.nodes.find((n) => n.id === parentId)?.data).toMatchObject({ color: '#7B3FA0' });
  });

  it('cae al predeterminado si no lo tiene', () => {
    const { doc, parentId } = conGrupo();
    const model = documentToFlow(doc, { ...sinSeleccion, collapsedParentIds: new Set([parentId]) });
    expect(model.nodes.find((n) => n.id === parentId)?.data).toMatchObject({
      color: DEFAULT_STYLE_DEFAULTS.parentColor,
    });
  });
});

// --- ayudas -----------------------------------------------------------------

function rgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function luminancia(hex: string): number {
  const [r, g, b] = rgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Igualdad de colores con tolerancia: interesa el aspecto, no el dígito exacto. */
function cerca(a: string, b: string, tolerancia = 8): boolean {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return Math.abs(r1 - r2) <= tolerancia && Math.abs(g1 - g2) <= tolerancia && Math.abs(b1 - b2) <= tolerancia;
}
