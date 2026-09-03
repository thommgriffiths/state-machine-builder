import { describe, expect, it } from 'vitest';
import {
  DomainError,
  addState,
  addTransition,
  createEmptyDocument,
  removeState,
  removeStates,
  renameStateId,
  renameTransitionId,
  setInitialState,
  setStateStyle,
  setTransitionStyle,
  updateState,
  updateTransition,
  validateDocument,
  hasErrors,
} from '../src/domain';
import { fixtureDocument } from './fixtures';

describe('removeState', () => {
  it('elimina en cascada las transiciones que lo referencian, su layout y sus estilos', () => {
    const doc = fixtureDocument();
    const next = removeState(doc, 'C');

    expect(next.machine.states.map((s) => s.id)).toEqual(['A', 'B']);
    expect(next.machine.transitions.map((t) => t.id)).toEqual(['t-ab', 't-ba', 't-bb']);
    expect(next.layout.states.C).toBeUndefined();
    expect(next.styles.states.C).toBeUndefined();
    expect(next.styles.transitions['t-bc']).toBeUndefined();
    // Los demás estados no se mueven.
    expect(next.layout.states.A).toEqual(doc.layout.states.A);
    expect(next.layout.states.B).toEqual(doc.layout.states.B);
    expect(hasErrors(validateDocument(next))).toBe(false);
  });

  it('rechaza eliminar el estado inicial', () => {
    const doc = fixtureDocument();
    expect(() => removeState(doc, 'A')).toThrow(DomainError);
    expect(() => removeStates(doc, ['B', 'A'])).toThrow(/inicial/);
  });

  it('permite eliminarlo tras marcar otro inicial', () => {
    const doc = setInitialState(fixtureDocument(), 'B');
    const next = removeState(doc, 'A');
    expect(next.machine.initialStateId).toBe('B');
    expect(next.machine.states.map((s) => s.id)).toEqual(['B', 'C']);
  });

  it('rechaza ids desconocidos', () => {
    expect(() => removeState(fixtureDocument(), 'nope')).toThrow(DomainError);
  });
});

describe('renameStateId', () => {
  it('propaga el nuevo id a transiciones, inicial, layout y estilos', () => {
    const doc = setStateStyle(fixtureDocument(), 'A', { color: '#123456' });
    const next = renameStateId(doc, 'A', 'inicio');

    expect(next.machine.initialStateId).toBe('inicio');
    expect(next.machine.states[0]?.id).toBe('inicio');
    expect(next.machine.transitions.find((t) => t.id === 't-ab')?.from).toBe('inicio');
    expect(next.machine.transitions.find((t) => t.id === 't-ba')?.to).toBe('inicio');
    expect(next.layout.states.inicio).toEqual({ x: 100, y: 100 });
    expect(next.layout.states.A).toBeUndefined();
    expect(next.styles.states.inicio).toEqual({ color: '#123456' });
    expect(hasErrors(validateDocument(next))).toBe(false);
  });

  it('rechaza ids duplicados o vacíos', () => {
    const doc = fixtureDocument();
    expect(() => renameStateId(doc, 'A', 'B')).toThrow(DomainError);
    expect(() => renameStateId(doc, 'A', 't-ab')).toThrow(DomainError);
    expect(() => renameStateId(doc, 'A', '  ')).toThrow(DomainError);
  });
});

describe('renameTransitionId', () => {
  it('propaga el nuevo id a los estilos', () => {
    const next = renameTransitionId(fixtureDocument(), 't-bc', 'finalizar');
    expect(next.machine.transitions.find((t) => t.id === 'finalizar')?.to).toBe('C');
    expect(next.styles.transitions.finalizar).toEqual({ color: '#D32F2F', curvature: 0.25 });
    expect(next.styles.transitions['t-bc']).toBeUndefined();
  });
});

describe('addState / addTransition', () => {
  it('genera ids secuenciales sin colisiones', () => {
    const doc = createEmptyDocument();
    const a = addState(doc, { label: 'Dos' });
    const b = addState(a.document, { label: 'Tres' });
    expect(a.stateId).toBe('state-2');
    expect(b.stateId).toBe('state-3');
    const t = addTransition(b.document, { from: 'state-1', to: 'state-2' });
    expect(t.transitionId).toBe('transition-1');
  });

  it('rechaza ids duplicados entre estados y transiciones', () => {
    const doc = fixtureDocument();
    expect(() => addState(doc, { id: 't-ab', label: 'x' })).toThrow(DomainError);
    expect(() => addTransition(doc, { id: 'A', from: 'A', to: 'B' })).toThrow(DomainError);
  });

  it('el primer estado de una máquina vacía pasa a ser inicial', () => {
    const empty = { ...createEmptyDocument(), machine: { ...createEmptyDocument().machine, initialStateId: null, states: [] } };
    const { document, stateId } = addState({ ...empty, layout: { states: {} } }, { label: 'Primero' });
    expect(document.machine.initialStateId).toBe(stateId);
  });
});

describe('updateState / updateTransition', () => {
  it('actualiza campos y elimina textos vacíos', () => {
    const doc = fixtureDocument();
    const next = updateState(doc, 'B', { label: 'Bravo', type: 'final', subtitle: '', description: '' });
    const state = next.machine.states.find((s) => s.id === 'B');
    expect(state).toEqual({ id: 'B', label: 'Bravo', type: 'final' });

    const next2 = updateTransition(next, 't-ab', { label: '', event: 'START', condition: 'ready', action: 'log' });
    expect(next2.machine.transitions.find((t) => t.id === 't-ab')).toEqual({
      id: 't-ab',
      from: 'A',
      to: 'B',
      event: 'START',
      condition: 'ready',
      action: 'log',
    });
  });

  it('permite reasignar from/to solo a estados existentes', () => {
    const doc = fixtureDocument();
    const next = updateTransition(doc, 't-ab', { to: 'C' });
    expect(next.machine.transitions.find((t) => t.id === 't-ab')?.to).toBe('C');
    expect(() => updateTransition(doc, 't-ab', { to: 'ZZ' })).toThrow(DomainError);
    expect(next.layout).toBe(doc.layout);
  });
});

describe('estilos', () => {
  it('un valor undefined elimina la propiedad y limpia entradas vacías', () => {
    const doc = fixtureDocument();
    const next = setTransitionStyle(doc, 't-bc', { curvature: undefined });
    expect(next.styles.transitions['t-bc']).toEqual({ color: '#D32F2F' });
    const next2 = setTransitionStyle(next, 't-bc', { color: undefined });
    expect(next2.styles.transitions['t-bc']).toBeUndefined();
  });
});
