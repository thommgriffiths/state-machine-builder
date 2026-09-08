# Notas para agentes que trabajan sobre este repositorio

Este proyecto es un editor de máquinas de estado. Su formato persistido está
diseñado para que un agente pueda **crear y modificar máquinas editando JSON**
sin tocar el dibujo.

## El formato y las reglas para editarlo

Están en [`docs/guia-llm.md`](docs/guia-llm.md). Es la **única copia**: la
aplicación la incrusta y la muestra en "Ayuda → Guía para LLMs", y un test
(`tests/guides.test.ts`) comprueba que sus ejemplos validan y que nombra la
versión vigente del formato. Leela completa antes de tocar un documento, y
editala a ella si el formato cambia; no dupliques su contenido acá.

Referencias formales:

- Schema: [`docs/schema/state-machine-document.schema.json`](docs/schema/state-machine-document.schema.json),
  generado con `npm run schema` desde [`src/domain/schema.ts`](src/domain/schema.ts).
- Tipos: [`src/domain/types.ts`](src/domain/types.ts).
- Ejemplos: [`examples/`](examples/).

## Comprobar un documento sin abrir la UI

```bash
npm run validate -- ruta/al/documento.json
```

## Cómo consume la UI un documento

1. Si el documento declara `version: 1`, se migra a la 2 (el `description` de
   los estados pasa a `subtitle`). La detección es por forma, no solo por el
   número de versión.
2. `parseDocumentJson` valida la forma (schema Zod estricto) y las referencias.
3. `reconcileDocument` asigna posición a los estados sin `layout` (solo a
   ellos) y elimina metadata huérfana, informando ambas cosas.
4. El adaptador (`src/ui/adapter`) convierte el documento a nodos y aristas de
   la librería gráfica; calcula anclajes, curvas, puntas de flecha, envolventes
   de los padres, su paleta a partir del color del grupo, y el plegado. Nada de
   eso se guarda: del padre solo se persiste su color, en `styles.parents`.

Si en el futuro se cambia la librería gráfica, el formato no cambia.

## Versión desplegada y entorno local

La versión desplegada está disponible en
[https://statemachinebuilder.netlify.app/](https://statemachinebuilder.netlify.app/).
Cuando una tarea no modifica la lógica de la webapp, no hace falta levantar el
ambiente local, salvo que hacerlo facilite el testing o la creación de un
diagrama.

## Cambios al código

- Arquitectura y decisiones: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
- Antes de cambiar el formato: bumpear `DOCUMENT_VERSION`, escribir la
  migración en el mismo cambio, actualizar `docs/guia-llm.md` y regenerar el
  schema.
- Los invariantes (mover no cambia transiciones, agregar no mueve, etc.) tienen
  tests en `tests/`. `npm test`, `npm run typecheck` y `npm run build` deben
  pasar.
- La guía de uso para personas es [`docs/guia-humanos.md`](docs/guia-humanos.md);
  si cambia la interfaz, actualizala. También se incrusta en la aplicación.
