/**
 * Jerarquía: todo lo que hay en `machine.states` es un subestado y se dibuja.
 * Los estados padre viven aparte, en `machine.parents`, agrupan subestados y
 * NO se dibujan. Por ahora son planos: no se anidan entre sí.
 */
import { describe, expect, it } from 'vitest';
import {
  DomainError,
  addParent,
  addState,
  addTransition,
  errorsOf,
  moveState,
  parseDocumentObject,
  removeParent,
  removeState,
  renameStateId,
  serializeDocument,
  setInitialState,
  setStateParent,
  substatesOf,
  updateParent,
  validateDocument,
} from '../src/domain';
import type { StateMachineDocument } from '../src/domain';
import { deepClone, fixtureDocument } from './fixtures';

/** Fixture con un padre "Admisibilidad" que agrupa a A y B. C queda suelto. */
function conPadre(): { doc: StateMachineDocument; parentId: string } {
  const { document, parentId } = addParent(fixtureDocument(), { label: 'Admisibilidad' });
  return { doc: setStateParent(setStateParent(document, 'A', parentId), 'B', parentId), parentId };
}

describe('los subestados son lo que se dibuja; los padres no', () => {
  it('un estado nuevo nace como subestado suelto', () => {
    const { document, stateId } = addState(fixtureDocument(), { label: 'Nuevo' });
    const nuevo = document.machine.states.find((s) => s.id === stateId);
    expect(nuevo?.parentId).toBeUndefined();
    expect(errorsOf(validateDocument(document))).toEqual([]);
  });

  it('los padres no están en states: no se dibujan ni pueden ser extremo de una transición', () => {
    const { doc, parentId } = conPadre();
    expect(doc.machine.states.some((s) => s.id === parentId)).toBe(false);
    expect(doc.machine.parents.map((p) => p.id)).toEqual([parentId]);
    expect(() => addTransition(doc, { from: 'C', to: parentId })).toThrow(DomainError);
  });

  it('los ids de los padres comparten espacio con estados y transiciones', () => {
    const { doc, parentId } = conPadre();
    expect(() => addState(doc, { id: parentId, label: 'choca' })).toThrow(DomainError);
    // Y el generador no reutiliza un id ya tomado por un padre.
    const otro = addParent(doc, { label: 'Otro' });
    expect(otro.parentId).not.toBe(parentId);
  });
});

describe('asignar y quitar el padre', () => {
  it('asignarlo no toca layout, estilos ni transiciones', () => {
    const { document: base } = addParent(fixtureDocument(), { label: 'Grupo' });
    const before = deepClone(base);
    const next = setStateParent(base, 'A', base.machine.parents[0]!.id);

    expect(next.machine.states.find((s) => s.id === 'A')?.parentId).toBe(base.machine.parents[0]!.id);
    expect(next.machine.transitions).toEqual(before.machine.transitions);
    expect(next.layout).toBe(base.layout);
    expect(next.styles).toBe(base.styles);
    expect(base).toEqual(before);
  });

  it('null lo deja suelto y borra la clave, sin dejar undefined en el JSON', () => {
    const { doc } = conPadre();
    const next = setStateParent(doc, 'A', null);
    const a = next.machine.states.find((s) => s.id === 'A');
    expect(a?.parentId).toBeUndefined();
    expect('parentId' in (a as object)).toBe(false);
  });

  it('rechaza un padre inexistente', () => {
    expect(() => setStateParent(fixtureDocument(), 'A', 'NO-EXISTE')).toThrow(DomainError);
  });
});

describe('validación', () => {
  it('acepta subestados sueltos y agrupados', () => {
    const { doc } = conPadre();
    expect(errorsOf(validateDocument(doc))).toEqual([]);
  });

  it('rechaza un parentId que no corresponde a ningún padre', () => {
    const doc = fixtureDocument();
    doc.machine.states[0] = { ...doc.machine.states[0]!, parentId: 'FANTASMA' };
    const issue = validateDocument(doc).find((i) => i.code === 'UNKNOWN_PARENT_STATE');
    expect(issue?.severity).toBe('error');
    expect(issue?.elementId).toBe('A');
    expect(parseDocumentObject(doc).ok).toBe(false);
  });

  it('apuntar a un estado (en vez de a un padre) es un error: son cosas distintas', () => {
    const doc = fixtureDocument();
    doc.machine.states[1] = { ...doc.machine.states[1]!, parentId: 'A' };
    expect(validateDocument(doc).some((i) => i.code === 'UNKNOWN_PARENT_STATE')).toBe(true);
  });

  it('avisa (sin bloquear) de un padre que no agrupa nada', () => {
    const { document } = addParent(fixtureDocument(), { label: 'Vacío' });
    const issues = validateDocument(document);
    expect(errorsOf(issues)).toEqual([]);
    expect(issues.some((i) => i.code === 'EMPTY_PARENT')).toBe(true);
  });

  it('rechaza un id de padre duplicado', () => {
    const { doc, parentId } = conPadre();
    doc.machine.parents.push({ id: parentId, label: 'repetido' });
    expect(errorsOf(validateDocument(doc)).some((i) => i.code === 'DUPLICATE_ID')).toBe(true);
  });
});

