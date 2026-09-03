import { describe, expect, it } from 'vitest';
import { DOCUMENT_VERSION, migrateDocument, parseDocumentObject, serializeDocument } from '../src/domain';

/** Documento tal como se guardaba en la versión 1 del formato. */
function v1Document() {
  return {
    version: 1,
    machine: {
      id: 'legacy',
      name: 'Máquina vieja',
      initialStateId: 'a',
      states: [
        { id: 'a', label: 'A', type: 'normal', description: 'Texto que se dibujaba bajo el nodo' },
        { id: 'b', label: 'B', type: 'final' },
      ],
      transitions: [{ id: 't', from: 'a', to: 'b', label: 'ir' }],
    },
    layout: { states: { a: { x: 10, y: 20 }, b: { x: 200, y: 20 } } },
  };
}

describe('migración v1 → v2', () => {
  it('renombra description a subtitle, que es lo que se dibuja', () => {
    const { value, applied } = migrateDocument(v1Document());
    const doc = value as ReturnType<typeof v1Document>;

    expect(doc.version).toBe(DOCUMENT_VERSION);
    expect(applied).toHaveLength(1);
    expect(doc.machine.states[0]).toEqual({
      id: 'a',
      label: 'A',
      type: 'normal',
      subtitle: 'Texto que se dibujaba bajo el nodo',
    });
    // El campo viejo ya no queda suelto (el schema es estricto y lo rechazaría).
    expect('description' in (doc.machine.states[0] as object)).toBe(false);
  });

  it('un documento v1 se abre sin errores y conserva su texto bajo el nodo', () => {
    const result = parseDocumentObject(v1Document());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.migrations).toHaveLength(1);
    expect(result.document.version).toBe(DOCUMENT_VERSION);
    expect(result.document.machine.states[0]?.subtitle).toBe('Texto que se dibujaba bajo el nodo');
    expect(result.document.machine.states[0]?.description).toBeUndefined();
    // El layout manual sobrevive intacto a la migración.
    expect(result.document.layout.states.a).toEqual({ x: 10, y: 20 });
  });

  it('no toca un documento que ya está en la versión actual', () => {
    const alDia = { version: DOCUMENT_VERSION, machine: { id: 'm', name: 'm', initialStateId: null, states: [], transitions: [] } };
    const { value, applied } = migrateDocument(alDia);
    expect(value).toBe(alDia);
    expect(applied).toEqual([]);
  });

  it('si un documento v1 ya trae subtitle, ese gana y no se pisa', () => {
    const raro = v1Document();
    (raro.machine.states[0] as Record<string, unknown>).subtitle = 'el bueno';
    const result = parseDocumentObject(raro);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.machine.states[0]?.subtitle).toBe('el bueno');
  });

  it('tolera documentos v1 mal formados sin romper (los rechaza la validación, no la migración)', () => {
    expect(() => migrateDocument({ version: 1 })).not.toThrow();
    expect(() => migrateDocument({ version: 1, machine: 'no es un objeto' })).not.toThrow();
    expect(() => migrateDocument({ version: 1, machine: { states: 'no es un array' } })).not.toThrow();
    expect(() => migrateDocument(null)).not.toThrow();
  });
});

describe('reparación de documentos estampados como v2 pero con la forma v1', () => {
  /**
   * Los produjo una recarga en caliente que subió el número de versión antes de
   * que existiera la migración: el autosave estampó "2" sobre un documento cuyos
   * estados seguían guardando el subtítulo en `description`.
   */
  function danado() {
    return {
      version: 2,
      machine: {
        id: 'circuito',
        name: 'Circuito',
        initialStateId: 'a',
        states: [
          { id: 'a', label: 'A', type: 'normal', description: 'Ingresa el EE · TR' },
          { id: 'b', label: 'B', type: 'normal', description: 'Analista valida · HU' },
        ],
        transitions: [{ id: 't', from: 'a', to: 'b' }],
      },
    };
  }

  it('recupera el texto que quedó atrapado en description', () => {
    const result = parseDocumentObject(danado());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.document.machine.states[0]?.subtitle).toBe('Ingresa el EE · TR');
    expect(result.document.machine.states[1]?.subtitle).toBe('Analista valida · HU');
    // Y no quedan duplicados en el campo que no se dibuja.
    expect(result.document.machine.states[0]?.description).toBeUndefined();
    expect(result.migrations).toHaveLength(1);
  });

  it('NO toca un documento v2 legítimo: si algún estado ya tiene subtítulo, las descripciones son de negocio', () => {
    const legitimo = danado();
    legitimo.machine.states[0] = {
      id: 'a',
      label: 'A',
      type: 'normal',
      subtitle: 'bajo el nodo',
      description: 'detalle de negocio que debe quedarse donde está',
    } as (typeof legitimo.machine.states)[number];

    const result = parseDocumentObject(legitimo);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.document.machine.states[0]?.subtitle).toBe('bajo el nodo');
    expect(result.document.machine.states[0]?.description).toBe('detalle de negocio que debe quedarse donde está');
    // El otro estado conserva su description intacta: no se promueve nada.
    expect(result.document.machine.states[1]?.description).toBe('Analista valida · HU');
    expect(result.document.machine.states[1]?.subtitle).toBeUndefined();
    expect(result.migrations).toEqual([]);
  });

  it('no repara un documento v2 sin ninguna description (nada que recuperar)', () => {
    const sano = {
      version: DOCUMENT_VERSION,
      machine: {
        id: 'm',
        name: 'm',
        initialStateId: 'a',
        states: [{ id: 'a', label: 'A', type: 'normal' }],
        transitions: [],
      },
    };
    expect(migrateDocument(sano).applied).toEqual([]);
  });

  it('las descripciones de las transiciones nunca se mueven', () => {
    const doc = danado() as unknown as { machine: { transitions: Array<Record<string, unknown>> } };
    doc.machine.transitions[0]!.description = 'detalle de la transición';
    const result = parseDocumentObject(doc);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.machine.transitions[0]?.description).toBe('detalle de la transición');
  });
});

describe('subtítulo y descripción', () => {
  it('son campos independientes y ambos sobreviven al round-trip', () => {
    const entrada = {
      version: DOCUMENT_VERSION,
      machine: {
        id: 'm',
        name: 'm',
        initialStateId: 'a',
        states: [{ id: 'a', label: 'A', subtitle: 'bajo el nodo', description: 'detalle largo de negocio' }],
        transitions: [{ id: 't', from: 'a', to: 'a', description: 'por qué existe esta transición' }],
      },
    };
    const result = parseDocumentObject(entrada);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const state = result.document.machine.states[0];
    expect(state?.subtitle).toBe('bajo el nodo');
    expect(state?.description).toBe('detalle largo de negocio');
    expect(result.document.machine.transitions[0]?.description).toBe('por qué existe esta transición');

    const round = parseDocumentObject(JSON.parse(serializeDocument(result.document)));
    expect(round.ok).toBe(true);
    if (!round.ok) return;
    expect(round.document.machine.states[0]?.subtitle).toBe('bajo el nodo');
    expect(round.document.machine.states[0]?.description).toBe('detalle largo de negocio');
    expect(round.document.machine.transitions[0]?.description).toBe('por qué existe esta transición');
    // Y la migración no vuelve a aplicarse sobre un documento ya migrado.
    expect(round.migrations).toEqual([]);
  });
});
