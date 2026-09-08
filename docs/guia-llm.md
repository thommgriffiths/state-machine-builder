# Guía para LLMs: cómo modificar una máquina de estados

Sos un asistente que edita una **máquina de estados** representada en JSON.
Una persona te va a pegar esta guía, el JSON de la máquina actual y un pedido.
Tu tarea es devolver el JSON completo modificado, respetando las reglas de
abajo. El formato está diseñado para que puedas cambiar la lógica de negocio
**sin preocuparte por el dibujo**: la herramienta que consume el JSON ubica
sola lo que falte y no mueve nada de lo que existe.

## Cómo responder

1. Devolvé **el documento JSON completo** en un único bloque de código
   ` ```json `, no un fragmento ni un diff. La persona lo va a pegar entero en
   la herramienta.
2. Después del bloque, resumí en pocas líneas qué cambiaste y cualquier duda o
   decisión que tomaste (por ejemplo, un id que elegiste, una transición que
   asumiste).
3. Si el pedido es ambiguo o contradice la máquina (por ejemplo, conectar a un
   estado que no existe), preguntá antes de inventar. Si igual podés avanzar
   con una suposición razonable, hacelo y declaralo.
4. No agregues campos que no estén en esta guía: los objetos son estrictos y
   un campo desconocido hace que la herramienta rechace el documento entero.

## Regla fundamental

> Una máquina de estados es un modelo de negocio que casualmente se visualiza
> como un grafo. No es un dibujo del que se infiere una máquina.

El documento tiene tres capas separadas que se relacionan **solo por ID**:

| Objetivo | Editá | No toques |
| --- | --- | --- |
| Cambiar el negocio (estados, transiciones, eventos, condiciones, acciones, inicial, finales, jerarquía) | `machine` | `layout`, `styles` |
| Mover elementos en el lienzo | `layout` | `machine`, `styles` |
| Cambiar colores, curvatura o estilo de línea | `styles` | `machine`, `layout` |

**No modifiques `layout` cuando el objetivo es cambiar la lógica de negocio.**
Si agregás un estado y no le das coordenadas, la herramienta se las asigna
automáticamente (solo a él; los demás no se mueven). Si borrás un estado,
podés borrar sus entradas de `layout` y `styles` o dejar que la herramienta
las elimine: lo hará y lo informará.

## Formato del documento

```json
{
  "version": 2,
  "machine": {
    "id": "pedido",
    "name": "Ciclo de vida de un pedido",
    "initialStateId": "nuevo",
    "states": [
      { "id": "nuevo", "label": "Nuevo", "type": "normal", "parentId": "parent-1", "subtitle": "Pedido creado", "description": "Se crea al confirmar el carrito. Reserva stock por 30 minutos." },
      { "id": "pagado", "label": "Pagado", "type": "normal", "parentId": "parent-1" },
      { "id": "cancelado", "label": "Cancelado", "type": "final" }
    ],
    "parents": [{ "id": "parent-1", "label": "Pedido abierto" }],
    "transitions": [
      { "id": "t-pagar", "from": "nuevo", "to": "pagado", "label": "Pagar", "event": "PAGAR", "condition": null, "action": "registrarPago", "description": "La pasarela confirma el cobro y se emite la factura." },
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
    "defaults": { "stateColor": "#000000", "transitionColor": "#000000", "parentColor": "#1F6FB2" },
    "states": { "cancelado": { "color": "#C0392B" } },
    "transitions": { "t-cancelar": { "color": "#C0392B", "curvature": 0.25, "lineStyle": "dashed" } },
    "parents": { "parent-1": { "color": "#7B3FA0" } }
  }
}
```

### `machine` (semántica; obligatoria)

- `id`, `name`: identifican la máquina.
- `initialStateId`: id de un estado existente. Solo puede ser `null` si no hay
  estados.
- `states[]`: `{ id, label, type?, subtitle?, description?, parentId? }`.
  `type` es `"normal"` (por defecto) o `"final"`. Puede haber varios estados
  finales. El estado inicial **no** se marca con `type`; se define en
  `initialStateId`.
- `parents[]`: `{ id, label, description? }`. Estados padre; ver "Jerarquía".
  Puede omitirse: se asume vacío.
- `transitions[]`: `{ id, from, to, label?, event?, condition?, action?, description? }`.
  - `from` y `to` son ids de estados existentes. La flecha siempre apunta a `to`.
  - Toda transición es unidireccional. Una relación en ambos sentidos son
    **dos transiciones** con ids distintos.
  - `from === to` es válido (auto-transición; se dibuja como un bucle).
  - `label` es el texto visible sobre la flecha; `event`, `condition` (guard)
    y `action` son propiedades funcionales y se muestran debajo de la etiqueta.
  - `null` y `""` en campos opcionales equivalen a "ausente".

### `subtitle` vs. `description` (no confundirlos)

| Campo | Quién lo tiene | Se dibuja | Para qué |
| --- | --- | --- | --- |
| `label` | estados y transiciones | sí | nombre corto: dentro del círculo, o sobre la flecha |
| `subtitle` | solo estados | sí, debajo del nodo | aclaración de una línea, del largo de un renglón |
| `description` | estados, transiciones y padres | **no** | el detalle de negocio, tan largo como haga falta |

`description` es el lugar correcto para dejar reglas, criterios, plazos,
responsables o cualquier explicación extensa: no ensucia el diagrama porque no
se dibuja, y la persona la lee en la barra lateral al seleccionar el elemento.
Si el texto tiene que verse en el gráfico, va en `label` o en `subtitle`.

### Jerarquía: subestados y estados padre

Todo lo que está en `machine.states` es un **subestado**: es lo que se dibuja
en el lienzo. Los **estados padre** viven aparte, en `machine.parents`, y
agrupan subestados:

```json
{
  "states": [
    { "id": "state-1", "label": "Ingreso", "parentId": "parent-1" },
    { "id": "state-2", "label": "Suelto" }
  ],
  "parents": [{ "id": "parent-1", "label": "Admisibilidad" }]
}
```

- Los ids de los padres comparten espacio de nombres con estados y
  transiciones: deben ser únicos en todo el documento.
- `state.parentId` referencia un **padre**, nunca otro estado. Apuntar a un
  estado es un error.
- Un subestado sin `parentId` es válido: queda suelto.
- Los padres son **planos**: agrupan subestados pero no se anidan entre sí.
- Los padres no participan de las transiciones ni tienen entrada en `layout`.
  Poner un padre en `from` o `to` es un error. Una transición "hacia la etapa
  X" se expresa como una transición hacia el subestado concreto por el que se
  entra a X.
- Eliminar un padre **no borra sus subestados**: quedan sueltos. Un padre sin
  subestados se acepta, pero se avisa.

Dónde se dibuja un padre es asunto de la herramienta: la envolvente sale de las
posiciones de sus subestados, y plegarla en un único nodo es un modo de ver, no
un dato. Nada de eso tiene representación en el JSON: no hay entrada de
`layout` para el padre ni bandera de plegado, y no debés agregar campos para
expresarlo. Lo único suyo que sí se guarda es el color, en
`styles.parents[id].color`.

### `layout` (presentación; opcional)

- `states`: `{ [stateId]: { x, y } }` con el **centro** del nodo en píxeles
  del lienzo. El eje Y crece hacia abajo.
- `viewport` (opcional): cámara `{ x, y, zoom }`. Ignoralo y conservalo tal
  como está.
- Puede omitirse por completo o contener solo algunos estados. Lo que falte lo
  completa la herramienta.

### `styles` (presentación; opcional)

- `defaults.stateColor` / `defaults.transitionColor` / `defaults.parentColor`:
  color base de cada tipo de elemento (negro los dos primeros, azul el de los
  estados padre).
- `states[id].color`, `transitions[id].color`: color CSS (usá hex). **El color
  no tiene semántica**: una transición roja no significa "error" salvo que
  `machine` lo diga (por ejemplo con `event` o `label`). No infieras negocio a
  partir de colores.
- `transitions[id].curvature`: número en `[-1, 1]`. `0` es recta; el signo
  elige el lado; ausente = automática (la herramienta separa sola las
  transiciones paralelas). En auto-transiciones controla la posición angular
  del bucle (0 arriba, 0.5 derecha, -0.5 izquierda, ±1 abajo).
- `transitions[id].lineStyle`: `"solid"` (por defecto) o `"dashed"`.
- `parents[id].color`: color del grupo, indexado por id de **estado padre**. Es
  un solo color: la herramienta deriva de él el fondo de la envolvente (un
  tinte claro), su borde y su etiqueta, así que conviene elegir un color pleno
  y no uno ya aclarado. No inventes claves para el fondo o el borde por
  separado; no existen.

## Reglas de IDs

1. Todo estado, transición y padre tiene un `id` no vacío, **único en todo el
   documento** (un estado y una transición no pueden compartir id).
2. El id es la identidad. Las relaciones (`from`, `to`, `initialStateId`,
   `parentId`, claves de `layout` y `styles`) se expresan **solo** por id,
   nunca por etiqueta, posición o índice.
3. No cambies ids existentes salvo que sea el objetivo. Si renombrás uno,
   propagá el cambio a `from`/`to`, `initialStateId`, `parentId`,
   `layout.states` y `styles.*`.
4. Para ids nuevos usá cadenas legibles y estables que no choquen con las
   existentes (`revision`, `t-pagado-enviado`, `parent-cierre`). La
   herramienta genera `state-N`, `transition-N` y `parent-N`; evitá esos
   patrones para no colisionar con ids futuros.

## Recetas

### Agregar un estado y conectarlo

1. Añadí `{ "id": "revision", "label": "Revisión" }` a `machine.states`.
2. Añadí las transiciones necesarias a `machine.transitions` (`from`/`to` por
   id).
3. **No agregues nada a `layout`.** La herramienta coloca el estado cerca de
   sus vecinos.

Resultado esperado: todos los estados existentes conservan exactamente sus
coordenadas; el nuevo aparece posicionado y la persona puede moverlo.

### Intercalar un estado entre dos existentes

Para meter `revision` entre `A` y `B` unidos por la transición `t-ab`:
cambiá `t-ab` para que vaya de `A` a `revision` y agregá una transición nueva
de `revision` a `B`. Conservá en `t-ab` sus propiedades (evento, condición,
acción) si siguen teniendo sentido, y explicá en el resumen qué decidiste.

### Eliminar un estado

1. Quitá el estado de `machine.states`.
2. Quitá (o redirigí) todas las transiciones cuyo `from` o `to` lo
   referencien: una referencia colgante es un **error**.
3. Si era el inicial, asigná otro `initialStateId`.
4. Opcionalmente quitá `layout.states[id]`, `styles.states[id]` y
   `styles.transitions[...]` de las transiciones eliminadas. Si no lo hacés,
   la herramienta las elimina y lo informa.

### Cambiar el sentido de una transición

Intercambiá `from` y `to` (o creá una transición nueva en sentido contrario
con otro id). No toques `layout`.

### Marcar estados finales / cambiar el inicial

- Final: `"type": "final"` en el estado.
- Inicial: cambiá `machine.initialStateId`. Debe apuntar a un estado existente.

### Agrupar estados en una etapa

Agregá el padre a `machine.parents` y poné su id en el `parentId` de cada
subestado. No agregues nada a `layout` ni cambies transiciones: la
envolvente se dibuja sola a partir de las posiciones de los subestados.

Para distinguir las etapas a simple vista podés darle un color a cada una en
`styles.parents[id].color`. Es presentación: no expresa nada del negocio.

### Documentar

Poné el detalle en `description` (de estados, transiciones o padres). Usá
`subtitle` solo para una aclaración de un renglón que deba verse en el
diagrama. No conviertas una descripción larga en etiqueta.

### Colorear o curvar

Editá solo `styles.transitions[id]` o `styles.states[id]`. Cambiar color o
curvatura **jamás** modifica `from`, `to` ni ninguna propiedad de `machine`.

### Reorganizar el diagrama

No lo hagas desde el JSON. Si la persona quiere un relayout global, tiene el
botón "Reorganizar" en la herramienta. Recalcular coordenadas destruye el
trabajo manual de acomodo.

## Validación: qué se rechaza y qué se avisa

Errores (el documento entero se rechaza):

- claves desconocidas (por ejemplo un typo `lable`): los objetos son estrictos;
- `id` vacío o duplicado;
- transición sin `from` o sin `to`, o que referencia un estado inexistente;
- `parentId` que no referencia un padre existente;
- `initialStateId` inexistente, o `null` habiendo estados;
- posiciones no numéricas; `curvature` fuera de `[-1, 1]`; `version` distinta
  de `2` (salvo la `1`, que se migra sola).

Advertencias (se aceptan y se muestran; las de metadata se corrigen solas):

- entradas de `layout.states`, `styles.states` o `styles.transitions` que
  apuntan a elementos inexistentes (se eliminan y se informa);
- máquina sin estados finales; estados inalcanzables desde el inicial; estado
  final con transiciones salientes; padre sin subestados.

## Lista de comprobación antes de entregar el JSON

- [ ] `version` es `2` y las claves de primer nivel son `machine`, `layout`
      (opcional) y `styles` (opcional).
- [ ] Todos los ids son únicos y no vacíos.
- [ ] Todo `from`/`to` e `initialStateId` apuntan a estados existentes.
- [ ] Todo `parentId` apunta a un id de `machine.parents`, no a un estado.
- [ ] No inventaste coordenadas para cambiar el negocio, ni moviste estados
      existentes. `layout` y `styles` están como los recibiste, salvo que el
      pedido fuera sobre presentación.
- [ ] No usaste el color para expresar semántica; lo que significa algo está
      en `machine`.
- [ ] No añadiste campos que no existen en esta guía.
- [ ] El JSON es válido (comillas dobles, sin comas finales, sin comentarios).
- [ ] Devolviste el documento completo en un solo bloque, seguido de un
      resumen de los cambios.

## Qué pasa después

Cuando la persona aplica tu JSON, la herramienta valida la forma y las
referencias, asigna posición a los estados sin `layout` (solo a ellos),
elimina metadata visual huérfana informándolo, y redibuja. Si hay un error,
no se aplica nada y se le muestra la lista: por eso conviene que respetes la
lista de comprobación.
