# Arquitectura

## 1. Principio rector

**La semántica manda; el layout y el estilo son metadata de visualización.**

El documento persistido tiene tres capas con responsabilidades disjuntas,
relacionadas exclusivamente por IDs:

```
StateMachineDocument
├── machine   semántica: estados, inicial, finales, transiciones (from/to), eventos, guards, acciones
├── layout    geometría mínima: centro (x, y) de cada estado; viewport opcional
└── styles    presentación: color por ID, curvatura y estilo de línea por transición
```

Un agente puede editar `machine` ignorando por completo las otras dos capas. La
UI reconcilia: posiciona lo que no tiene posición y poda lo que quedó huérfano.

## 2. Capas de código

```
src/
├── domain/                 sin dependencias de UI ni de React Flow; 100 % testeable en Node
│   ├── types.ts            interfaces documentadas (State, Transition, Machine, Layout, Styles, Document)
│   ├── migrate.ts          migración de versiones del formato (v1 → v2), previa al schema
│   ├── schema.ts           schema Zod estricto; genera el JSON Schema publicado
│   ├── validate.ts         validación referencial: IDs, from/to, inicial, huérfanos, lints
│   ├── operations.ts       operaciones puras e inmutables; lanzan DomainError, nunca ocultan errores
│   ├── placement.ts        posición automática SOLO para estados nuevos
│   ├── reconcile.ts        machine + layout + styles -> documento consistente + informe
│   ├── autolayout.ts       relayout global con Dagre (herramienta explícita del usuario)
│   ├── serialize.ts        JSON <-> documento (parse = schema + validación + reconciliación)
│   ├── ids.ts              generación de IDs secuenciales
│   └── jsonSchema.ts       z.toJSONSchema(documentSchema)
├── ui/
│   ├── adapter/            Documento -> React Flow. Único lugar que conoce la librería gráfica
│   │   ├── geometry.ts     curvas, puntos de anclaje, puntas de flecha, bucles
│   │   ├── toFlow.ts       nodos/aristas a partir del documento; curvatura automática; padres plegados
│   │   ├── groups.ts       envolvente de cada estado padre (hull de sus subestados), centroide, intrusos
│   │   └── constants.ts    radio del nodo, tamaño de flecha, etc.
│   ├── store/              Zustand: documento inmutable, selección, padres plegados, deshacer/rehacer, avisos, persistencia
│   └── components/         React: lienzo, nodo, arista, envolventes, nodo plegado, inspector, panel JSON, barra, ayuda
└── examples/               registro de los JSON de /examples
```

Flujo de datos:

```
                 eventos de UI (drag, click, formulario)
                              │
                              ▼
                 store.commit(operación pura del dominio)
                              │  documento nuevo (inmutable)
                              ▼
        documentToFlow(documento, selección)  ── adaptador ──►  <ReactFlow nodes edges />
```

React Flow trabaja en modo controlado: sus nodos y aristas se derivan del
documento en cada render, nunca al revés. Cuando el usuario arrastra un nodo, la
librería emite un cambio de posición; el store lo convierte en
`moveStates(...)`, que solo toca `layout.states[id]`.

## 3. Decisiones técnicas

### React Flow (`@xyflow/react` 12) como motor de lienzo

Resuelve drag-and-drop, viewport (zoom/pan), selección múltiple, teclas de
borrado, minimapa y la infraestructura de aristas custom. Se descartó escribir
un motor SVG propio (reinventar interacción) y Cytoscape (estilizado por hoja de
estilos, menos ergonómico para nodos React). Todo lo específico de React Flow
vive en `src/ui`; el documento no contiene ninguna de sus estructuras.

Adaptaciones relevantes:

- Los nodos son círculos de radio fijo (`NODE_RADIUS`), así el centro guardado en
  `layout` es exacto y la intersección con las flechas es trivial.
- Las aristas son un componente custom que **ignora** las coordenadas de handles
  que calcula React Flow y usa la geometría del adaptador (centros del layout).
