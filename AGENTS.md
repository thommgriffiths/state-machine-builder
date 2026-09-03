# Guía para agentes LLM: cómo modificar una máquina de estados

Este proyecto es un editor de máquinas de estado cuyo formato persistido está
diseñado para que un agente pueda **crear y modificar máquinas editando JSON**,
sin preocuparse por el dibujo. Lee esta guía completa antes de tocar un
documento. El schema formal está en
[`docs/schema/state-machine-document.schema.json`](docs/schema/state-machine-document.schema.json)
y los tipos en [`src/domain/types.ts`](src/domain/types.ts).

## Regla fundamental

> Una máquina de estados es un modelo de negocio que casualmente se visualiza
> como un grafo. No es un dibujo del que se infiere una máquina.

Por eso el documento tiene tres capas separadas que se relacionan **solo por ID**:

| Objetivo                                   | Edita        | No toques           |
| ------------------------------------------ | ------------ | ------------------- |
| Cambiar el negocio (estados, transiciones, eventos, guards, acciones, inicial, finales) | `machine` | `layout`, `styles` |
| Mover elementos en el lienzo               | `layout`     | `machine`, `styles` |
| Cambiar colores, curvatura o estilo de línea | `styles`   | `machine`, `layout` |

**No modifiques `layout` cuando el objetivo es cambiar la lógica de negocio.**
Si agregas un estado y no le das coordenadas, la UI se las asigna
automáticamente (solo a él; los demás no se mueven). Si borras un estado,
puedes borrar sus entradas de `layout`/`styles` o dejar que la UI las elimine:
lo hará y lo informará como "metadata huérfana".

## Formato del documento

```json
{
  "version": 1,
  "machine": {
    "id": "pedido",
    "name": "Ciclo de vida de un pedido",
    "initialStateId": "nuevo",
    "states": [
      { "id": "nuevo", "label": "Nuevo", "type": "normal", "description": "Pedido creado" },
      { "id": "pagado", "label": "Pagado", "type": "normal" },
      { "id": "cancelado", "label": "Cancelado", "type": "final" }
    ],
    "transitions": [
      { "id": "t-pagar", "from": "nuevo", "to": "pagado", "label": "Pagar", "event": "PAGAR", "condition": null, "action": "registrarPago" },
      { "id": "t-cancelar", "from": "nuevo", "to": "cancelado", "event": "CANCELAR" }
    ]
  },
  "layout": {
    "states": {
      "nuevo": { "x": 200, "y": 200 },
      "pagado": { "x": 400, "y": 200 }
    }
  },
  "styles": {
    "defaults": { "stateColor": "#000000", "transitionColor": "#000000" },
    "states": { "cancelado": { "color": "#C0392B" } },
    "transitions": { "t-cancelar": { "color": "#C0392B", "curvature": 0.25, "lineStyle": "dashed" } }
  }
}
```

### `machine` (semántica; obligatoria)

- `id`, `name`: identifican la máquina.
- `initialStateId`: ID de un estado existente. Solo puede ser `null` si no hay estados.
- `states[]`: `{ id, label, type?, description? }`. `type` es `"normal"` (por defecto) o `"final"`.
  Puede haber varios estados finales. El estado inicial **no** se marca con `type`; se define en `initialStateId`.
- `transitions[]`: `{ id, from, to, label?, event?, condition?, action? }`.
  - `from` y `to` son IDs de estados existentes. La flecha siempre apunta a `to`.
  - Toda transición es unidireccional. Una relación en ambos sentidos son **dos transiciones** con IDs distintos.
  - `from === to` es válido (auto-transición; se dibuja como un bucle).
  - `label` es el texto visible; `event`, `condition` (guard) y `action` son propiedades funcionales.
  - `null` y `""` en campos opcionales equivalen a "ausente".

### `layout` (presentación; opcional)

- `states`: `{ [stateId]: { x, y } }` con el **centro** del nodo en píxeles del lienzo. El eje Y crece hacia abajo.
- `viewport` (opcional): cámara `{ x, y, zoom }`. Ignóralo.
- Puede omitirse por completo o contener solo algunos estados. Lo que falte lo completa la UI.

### `styles` (presentación; opcional)

- `defaults.stateColor` / `defaults.transitionColor`: color base (por defecto negro).
- `states[id].color`, `transitions[id].color`: color CSS (usa hex). **El color no tiene semántica**: una transición roja no significa "error" salvo que `machine` lo diga (por ejemplo con `event` o `label`). No infieras negocio a partir de colores.
- `transitions[id].curvature`: número en `[-1, 1]`. `0` es recta; el signo elige el lado; ausente = automática (la UI separa sola las transiciones paralelas). En auto-transiciones controla la posición angular del bucle (0 arriba, 0.5 derecha, -0.5 izquierda, ±1 abajo).
- `transitions[id].lineStyle`: `"solid"` (por defecto) o `"dashed"`.

