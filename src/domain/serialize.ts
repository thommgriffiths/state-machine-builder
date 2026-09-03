/**
 * Entrada/salida JSON del documento.
 *
 * parseDocument*: JSON -> schema (Zod) -> validación referencial -> reconciliación.
 * serializeDocument: documento -> JSON estable (claves en orden canónico, layout y
 * estilos ordenados según machine.states / machine.transitions) para que los
 * diffs sean legibles por humanos y agentes.
 */
import { documentSchema } from './schema';
import { reconcileDocument, type ReconcileReport } from './reconcile';
import type { StateMachineDocument } from './types';
import { hasErrors, validateDocument, type ValidationIssue } from './validate';

export type ParseResult =
  | { ok: true; document: StateMachineDocument; report: ReconcileReport; warnings: ValidationIssue[] }
  | { ok: false; issues: ValidationIssue[] };

export function parseDocumentJson(text: string): ParseResult {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return {
      ok: false,
      issues: [
        {
          severity: 'error',
          code: 'SCHEMA',
          message: `JSON inválido: ${error instanceof Error ? error.message : String(error)}`,
          path: '',
        },
      ],
    };
  }
  return parseDocumentObject(value);
}

export function parseDocumentObject(value: unknown): ParseResult {
  const parsed = documentSchema.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => ({
        severity: 'error',
        code: 'SCHEMA',
        message: issue.message,
        path: issue.path.map(String).join('.'),
      })),
    };
  }

  const issues = validateDocument(parsed.data);
  if (hasErrors(issues)) return { ok: false, issues };

  const { document, report } = reconcileDocument(parsed.data);
  const warnings = validateDocument(document).filter((i) => i.severity === 'warning');
  return { ok: true, document, report, warnings };
}

export function serializeDocument(doc: StateMachineDocument): string {
  return JSON.stringify(canonicalize(doc), null, 2) + '\n';
}

/** Reordena claves de forma canónica sin cambiar el contenido. */
export function canonicalize(doc: StateMachineDocument): StateMachineDocument {
  const stateOrder = doc.machine.states.map((s) => s.id);
  const transitionOrder = doc.machine.transitions.map((t) => t.id);

  const layout: StateMachineDocument['layout'] = { states: orderRecord(doc.layout.states, stateOrder) };
  if (doc.layout.viewport) layout.viewport = doc.layout.viewport;

  return {
    version: doc.version,
    machine: {
      id: doc.machine.id,
      name: doc.machine.name,
      initialStateId: doc.machine.initialStateId,
      states: doc.machine.states.map((s) => {
        const out: StateMachineDocument['machine']['states'][number] = { id: s.id, label: s.label, type: s.type };
        if (s.description) out.description = s.description;
        return out;
      }),
      transitions: doc.machine.transitions.map((t) => {
        const out: StateMachineDocument['machine']['transitions'][number] = { id: t.id, from: t.from, to: t.to };
        if (t.label) out.label = t.label;
        if (t.event) out.event = t.event;
        if (t.condition) out.condition = t.condition;
        if (t.action) out.action = t.action;
        return out;
      }),
    },
    layout,
    styles: {
      defaults: { ...doc.styles.defaults },
      states: orderRecord(doc.styles.states, stateOrder),
      transitions: orderRecord(doc.styles.transitions, transitionOrder),
    },
  };
}

function orderRecord<T>(record: Record<string, T>, order: readonly string[]): Record<string, T> {
  const result: Record<string, T> = {};
  for (const id of order) {
    const value = record[id];
    if (value !== undefined) result[id] = value;
  }
  // Entradas que no siguen el orden (p. ej. huérfanas) se conservan al final.
  for (const [id, value] of Object.entries(record)) {
    if (!(id in result)) result[id] = value;
  }
  return result;
}