- Para crear transiciones se arrastra desde un anillo exterior del nodo (handle
  "source" en forma de anillo); al conectar, un handle "target" invisible cubre
  todo el nodo destino. El cuerpo del círculo arrastra el nodo.
- Se intercepta `onBeforeDelete` para que la eliminación pase por el dominio
  (cascada de transiciones, poda de layout/estilos, rechazo si es el inicial).
- Los nodos se regeneran en cada render (modo controlado). Como su tamaño es
  fijo, el adaptador los entrega ya `measured`; sin eso React Flow los
  considera "no inicializados" y nunca ejecuta el `fitView` encolado, porque
  un nodo con `width`/`height` explícitos no se vuelve a medir.
- Las etiquetas de transición se centran en el punto medio de su curva, dentro
  de una caja opaca ajustada al texto. Al interrumpir la línea, la etiqueta se
  lee como parte de esa transición y no de la vecina, que es el problema real
  en diagramas densos. `geometry.ts` calcula ese punto medio; también expone
  `labelAnchor`, el vector hacia el lado exterior de la curva, que hoy no se
  usa para posicionar pero describe la geometría por si conviene volver a
  correr la etiqueta al costado.

### Estados padre: envolvente y plegado

El padre no tiene posición: su figura es la envolvente convexa de las huellas de
sus subestados (nodo más subtítulo), engrosada `GROUP_PAD`. Se dibuja por
`ViewportPortal`, en coordenadas del lienzo pero fuera del grafo de React Flow,
así no participa del arrastre, la selección por región ni el borrado. Si un
estado ajeno queda dentro de la figura se detecta (`intruders`) y se marca.

El color del grupo vive en `styles.parents[id].color` y es **uno solo**: el
fondo, el borde y la etiqueta se derivan de él en `palette.ts` mezclándolo con
blanco y oscureciéndolo. Guardar tres colores dejaría al usuario combinar un
fondo oscuro con una etiqueta oscura, y a un agente inventando claves; con uno
solo, elegir "azul" tiñe el grupo en vez de taparlo con un bloque azul sólido,
y la paleta de colores de los estados sirve tal cual para los grupos. Las
proporciones están calibradas para que el color por defecto reproduzca el
aspecto que la envolvente tuvo siempre, y un test las fija. El aviso de
conflicto (un ajeno encerrado) pinta el grupo con el color de conflicto por
encima del elegido: importa más que la decoración.

Plegar un padre es **estado de la vista** (`collapsedParentIds` en el store):
no está en el documento, no entra al historial y se descarta al cargar otra
máquina. Al plegar, el adaptador omite los subestados, agrega un nodo de tipo
`parent` en el centroide del polígono de la envolvente (fórmula del
"shoelace", barata y exacta para el polígono), y remapea las transiciones:
las que cruzan el borde apuntan al nodo plegado y las internas no se dibujan.
La curvatura automática se calcula sobre los extremos remapeados, porque varias
transiciones pueden pasar a compartir extremos. El nodo plegado es arrastrable
pero no seleccionable ni borrable; arrastrarlo traslada a todos los subestados
el mismo delta (`substatePositionsForGroupMove`), con lo que el centroide
termina exactamente donde se soltó. Lleva un handle invisible porque React
Flow no dibuja aristas hacia un nodo sin handles.

### Dagre para el auto-layout explícito

`@dagrejs/dagre` es suficiente para grafos dirigidos de decenas o cientos de
nodos y pesa poco. ELK.js ofrece más control pero añade un bundle grande y un
worker; no aporta valor aquí porque el enrutado de aristas lo hace el adaptador.
El relayout solo se ejecuta desde el botón "Reorganizar", con confirmación, y es
reversible con deshacer. Ninguna operación de edición lo invoca.

### Zod 4 como fuente única del schema

