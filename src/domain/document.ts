import { DEFAULT_STYLE_DEFAULTS, DOCUMENT_VERSION, type StateMachineDocument } from './types';

/** Crea un documento mínimo válido con un único estado inicial. */
export function createEmptyDocument(input: { id?: string; name?: string } = {}): StateMachineDocument {
  return {
    version: DOCUMENT_VERSION,
    machine: {
      id: input.id ?? 'machine-1',
      name: input.name ?? 'Nueva máquina',
      initialStateId: 'state-1',
      states: [{ id: 'state-1', label: 'Inicio', type: 'normal' }],
      transitions: [],
      parents: [],
    },
    layout: { states: { 'state-1': { x: 200, y: 200 } } },
    styles: { defaults: { ...DEFAULT_STYLE_DEFAULTS }, states: {}, transitions: {} },
  };
}
