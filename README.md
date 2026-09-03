# Editor de máquinas de estado

Aplicación web para **crear, visualizar y editar máquinas de estado**, con una
separación estricta entre el modelo semántico (`machine`), la geometría de
presentación (`layout`) y los estilos (`styles`). Está pensada para que un
agente LLM pueda modificar máquinas editando el JSON de negocio sin tocar el
dibujo: la interfaz posiciona lo nuevo y conserva exactamente lo que ya estaba.

- Guía para agentes: [`AGENTS.md`](AGENTS.md)
- Arquitectura y decisiones: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Schema formal (JSON Schema generado desde Zod): [`docs/schema/state-machine-document.schema.json`](docs/schema/state-machine-document.schema.json)
- Tipos TypeScript: [`src/domain/types.ts`](src/domain/types.ts)
- Ejemplos: [`examples/`](examples/)

## Inicio rápido

```bash
npm install
npm run dev        # http://localhost:5173
```

Otros comandos:

```bash
npm test           # tests de invariantes (Vitest)
npm run typecheck  # TypeScript
npm run build      # build de producción en dist/
npm run schema     # regenera docs/schema/*.schema.json desde src/domain/schema.ts
npm run validate -- examples/simple.json   # valida archivos JSON desde la terminal
```

## El documento

```json
{
  "version": 1,
  "machine": {
    "id": "example-machine",
    "name": "Proceso de ejemplo",
    "initialStateId": "state-A",
    "states": [
      { "id": "state-A", "label": "Ingreso", "type": "normal" },
      { "id": "state-B", "label": "Análisis", "type": "normal" },
      { "id": "state-C", "label": "Finalizado", "type": "final" }
    ],
    "transitions": [
      { "id": "transition-A-B", "from": "state-A", "to": "state-B", "label": "Analizar", "event": "ANALYZE" },
      { "id": "transition-B-C", "from": "state-B", "to": "state-C", "label": "Aprobado", "event": "APPROVE", "condition": "isValid" }
    ]
  },
  "layout": {
    "states": {
      "state-A": { "x": 150, "y": 300 },
      "state-B": { "x": 450, "y": 300 },
      "state-C": { "x": 750, "y": 300 }
    }
  },
  "styles": {
    "defaults": { "stateColor": "#000000", "transitionColor": "#000000" },
    "states": {},
    "transitions": { "transition-B-C": { "color": "#D32F2F", "curvature": 0.25 } }
  }
}
```

- `machine` es la fuente de verdad del negocio. Los estados tienen `id`, `label`,
  `type` (`normal` | `final`) y `description` opcional. Las transiciones tienen
  `id`, `from`, `to` y, opcionalmente, `label`, `event`, `condition`, `action`.
  El estado inicial es `machine.initialStateId`.
- `layout.states[id]` es el **centro** del nodo. Es opcional: lo que falte se
  posiciona automáticamente (solo eso; nada existente se mueve).
- `styles` guarda color por ID, `curvature` en `[-1, 1]` y `lineStyle`. Los
  colores no tienen semántica.
- Todas las relaciones se expresan por ID. Mover un estado cambia únicamente
  `layout.states[id]`; las flechas se recalculan porque conocen `from`/`to`.

## El editor

| Acción | Cómo |
| --- | --- |
| Crear un estado | Doble clic en el lienzo, o botón "+ Estado" |
| Mover un estado | Arrastrar el círculo (solo cambia `layout`) |
| Crear una transición | Arrastrar desde el anillo exterior de un estado hasta otro (o el mismo, para un bucle); o desde el inspector del estado, "Nueva transición hacia…" |
| Editar estado / transición | Clic para seleccionar; el panel "Propiedades" permite editar id, etiqueta, descripción, tipo, inicial, `from`/`to`, evento, condición, acción, color, curvatura y estilo de línea |
| Eliminar | Supr / Retroceso con la selección, o botón "Eliminar" en el inspector. Eliminar un estado elimina sus transiciones; el estado inicial no puede eliminarse hasta marcar otro |
| Curvatura | Slider, botones −/+, "Recta" o "Auto" en el inspector de la transición |
| Seleccionar varios estados | Arrastrar con el botón izquierdo sobre el lienzo vacío para dibujar una región. Alcanza con que toque un estado. La región selecciona **solo estados**, nunca transiciones |
| Mover varios estados | Con varios seleccionados, arrastrar cualquiera de ellos: todos se desplazan el mismo delta y conservan sus distancias relativas. Es una sola operación de layout y un solo paso de deshacer |
| Desplazar la vista | Arrastrar con el botón derecho sobre el lienzo vacío. El menú contextual del navegador queda suprimido sobre el lienzo. Solo cambia la cámara: ni el modelo ni las posiciones de los estados se tocan |
| Deshacer / rehacer | Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z |
| Reorganizar todo | Botón "Reorganizar" (auto-layout con Dagre). Es la única operación que mueve todos los estados, requiere confirmación y se puede deshacer |
| JSON | Pestaña "JSON": ver, editar y aplicar el documento con validación previa; copiar; descargar |
| Guardar / abrir | "Guardar" persiste en `localStorage` por `machine.id`; "Abrir…" lista guardadas y ejemplos; "Recargar" vuelve a la última versión cargada o guardada. Hay autosave de la copia de trabajo |
| Importar / exportar | Archivos JSON con el formato de arriba |

Al importar o aplicar JSON, la aplicación valida (schema estricto + referencias)
y luego reconcilia: asigna posición a los estados nuevos, elimina metadata
visual huérfana y muestra un aviso con exactamente lo que hizo. Los errores
(IDs duplicados, `from`/`to` a estados inexistentes, inicial inválido, claves
desconocidas) bloquean la importación y se listan.

## Estructura

```
src/domain      modelo, schema, validación, operaciones puras, reconciliación, auto-layout
src/ui/adapter  Documento -> React Flow (geometría de flechas, curvatura automática)
src/ui/store    estado del editor (Zustand), historial, persistencia local
src/ui/components  lienzo, nodo, arista, inspector, panel JSON, barra
tests/          invariantes, operaciones, validación, posicionamiento, geometría, serialización
docs/           arquitectura y JSON Schema
examples/       documentos de ejemplo (uno inspirado en la imagen de referencia, uno sin layout)
scripts/        generación del schema y validador de línea de comandos
```

## Tests

`npm test` ejecuta, entre otros, estos invariantes:

- mover un estado no modifica ninguna transición;
- agregar un estado no modifica las coordenadas de los existentes;
- eliminar una transición no mueve ningún estado;
- una transición sigue conectando los mismos IDs aunque ambos estados se muevan;
- una transición siempre apunta visualmente a su campo `to` (la punta está en el borde del estado destino y su dirección apunta a su centro, para muchas posiciones y curvaturas);
- un estado nuevo sin layout recibe posición y los existentes conservan la suya;
- cambiar color o curvatura no cambia la semántica ni `from`/`to`;
- una transición hacia un ID inexistente se rechaza;
- IDs duplicados, inicial inválido y claves desconocidas se rechazan;
- el JSON Schema publicado coincide con el schema Zod.

## Stack

TypeScript, React 19, Vite 7, [`@xyflow/react`](https://reactflow.dev) 12 (lienzo),
Zod 4 (schema y JSON Schema), `@dagrejs/dagre` (auto-layout explícito), Zustand, Vitest.
