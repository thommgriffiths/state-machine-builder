# Editor de máquinas de estado

Aplicación web para **crear, visualizar y editar máquinas de estado**, con una
separación estricta entre el modelo semántico (`machine`), la geometría de
presentación (`layout`) y los estilos (`styles`). Está pensada para que un
agente LLM pueda modificar máquinas editando el JSON de negocio sin tocar el
dibujo: la interfaz posiciona lo nuevo y conserva exactamente lo que ya estaba.

- Guía de uso (la misma que muestra el botón "Ayuda"): [`docs/guia-humanos.md`](docs/guia-humanos.md)
- Guía para LLMs (formato del JSON y reglas para editarlo; también en "Ayuda"): [`docs/guia-llm.md`](docs/guia-llm.md)
- Notas para agentes que trabajan sobre este repositorio: [`AGENTS.md`](AGENTS.md)
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
npm run build      # versión estática: dist/index.html, un solo archivo
npm run schema     # regenera docs/schema/*.schema.json desde src/domain/schema.ts
npm run validate -- examples/simple.json   # valida archivos JSON desde la terminal
```

## Versión estática: compartir y desplegar

`npm run build` deja en `dist/` **un único archivo**, `index.html`, con todo
adentro: código, estilos, ejemplos y las dos guías. No necesita servidor ni
red, y no manda datos a ningún lado; las máquinas guardadas quedan en el
navegador de cada persona, y se comparten exportando el JSON.

- **Pasarla a colegas**: mandá `dist/index.html`. Se abre con doble clic.
- **Netlify**: arrastrá la carpeta `dist/` en [app.netlify.com/drop](https://app.netlify.com/drop),
  o conectá el repositorio: el `netlify.toml` incluido ya indica el comando
  de build y la carpeta a publicar. Cualquier otro hosting estático sirve igual.

`dist/` no se versiona: se regenera con el comando.

## El documento

```json
{
  "version": 2,
  "machine": {
    "id": "example-machine",
    "name": "Proceso de ejemplo",
    "initialStateId": "state-A",
    "states": [
      { "id": "state-A", "label": "Ingreso", "type": "normal", "subtitle": "Entra el pedido" },
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
  `type` (`normal` | `final`), y `subtitle`, `description` y `parentId` opcionales. Las
  transiciones tienen `id`, `from`, `to` y, opcionalmente, `label`, `event`,
  `condition`, `action` y `description`. El estado inicial es
  `machine.initialStateId`.
- `subtitle` es el texto corto que se dibuja debajo del nodo. `description` es
  el detalle de negocio, tan largo como haga falta: **no se dibuja**, se lee y
  edita en la barra lateral. Estados y transiciones tienen ambas cosas salvo el
  subtítulo, que es solo de los estados.
- Todo lo que está en `machine.states` es un **subestado** y se dibuja. Los
  **estados padre** viven en `machine.parents` y agrupan subestados;
  `state.parentId` referencia uno de ellos. Un subestado sin padre es válido:
  queda suelto. Por ahora los padres son planos, no se anidan. El padre no tiene
  posición propia: el editor dibuja una envolvente alrededor de sus subestados,
  derivada de las posiciones de estos, y puede plegarlo en un solo nodo. Nada
  de eso se guarda en el JSON.
- `layout.states[id]` es el **centro** del nodo. Es opcional: lo que falte se
  posiciona automáticamente (solo eso; nada existente se mueve).
- `styles` guarda color por ID, `curvature` en `[-1, 1]` y `lineStyle`. Los
  colores no tienen semántica.
- Todas las relaciones se expresan por ID. Mover un estado cambia únicamente
  `layout.states[id]`; las flechas se recalculan porque conocen `from`/`to`.

## El editor

Cómo se usa, acción por acción, está en la [guía de uso](docs/guia-humanos.md),
que la aplicación muestra con el botón **Ayuda**. Ese mismo diálogo tiene la
[guía para LLMs](docs/guia-llm.md) con un botón "Copiar guía + máquina
actual": deja en el portapapeles las instrucciones y el JSON abierto, listos
para pegar en un chat y pedir cambios; la respuesta se aplica desde el panel
JSON, con validación previa.

Las dos guías se incrustan en el build desde `docs/`, así que la versión
estática las lleva consigo y no hay dos copias que mantener.

### Versiones del formato

`version` indica la forma del documento. La actual es **2**. Los documentos de
la versión 1, donde el texto dibujado bajo el nodo se llamaba `description`, se
migran solos al abrirlos: ese texto pasa a `subtitle` y la aplicación lo informa
con un aviso. No hay que tocar nada a mano; alcanza con guardar para consolidar
el archivo en el formato nuevo.

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
docs/           guías de uso y para LLMs (se incrustan en la app), arquitectura y JSON Schema
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
- el JSON Schema publicado coincide con el schema Zod;
- un documento de la versión 1 se migra solo al abrirlo y conserva su texto bajo el nodo.

## Stack

TypeScript, React 19, Vite 7 (+ `vite-plugin-singlefile` para el build de un solo archivo),
[`@xyflow/react`](https://reactflow.dev) 12 (lienzo), Zod 4 (schema y JSON Schema),
`@dagrejs/dagre` (auto-layout explícito), Zustand, `marked` (guías en Markdown), Vitest.