## Reglas de IDs

1. Todo estado y toda transición tiene un `id` no vacío, **único en todo el documento** (un estado y una transición no pueden compartir id).
2. El ID es la identidad. Las relaciones (`from`, `to`, `initialStateId`, claves de `layout` y `styles`) se expresan **solo** por ID, nunca por etiqueta, posición o índice.
3. No cambies IDs existentes salvo que sea el objetivo. Si renombras uno, propaga el cambio a `from`/`to`, `initialStateId`, `layout.states` y `styles.*`.
4. Para IDs nuevos usa cadenas legibles y estables (`state-42`, `t-pagado-enviado`, `revisando`). El generador de la UI usa `state-N` / `transition-N`.

## Recetas

### Agregar un estado y conectarlo

1. Añade `{ "id": "revision", "label": "Revisión" }` a `machine.states`.
2. Añade las transiciones necesarias a `machine.transitions` (`from`/`to` por ID).
3. **No agregues nada a `layout`.** La UI coloca el estado cerca de sus vecinos.
4. Guarda el JSON.

Resultado esperado: todos los estados existentes conservan exactamente sus coordenadas; el nuevo aparece posicionado y el usuario puede moverlo.

### Eliminar un estado

1. Quita el estado de `machine.states`.
2. Quita (o reasigna) todas las transiciones cuyo `from` o `to` lo referencien: una referencia colgante es un **error de validación**.
3. Si era el inicial, asigna otro `initialStateId`.
4. Opcionalmente quita `layout.states[id]`, `styles.states[id]` y `styles.transitions[...]` de las transiciones eliminadas. Si no lo haces, la UI las elimina y lo informa.

### Cambiar el sentido de una transición

Intercambia `from` y `to` (o crea una transición nueva en sentido contrario con otro id). No toques `layout`.

### Marcar estados finales / cambiar el inicial

- Final: `"type": "final"` en el estado.
- Inicial: cambia `machine.initialStateId`. Debe apuntar a un estado existente.

### Colorear o curvar

Edita solo `styles.transitions[id]` o `styles.states[id]`. Cambiar color o curvatura **jamás** modifica `from`, `to` ni ninguna propiedad de `machine`.

### Reorganizar el diagrama

No lo hagas desde el JSON. Si el usuario quiere un relayout global, tiene el botón "Reorganizar" en la UI. Recalcular todas las coordenadas destruye el trabajo manual de acomodo.

## Validación: qué se rechaza y qué se avisa

Errores (el documento no se acepta):

- claves desconocidas (por ejemplo un typo `lable`): los objetos son estrictos;
- `id` vacío o duplicado;
- transición sin `from` o sin `to`, o que referencia un estado inexistente;
- `initialStateId` inexistente, o `null` habiendo estados;
- posiciones no numéricas; `curvature` fuera de `[-1, 1]`; `version` distinta de `1`.

Advertencias (se aceptan, se muestran, y la reconciliación corrige las de metadata):

- entradas de `layout.states`, `styles.states` o `styles.transitions` que apuntan a elementos inexistentes (se eliminan y se informa);
- máquina sin estados finales; estados inalcanzables desde el inicial; estado final con transiciones salientes.

Comprueba tu trabajo sin abrir la UI:

```bash
npm run validate -- ruta/al/documento.json
```

## Lista de comprobación antes de entregar un JSON

- [ ] `version` es `1` y las claves de primer nivel son `machine`, `layout` (opcional) y `styles` (opcional).
- [ ] Todos los IDs son únicos y no vacíos.
- [ ] Todo `from`/`to` e `initialStateId` apuntan a estados existentes.
- [ ] No inventaste coordenadas para cambiar el negocio, ni moviste estados existentes.
- [ ] No usaste el color para expresar semántica; lo que significa algo está en `machine`.
- [ ] No añadiste campos que no existen en el schema.
- [ ] `npm run validate -- archivo.json` no muestra errores.

## Cómo consume la UI un documento (para entender qué pasa después)

1. `parseDocumentJson` valida la forma (schema Zod) y las referencias.
2. `reconcileDocument` asigna posición a los estados sin `layout` (solo a ellos) y elimina metadata huérfana, informando ambas cosas.
3. El adaptador convierte el documento a nodos y aristas de la librería gráfica; calcula puntos de salida/entrada, curvas y puntas de flecha. Nada de eso se guarda.

Si en el futuro se cambia la librería gráfica, este formato no cambia.
