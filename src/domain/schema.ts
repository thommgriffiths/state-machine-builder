/**
 * Schema formal del documento (Zod 4).
 *
 * - Es la única definición de validación estructural "de forma" (tipos, claves,
 *   rangos). La validación referencial (IDs, from/to, inicial, huérfanos) vive
 *   en validate.ts porque necesita mirar el documento completo.
 * - Los objetos son estrictos: una clave desconocida (p. ej. un typo como
 *   "lable") se rechaza en lugar de ignorarse en silencio.
 * - `layout` y `styles` son opcionales en la entrada: un agente puede entregar
 *   solo `machine` y la UI completa el resto (ver reconcile.ts).
 * - El JSON Schema publicado en docs/schema se genera desde este archivo
 *   (`npm run schema`).
 */
import { z } from 'zod';
import { DEFAULT_STYLE_DEFAULTS, DOCUMENT_VERSION, type StateMachineDocument } from './types';

export const idSchema = z
  .string()
  .min(1, 'El id no puede estar vacío')
  .describe('Identificador estable y único dentro del documento');

/** Texto opcional: `null` y `""` se normalizan a ausente. */
const optionalText = z
  .string()
  .nullish()
  .transform((value) => (value == null || value === '' ? undefined : value));

const cssColor = z.string().min(1).describe('Color CSS (preferentemente hexadecimal). Solo presentación.');

export const stateTypeSchema = z.enum(['normal', 'final']);

export const stateSchema = z.strictObject({
  id: idSchema,
  label: z.string().describe('Nombre corto mostrado dentro del nodo'),
  type: stateTypeSchema.default('normal').describe('"final" marca un estado terminal'),
  subtitle: optionalText.describe('Texto corto dibujado debajo del nodo'),
  description: optionalText.describe('Detalle de negocio; no se dibuja, se ve en el inspector'),
});

export const transitionSchema = z.strictObject({
  id: idSchema,
  from: idSchema.describe('ID del estado origen'),
  to: idSchema.describe('ID del estado destino (la flecha apunta aquí)'),
  label: optionalText.describe('Etiqueta visible'),
  event: optionalText.describe('Evento que dispara la transición'),
  condition: optionalText.describe('Condición / guard'),
  action: optionalText.describe('Acción ejecutada al transicionar'),
  description: optionalText.describe('Detalle de negocio; no se dibuja, se ve en el inspector'),
});

export const machineSchema = z.strictObject({
  id: idSchema,
  name: z.string(),
  initialStateId: idSchema.nullable().describe('ID del estado inicial (null solo si no hay estados)'),
  states: z.array(stateSchema),
  transitions: z.array(transitionSchema),
});

export const positionSchema = z.strictObject({
  x: z.number().finite(),
  y: z.number().finite(),
});

export const viewportSchema = z.strictObject({
  x: z.number().finite(),
  y: z.number().finite(),
  zoom: z.number().positive().finite(),
});

export const layoutSchema = z.strictObject({
  states: z
    .record(idSchema, positionSchema)
    .default({})
    .describe('Centro de cada estado, indexado por ID de estado'),
  viewport: viewportSchema.optional(),
});

export const stateStyleSchema = z.strictObject({
  color: cssColor.optional(),
});

export const transitionStyleSchema = z.strictObject({
  color: cssColor.optional(),
  curvature: z
    .number()
    .min(-1)
    .max(1)
    .optional()
    .describe('Curvatura en [-1, 1]; 0 = recta; ausente = automática'),
  lineStyle: z.enum(['solid', 'dashed']).optional(),
});

export const styleDefaultsSchema = z.strictObject({
  stateColor: cssColor.default(DEFAULT_STYLE_DEFAULTS.stateColor),
  transitionColor: cssColor.default(DEFAULT_STYLE_DEFAULTS.transitionColor),
});

export const stylesSchema = z.strictObject({
  defaults: styleDefaultsSchema.prefault({}),
  states: z.record(idSchema, stateStyleSchema).default({}),
  transitions: z.record(idSchema, transitionStyleSchema).default({}),
});

export const documentSchema = z
  .strictObject({
    version: z.literal(DOCUMENT_VERSION),
    machine: machineSchema,
    layout: layoutSchema.prefault({}),
    styles: stylesSchema.prefault({}),
  })
  .describe('Documento de máquina de estados: machine (semántica) + layout + styles');

export type DocumentInput = z.input<typeof documentSchema>;

// Comprobación en tiempo de compilación: la salida del schema es asignable al
// tipo de dominio documentado en types.ts.
const _outputIsDocument: StateMachineDocument = null as unknown as z.output<typeof documentSchema>;
void _outputIsDocument;
