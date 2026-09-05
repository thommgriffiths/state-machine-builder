/**
 * Las guías de /docs se incrustan en la aplicación (Ayuda). Estos tests evitan
 * que se desactualicen respecto del formato: todo JSON que muestran tiene que
 * ser válido, y la versión que nombran tiene que ser la vigente.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DOCUMENT_VERSION, parseDocumentJson } from '../src/domain';

const guiaLlm = readFileSync(new URL('../docs/guia-llm.md', import.meta.url), 'utf-8');
const guiaHumanos = readFileSync(new URL('../docs/guia-humanos.md', import.meta.url), 'utf-8');

function jsonBlocks(markdown: string): string[] {
  return [...markdown.matchAll(/```json\n([\s\S]*?)```/g)].map((m) => m[1] as string);
}

describe('guía para LLMs', () => {
  const blocks = jsonBlocks(guiaLlm);

  it('muestra al menos un documento completo de ejemplo', () => {
    expect(blocks.some((b) => b.includes('"version"'))).toBe(true);
  });

  it('todo bloque json es JSON válido', () => {
    for (const block of blocks) expect(() => JSON.parse(block)).not.toThrow();
  });

  it('los documentos completos que muestra pasan la validación', () => {
    for (const block of blocks.filter((b) => b.includes('"version"'))) {
      const result = parseDocumentJson(block);
      expect(result.ok, result.ok ? '' : result.issues.map((i) => i.message).join(' | ')).toBe(true);
    }
  });

  it('nombra la versión vigente del formato', () => {
    expect(guiaLlm).toContain('`version` es `' + DOCUMENT_VERSION + '`');
    expect(guiaLlm).toContain('"version": ' + DOCUMENT_VERSION);
  });

  it('pide el documento completo y advierte sobre layout y campos desconocidos', () => {
    expect(guiaLlm).toMatch(/documento JSON completo/);
    expect(guiaLlm).toMatch(/No modifiques `layout`/);
    expect(guiaLlm).toMatch(/No agregues campos/);
  });
});

describe('guía de uso', () => {
  it('cubre las acciones principales con los nombres que tienen en la barra', () => {
    for (const nombre of ['Exportar JSON', 'Importar JSON', 'Guardar', 'Reorganizar', 'Ajustar vista', 'Aplicar', 'Plegar']) {
      expect(guiaHumanos, nombre).toContain(nombre);
    }
  });

  it('explica el circuito con un LLM', () => {
    expect(guiaHumanos).toContain('Copiar guía + máquina actual');
  });
});
