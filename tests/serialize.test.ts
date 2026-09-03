import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildJsonSchema, canonicalize, parseDocumentJson, serializeDocument } from '../src/domain';
import { fixtureDocument } from './fixtures';

describe('serializeDocument / parseDocumentJson', () => {
  it('hace round-trip sin pérdida', () => {
    const doc = fixtureDocument();
    const text = serializeDocument(doc);
    const result = parseDocumentJson(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document).toEqual(canonicalize(doc));
    expect(result.report.placedStates).toEqual([]);
  });

  it('ordena claves de forma canónica (version, machine, layout, styles)', () => {
    const text = serializeDocument(fixtureDocument());
    const keys = Object.keys(JSON.parse(text) as Record<string, unknown>);
    expect(keys).toEqual(['version', 'machine', 'layout', 'styles']);
  });

  it('reporta JSON sintácticamente inválido', () => {
    const result = parseDocumentJson('{ "version": 1, ');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]?.message).toMatch(/JSON inválido/);
  });
});

describe('ejemplos incluidos', () => {
  for (const file of ['expediente.json', 'simple.json', 'pedido-sin-layout.json']) {
    it(file + ' es un documento válido', () => {
      const text = readFileSync(resolve(process.cwd(), 'examples', file), 'utf8');
      const result = parseDocumentJson(text);
      expect(result.ok, JSON.stringify(result)).toBe(true);
    });
  }
});

describe('JSON Schema publicado', () => {
  it('coincide con el generado desde Zod (ejecutar `npm run schema` si falla)', () => {
    const published = JSON.parse(readFileSync(resolve(process.cwd(), 'docs/schema/state-machine-document.schema.json'), 'utf8'));
    expect(published).toEqual(buildJsonSchema());
  });
});
