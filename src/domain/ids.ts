import type { StateMachineDocument } from './types';

export type IdPrefix = 'state' | 'transition' | 'parent';

/** Devuelve todos los IDs usados en el documento (subestados, transiciones y padres). */
export function collectIds(doc: StateMachineDocument): Set<string> {
  const ids = new Set<string>();
  for (const s of doc.machine.states) ids.add(s.id);
  for (const t of doc.machine.transitions) ids.add(t.id);
  for (const p of doc.machine.parents) ids.add(p.id);
  return ids;
}

/**
 * Genera un id nuevo `${prefix}-${n}` donde n es mayor que cualquier sufijo
 * numérico ya usado con ese prefijo. Los ids nunca se reutilizan mientras
 * exista uno mayor.
 */
export function generateId(doc: StateMachineDocument, prefix: IdPrefix, used: Set<string> = collectIds(doc)): string {
  const pattern = new RegExp(`^${prefix}-(\\d+)$`);
  let max = 0;
  for (const id of used) {
    const match = pattern.exec(id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  let candidate = `${prefix}-${max + 1}`;
  while (used.has(candidate)) {
    max += 1;
    candidate = `${prefix}-${max + 1}`;
  }
  return candidate;
}
