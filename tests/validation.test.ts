import { describe, expect, it } from 'vitest';
import { errorsOf, hasErrors, parseDocumentObject, validateDocument } from '../src/domain';
import { fixtureDocument } from './fixtures';

describe('validateDocument', () => {
  it('acepta el fixture sin errores', () => {
    const issues = validateDocument(fixtureDocument());
    expect(errorsOf(issues)).toEqual([]);
  });

  it('detecta ids duplicados (entre estados y transiciones)', () => {
    const doc = fixtureDocument();
    doc.machine.states.push({ id: 'A', label: 'otro A', type: 'normal' });
    doc.machine.transitions.push({ id: 'B', from: 'A', to: 'C' });
    const codes = errorsOf(validateDocument(doc)).map((i) => i.code);
    expect(codes.filter((c) => c === 'DUPLICATE_ID')).toHaveLength(2);
  });

  it('exige un estado inicial existente', () => {
    const doc = fixtureDocument();
    doc.machine.initialStateId = 'ZZ';
    expect(validateDocument(doc).some((i) => i.code === 'UNKNOWN_INITIAL_STATE')).toBe(true);

    doc.machine.initialStateId = null;
    expect(validateDocument(doc).some((i) => i.code === 'INITIAL_STATE_MISSING')).toBe(true);
  });

  it('reporta metadata visual huérfana como advertencia', () => {
    const doc = fixtureDocument();
    doc.layout.states.ZZ = { x: 1, y: 1 };
    doc.styles.states.YY = { color: '#fff' };
    doc.styles.transitions.XX = { curvature: 0.1 };
    const issues = validateDocument(doc);
    expect(hasErrors(issues)).toBe(false);
    expect(issues.map((i) => i.code)).toEqual(expect.arrayContaining(['ORPHAN_LAYOUT', 'ORPHAN_STATE_STYLE', 'ORPHAN_TRANSITION_STYLE']));
  });

  it('emite lints no bloqueantes: sin finales, inalcanzables, final con salidas', () => {
    const doc = fixtureDocument();
    doc.machine.states.push({ id: 'X', label: 'aislado', type: 'normal' });
    doc.machine.transitions.push({ id: 't-cx', from: 'C', to: 'X' });
    const issues = validateDocument(doc);
    expect(hasErrors(issues)).toBe(false);
    expect(issues.some((i) => i.code === 'FINAL_STATE_HAS_OUTGOING' && i.elementId === 'C')).toBe(true);

    doc.machine.transitions.pop();
    const issues2 = validateDocument(doc);
    expect(issues2.some((i) => i.code === 'UNREACHABLE_STATE' && i.elementId === 'X')).toBe(true);

    doc.machine.states = doc.machine.states.map((s) => ({ ...s, type: 'normal' as const }));
    expect(validateDocument(doc).some((i) => i.code === 'NO_FINAL_STATE')).toBe(true);
  });
});

describe('schema (parseDocumentObject)', () => {
  it('rechaza claves desconocidas (typos) en lugar de ignorarlas', () => {
    const doc = fixtureDocument() as unknown as Record<string, unknown>;
    const machine = doc.machine as { states: Array<Record<string, unknown>> };
    machine.states[0] = { ...machine.states[0], lable: 'typo' };
    const result = parseDocumentObject(doc);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]?.path).toContain('machine.states.0');
  });

  it('rechaza una transición sin `to`', () => {
    const doc = fixtureDocument() as unknown as { machine: { transitions: Array<Record<string, unknown>> } };
    delete doc.machine.transitions[0]?.to;
    const result = parseDocumentObject(doc);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((i) => i.path === 'machine.transitions.0.to')).toBe(true);
  });

  it('rechaza versiones desconocidas y JSON que no es un documento', () => {
    expect(parseDocumentObject({ version: 2, machine: {} }).ok).toBe(false);
    expect(parseDocumentObject('hola').ok).toBe(false);
    expect(parseDocumentObject(null).ok).toBe(false);
  });

  it('normaliza null y cadenas vacías a ausente', () => {
    const result = parseDocumentObject({
      version: 1,
      machine: {
        id: 'm',
        name: 'n',
        initialStateId: 'a',
        states: [{ id: 'a', label: 'A', description: null }],
        transitions: [{ id: 't', from: 'a', to: 'a', label: '', event: null, condition: null, action: null }],
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.machine.states[0]).toEqual({ id: 'a', label: 'A', type: 'normal' });
    expect(result.document.machine.transitions[0]).toEqual({ id: 't', from: 'a', to: 'a' });
  });
});