Los tipos documentados están en `types.ts`; el schema Zod (`schema.ts`) valida
la forma y se comprueba en compilación que su salida es asignable a esos tipos.
`z.toJSONSchema` genera `docs/schema/state-machine-document.schema.json`; un
test falla si el archivo publicado difiere del generado. Los objetos son
estrictos: un typo en una clave se rechaza en lugar de ignorarse.

### Versionado del formato y migración

`version` describe la forma del documento, y `migrate.ts` la actualiza antes de
validar. La v2 renombró el `description` de los estados a `subtitle` (el texto
que se dibuja bajo el nodo) y dejó `description` libre para el detalle de
negocio, que no se dibuja y ahora también tienen las transiciones.

Migrar en lugar de aceptar las dos formas mantiene el schema estricto y le da a
los agentes un único contrato vigente. La migración corre sobre el JSON crudo,
es idempotente, tolera documentos mal formados (de rechazarlos se encarga la
validación posterior) y devuelve la lista de pasos aplicados para que la UI los
informe en lugar de corregir en silencio.

**La detección no se basa solo en el número de versión.** Existen documentos
estampados como v2 que conservan la forma v1: los produjo una recarga en
caliente durante el desarrollo, que subió la constante de versión antes de que
la migración existiera, y el autosave estampó "2" sobre un documento cuyos
estados todavía guardaban el subtítulo en `description`. Mirando solo `version`
esos documentos quedaban con el texto atrapado en un campo que no se dibuja, y
el diagrama aparecía sin nada bajo los nodos.

Por eso la migración también reconoce la forma, con una condición conservadora:
repara solo si **ningún** estado del documento tiene `subtitle`. Si alguno ya lo
tiene, el documento está en la forma nueva y sus `description` son detalle de
negocio legítimo que no se toca. Las `description` de las transiciones nunca se
mueven. Cuando la reparación ocurre al abrir la copia de trabajo, esa copia se
reescribe ya migrada: si no, el autosave (que solo reacciona a cambios
posteriores) dejaría la forma vieja en disco y habría que repararla en cada
carga.

La lección para el futuro: subir la versión de un formato persistido y escribir
su migración son un mismo cambio, no dos. Separarlos deja una ventana en la que
lo que se guarda queda mal etiquetado.

Y el reverso: **no todo cambio del formato sube la versión.** Agregar una clave
opcional con valor por defecto (`styles.parents` fue el primer caso) deja a
todo documento anterior válido y significando exactamente lo mismo, así que no
hay nada que migrar y subir el número solo obligaría a reescribir archivos que
están bien. La versión sube cuando un documento existente **deja de significar
lo mismo** y hay que transformarlo. Lo que sí cambia con una clave nueva es la
compatibilidad hacia adelante: una copia vieja de la aplicación rechaza el
documento por clave desconocida, porque el schema es estricto a propósito.

### Reconciliación en lugar de relayout

`reconcileDocument` es la operación que hace tolerante al sistema frente a JSON
producido por un LLM:

1. poda entradas de `layout`/`styles` que apuntan a elementos inexistentes;
2. asigna posición a los estados sin `layout` mediante `placeNewStates`;
3. devuelve un informe con todo lo que hizo, que la UI muestra.

`placeNewStates` es determinista y **nunca** cambia posiciones existentes:
coloca cada estado nuevo a la derecha de sus predecesores (o a la izquierda de
sus sucesores) a la altura media de sus vecinos, y si choca busca el hueco libre
más cercano en anillos crecientes. Los estados sin vecinos posicionados van a
una columna nueva a la derecha del diagrama.

### Geometría de transiciones

- Curva cuadrática de Bézier. El punto de control está sobre la mediatriz de la
  cuerda a distancia `curvature × longitud`; el abombamiento máximo es la mitad.
  `curvature = 0` es una recta.
- Los extremos se calculan sobre el borde de cada círculo en dirección al punto
  de control; la punta de flecha queda exactamente en el borde de `to` y su
  dirección apunta a su centro. Esto se comprueba en tests para muchas
  posiciones y curvaturas.
