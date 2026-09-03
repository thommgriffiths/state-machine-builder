import { z } from 'zod';
import { documentSchema } from './schema';

/** JSON Schema (draft 2020-12) del documento, derivado del schema Zod. */
export function buildJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(documentSchema, { target: 'draft-2020-12', io: 'input', unrepresentable: 'any' });
  return {
    $id: 'https://example.com/state-machine-document.schema.json',
    title: 'StateMachineDocument',
    ...schema,
  };
}
