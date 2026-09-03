/**
 * Genera docs/schema/state-machine-document.schema.json a partir del schema Zod.
 * Uso: npm run schema
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { buildJsonSchema } from '../src/domain/jsonSchema';

const target = resolve(process.cwd(), 'docs/schema/state-machine-document.schema.json');
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, JSON.stringify(buildJsonSchema(), null, 2) + '\n');
console.log(`JSON Schema escrito en ${target}`);
