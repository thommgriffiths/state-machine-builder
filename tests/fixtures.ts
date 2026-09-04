import type { StateMachineDocument } from '../src/domain';

/**
 * Documento de prueba: A -> B -> C, más B -> A (par antiparalelo) y un bucle en B.
 * A es inicial, C es final. Todos los estados tienen posición.
 */
export function fixtureDocument(): StateMachineDocument {
  return {
    version: 2,
    machine: {
      id: 'fixture',
      name: 'Fixture',
      initialStateId: 'A',
      states: [
        { id: 'A', label: 'A', type: 'normal' },
        { id: 'B', label: 'B', type: 'normal', subtitle: 'Estado intermedio', description: 'Detalle de negocio de B.' },
        { id: 'C', label: 'C', type: 'final' },
      ],
      parents: [],
      transitions: [
        { id: 't-ab', from: 'A', to: 'B', label: 'ir a B', event: 'GO' },
        { id: 't-bc', from: 'B', to: 'C', event: 'FINISH', condition: 'ok', action: 'notify' },
        { id: 't-ba', from: 'B', to: 'A', label: 'volver' },
        { id: 't-bb', from: 'B', to: 'B', label: 'reintentar' },
      ],
    },
    layout: {
      states: {
        A: { x: 100, y: 100 },
        B: { x: 400, y: 100 },
        C: { x: 700, y: 100 },
      },
    },
    styles: {
      defaults: { stateColor: '#000000', transitionColor: '#000000' },
      states: { C: { color: '#2E7D32' } },
      transitions: { 't-bc': { color: '#D32F2F', curvature: 0.25 } },
    },
  };
}

export function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
