/**
 * Migración de versiones del documento.
 *
 * Corre antes de validar contra el schema, sobre el JSON crudo. Solo toca lo
 * que cambió de forma entre versiones; si el documento ya está al día, se
 * devuelve tal cual y `applied` queda vacío.
 *
 * v1 → v2: `state.description` era el texto que se dibujaba debajo del nodo.
 * Ese texto pasó a llamarse `subtitle`, y `description` quedó libre para el
 * detalle de negocio (que no se dibuja). Renombrar preserva lo que el usuario
 * ya veía en el lienzo.
 *
 * La detección NO se basa solo en el número de versión: existen documentos
 * estampados como v2 que conservan la forma v1 (los produjo una recarga en
 * caliente que subió la versión antes de que existiera esta migración). Si se
 * mirara solo `version`, esos documentos quedarían con el subtítulo atrapado en
 * `description` y el diagrama sin texto bajo los nodos. Por eso se mira también
 * la forma, con una condición conservadora: solo se repara cuando NINGÚN estado
 * tiene `subtitle`. Si alguno ya lo tiene, el documento está en la forma nueva
 * y sus `description` son detalle de negocio legítimo que no se toca.
 */
import { DOCUMENT_VERSION } from './types';

export interface MigrationResult {
  value: unknown;
  /** Descripción legible de cada paso aplicado, para poder informarlo. */
  applied: string[];
}

export function migrateDocument(value: unknown): MigrationResult {
  const applied: string[] = [];
  if (!isRecord(value)) return { value, applied };

  let current: Record<string, unknown> = value;

  if (current.version === 1) {
    current = renameDescriptionToSubtitle(current);
    applied.push('v1 → v2: el texto bajo cada estado pasó de "description" a "subtitle".');
  } else if (hasV1StateShape(current)) {
    current = renameDescriptionToSubtitle(current);
    applied.push(
      'Se recuperó el texto bajo los estados: venía guardado como "description" (forma vieja) y se movió a "subtitle".',
    );
  }

  return { value: current, applied };
}

/**
 * ¿El documento dice ser v2 o posterior pero sus estados siguen con la forma v1?
 * Solo si ningún estado tiene `subtitle` y al menos uno tiene `description`.
 */
function hasV1StateShape(doc: Record<string, unknown>): boolean {
  const states = readStates(doc);
  if (!states) return false;

  let algunoConDescription = false;
  for (const state of states) {
    if (!isRecord(state)) continue;
    // Si ya existe un subtítulo en cualquier estado, el documento está al día.
    if (typeof state.subtitle === 'string' && state.subtitle !== '') return false;
    if (typeof state.description === 'string' && state.description !== '') algunoConDescription = true;
  }
  return algunoConDescription;
}

function renameDescriptionToSubtitle(doc: Record<string, unknown>): Record<string, unknown> {
  const machine = isRecord(doc.machine) ? doc.machine : undefined;
  const states = readStates(doc);

  const migratedStates = states?.map((state) => {
    if (!isRecord(state) || !('description' in state)) return state;
    const { description, ...rest } = state;
    // Si ya trae `subtitle`, ese gana y se descarta la reasignación.
    return 'subtitle' in rest ? { ...rest, subtitle: rest.subtitle } : { ...rest, subtitle: description };
  });

  return {
    ...doc,
    version: DOCUMENT_VERSION,
    ...(machine && migratedStates ? { machine: { ...machine, states: migratedStates } } : {}),
  };
}

function readStates(doc: Record<string, unknown>): unknown[] | undefined {
  const machine = isRecord(doc.machine) ? doc.machine : undefined;
  return machine && Array.isArray(machine.states) ? machine.states : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