describe('la jerarquía sobrevive a las demás operaciones', () => {
  it('eliminar un padre deja sueltos a sus subestados, no los borra', () => {
    const { doc, parentId } = conPadre();
    const next = removeParent(doc, parentId);

    expect(next.machine.parents).toEqual([]);
    expect(next.machine.states.map((s) => s.id)).toEqual(['A', 'B', 'C']);
    expect(next.machine.states.every((s) => s.parentId === undefined)).toBe(true);
    expect(errorsOf(validateDocument(next))).toEqual([]);
  });

  it('eliminar un subestado no toca al padre ni a sus hermanos', () => {
    const { doc, parentId } = conPadre();
    const next = removeState(setInitialState(doc, 'C'), 'A');
    expect(next.machine.parents.map((p) => p.id)).toEqual([parentId]);
    expect(substatesOf(next.machine.states, parentId).map((s) => s.id)).toEqual(['B']);
  });

  it('renombrar un subestado conserva su padre', () => {
    const { doc, parentId } = conPadre();
    const next = renameStateId(doc, 'B', 'bravo');
    expect(next.machine.states.find((s) => s.id === 'bravo')?.parentId).toBe(parentId);
    expect(errorsOf(validateDocument(next))).toEqual([]);
  });

  it('mover un subestado no cambia su pertenencia', () => {
    const { doc, parentId } = conPadre();
    const next = moveState(doc, 'A', { x: 999, y: -111 });
    expect(next.machine).toBe(doc.machine);
    expect(next.machine.states.find((s) => s.id === 'A')?.parentId).toBe(parentId);
  });

  it('un subestado puede nacer ya dentro de un padre', () => {
    const { doc, parentId } = conPadre();
    const { document, stateId } = addState(doc, { label: 'Hijo', parentId });
    expect(document.machine.states.find((s) => s.id === stateId)?.parentId).toBe(parentId);
    expect(errorsOf(validateDocument(document))).toEqual([]);
  });

  it('sobrevive al round-trip por JSON', () => {
    const { doc, parentId } = conPadre();
    const round = parseDocumentObject(JSON.parse(serializeDocument(doc)));
    expect(round.ok).toBe(true);
    if (!round.ok) return;
    expect(round.document.machine.parents).toEqual([{ id: parentId, label: 'Admisibilidad' }]);
    expect(substatesOf(round.document.machine.states, parentId).map((s) => s.id)).toEqual(['A', 'B']);
  });

  it('un documento sin jerarquía sigue siendo válido: todo es opcional', () => {
    const doc = fixtureDocument();
    expect(doc.machine.parents).toEqual([]);
    expect(errorsOf(validateDocument(doc))).toEqual([]);
    expect(serializeDocument(doc)).not.toContain('parentId');
  });

  it('un documento sin la clave `parents` se acepta y queda vacía', () => {
    const sinParents = JSON.parse(serializeDocument(fixtureDocument()));
    delete sinParents.machine.parents;
    const result = parseDocumentObject(sinParents);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.machine.parents).toEqual([]);
  });
});

describe('editar un padre', () => {
  it('cambia su nombre sin tocar a sus subestados', () => {
    const { doc, parentId } = conPadre();
    const next = updateParent(doc, parentId, { label: 'Admisibilidad y control' });
    expect(next.machine.parents[0]?.label).toBe('Admisibilidad y control');
    expect(next.machine.states).toBe(doc.machine.states);
  });

  it('substatesOf devuelve los subestados en el orden de machine.states', () => {
    const { doc, parentId } = conPadre();
    expect(substatesOf(doc.machine.states, parentId).map((s) => s.id)).toEqual(['A', 'B']);
    expect(substatesOf(doc.machine.states, 'otro')).toEqual([]);
  });
});