- Auto-transiciones: cúbica en forma de bucle; `curvature` elige el ángulo.
- Curvatura automática: si dos estados tienen varias transiciones (en cualquier
  sentido) y no tienen curvatura explícita, se separan con abombamientos
  opuestos para que no se solapen. Una curvatura explícita (incluido `0`)
  siempre gana.

### Store, historial y persistencia

- Zustand con documento inmutable; cada operación produce un documento nuevo.
- Deshacer/rehacer por instantáneas (el documento es pequeño). Los cambios con
  la misma `coalesceKey` consecutivos (arrastre, tecleo en un campo, slider) se
  agrupan en una sola entrada. Los cambios de cámara no entran al historial.
- Persistencia en `localStorage`: máquinas guardadas por `machine.id` y una copia
  de trabajo con autosave para no perder cambios al recargar. Import/Export son
  archivos JSON con el mismo formato.

### Guías incrustadas y build de un solo archivo

Las guías (`docs/guia-humanos.md`, `docs/guia-llm.md`) son la única copia:
legibles en el repositorio y, vía `import ... ?raw`, incrustadas en la
aplicación y convertidas a HTML con `marked` en el diálogo de Ayuda. Un test
comprueba que los JSON que muestra la guía para LLMs validan y que nombra la
versión vigente del formato, para que no se desactualicen en silencio.

El build (`vite-plugin-singlefile`) produce un único `dist/index.html` con
todo inline. La razón es la portabilidad: los navegadores bloquean los
módulos ES externos cuando la página se abre desde `file://`, pero no los
inline, así que un solo archivo se abre con doble clic, se manda por correo y
se sube a cualquier hosting estático. Se renuncia al code splitting porque no
hay servidor del que cargar trozos.

## 4. Invariantes y dónde se verifican

| Invariante | Dónde se garantiza | Test |
| --- | --- | --- |
| Mover un estado no modifica ninguna transición | `moveStates` solo toca `layout` | `tests/invariants.test.ts` |
| Agregar un estado no cambia coordenadas existentes | `addState` + `placeNewStates` | idem |
| Agregar/eliminar una transición no mueve nada | `addTransition`/`removeTransitions` no tocan `layout` | idem |
| Una transición conecta IDs, no coordenadas | `from`/`to` en `machine`; el adaptador recalcula | idem |
| La flecha siempre apunta a `to` | `computeTransitionGeometry` | `tests/geometry.test.ts`, invariants |
| Un estado sin layout recibe posición; los demás no se mueven | `reconcileDocument` | invariants, `tests/placement.test.ts` |
| Color y curvatura no cambian la semántica | `setTransitionStyle` deja `machine` idéntico (misma referencia) | invariants |
| Referencias a IDs inexistentes se rechazan | `validateDocument`, `parseDocument*`, operaciones | invariants, `tests/validation.test.ts` |
| IDs únicos en todo el documento | `validateDocument`, `assertIdAvailable` | validation, operations |
| Eliminar un estado trata sus transiciones y metadata | `removeStates` | `tests/operations.test.ts` |
| Nunca hay relayout global implícito | Solo `relayoutAll` (botón) llama a `computeAutoLayout` | placement (reconcile no mueve) |

## 5. Cómo reemplazar la librería gráfica

Reescribir `src/ui/adapter/toFlow.ts` (o crear otro adaptador) y los componentes
de `src/ui/components`. `src/domain`, el formato persistido, los tests del
dominio y de geometría no cambian. `geometry.ts` es independiente de React Flow
y puede reutilizarse con cualquier lienzo SVG/Canvas.

## 6. Fuera de alcance (a propósito)

Colaboración multiusuario, backend, autenticación, ejecución de la máquina,
estados jerárquicos/paralelos, figuras libres, editor Bézier completo. El modelo
puede extenderse (por ejemplo con `metadata` opaca en estados y transiciones)
sin romper la separación `machine / layout / styles`.
