# Guía de uso

Esta herramienta dibuja **máquinas de estado**: los estados por los que pasa
algo (un trámite, un pedido, un expediente) y las transiciones que lo llevan de
un estado a otro. Sirve para documentar circuitos de negocio de forma precisa y
para que una persona y un modelo de lenguaje (LLM) puedan trabajar sobre la
misma máquina sin pisarse.

Es una página web autocontenida: no necesita servidor ni cuenta, y no manda
nada a ningún lado. Todo lo que hacés queda en tu navegador hasta que exportás
un archivo.

## La idea central

Una máquina se guarda como un archivo JSON con tres partes separadas:

| Parte | Qué contiene | Quién la edita normalmente |
| --- | --- | --- |
| `machine` | el negocio: estados, transiciones, eventos, condiciones, acciones, cuál es el inicial | personas y LLMs |
| `layout` | dónde está cada estado en el lienzo | el lienzo, al arrastrar |
| `styles` | colores (de estados, flechas y grupos), curvatura y estilo de línea | la pestaña Estilo del inspector |

La separación importa: **un LLM puede cambiar la lógica sin desordenar el
dibujo**, y vos podés acomodar el dibujo sin tocar la lógica. Los colores no
significan nada por sí mismos; lo que significa algo está en `machine`.

## Conceptos

- **Estado**: un círculo. Tiene una **etiqueta** (el nombre corto, dentro del
  círculo), un **subtítulo** opcional (una línea, debajo del círculo) y una
  **descripción** opcional, tan larga como haga falta, que no se dibuja: se lee
  en la barra lateral al seleccionarlo. Ahí van reglas, plazos, responsables.
- **Estado inicial**: por donde arranca la máquina. Se marca con una flecha de
  entrada. Hay exactamente uno.
- **Estado final**: donde termina. Se dibuja con doble borde. Puede haber varios.
- **Transición**: una flecha de un estado a otro. Siempre tiene sentido: la
  punta apunta al destino. Si la relación va en ambos sentidos, son dos
  transiciones. Una flecha de un estado a sí mismo es válida (se dibuja como un
  bucle). Además de la etiqueta y la descripción puede llevar **evento** (qué
  la dispara), **condición** (cuándo se permite) y **acción** (qué hace).
- **Estado padre**: agrupa estados que forman una etapa (por ejemplo,
  "Antecedentes"). Se dibuja como una envolvente alrededor de sus estados, con
  el color que le elijas, y se puede **plegar** en un solo nodo para ver el
  circuito en grande. Cada estado puede pertenecer a un padre o quedar suelto.
  Por ahora los padres no se anidan.
- **ID**: el identificador interno de cada estado, transición o padre. Se
  genera solo y es único. No hace falta tocarlo; el inspector lo muestra por si
  necesitás nombrarlo, por ejemplo al hablar con un LLM.

## Primeros pasos

1. En **Abrir…** elegí un ejemplo para ver una máquina armada.
2. **Nueva** crea una máquina vacía. Ponele nombre en la barra lateral.
3. Doble clic en el lienzo (o el botón **+ Estado**) crea un estado. Al
   seleccionarlo, la barra lateral muestra sus propiedades.
4. Para conectar dos estados, arrastrá desde el **anillo exterior** de uno
   hasta el otro. El cuerpo del círculo, en cambio, mueve el estado.
5. **Guardar** (Ctrl/Cmd+S) guarda en este navegador. **Exportar JSON**
   descarga el archivo para compartirlo o respaldarlo.

## El lienzo

| Acción | Cómo |
| --- | --- |
| Crear un estado | Doble clic en el lienzo, o botón "+ Estado" |
| Mover un estado | Arrastrar el círculo (solo cambia su posición) |
| Crear una transición | Arrastrar desde el anillo exterior de un estado hasta otro (o el mismo, para un bucle); o desde el inspector del estado, "Nueva transición hacia…" |
| Editar un estado o una transición | Clic para seleccionar. La barra lateral separa sus propiedades en dos pestañas: **Negocio** (etiqueta, subtítulo, descripción, tipo, inicial, origen y destino, evento, condición, acción) y **Estilo** (color, curvatura, estilo de línea, posición) |
| Marcar el inicial | Botón "Marcar como inicial" en la pestaña Negocio del estado, o el selector "Estado inicial" del inspector de la máquina |
| Estado padre | En la pestaña Negocio del estado, "Pertenece a" elige un padre existente o crea uno en el momento. El inspector de la máquina lista los padres con sus subestados. Eliminar un padre no borra sus subestados: quedan sueltos |
| Color de un grupo | En el inspector de la máquina (sin nada seleccionado), sección "Estados padre": cada uno tiene su paleta. Se elige un solo color y la herramienta lo aclara para el fondo y lo oscurece para el borde y el nombre, así el grupo se tiñe sin tapar los estados de adentro. "Predeterminado" vuelve al azul |
| Plegar un padre | Botón ⊟ junto al nombre de la envolvente, o "Plegar" en la lista de padres. Queda un solo nodo en el centro del grupo; las flechas que entran o salen del grupo se redirigen a él y las internas se ocultan. Arrastrarlo mueve a todos sus subestados. ⊞ o "Desplegar" lo abre de nuevo. Es solo una vista: no cambia el archivo y se pierde al recargar |
| Envolvente naranja | El padre encierra visualmente un estado que no le pertenece. Mové ese estado, o asignalo al padre |
| Eliminar | Supr / Retroceso con algo seleccionado, o botón "Eliminar" en el inspector. Eliminar un estado elimina sus transiciones. El inicial no se puede eliminar hasta marcar otro |
| Curvatura | En la pestaña Estilo de la transición: slider, botones −/+, "Recta" o "Auto". "Auto" separa sola las flechas paralelas |
| Seleccionar varios estados | Arrastrar con el botón izquierdo sobre el lienzo vacío para dibujar una región. Alcanza con que toque un estado. Selecciona solo estados |
| Mover varios estados | Con varios seleccionados, arrastrar cualquiera: todos se desplazan juntos y conservan sus distancias. Es un solo paso de deshacer |
| Desplazar la vista | Arrastrar con el botón derecho sobre el lienzo vacío. Rueda: zoom. "Ajustar vista" encuadra todo |
| Deshacer / rehacer | Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z |
| Reorganizar todo | Botón "Reorganizar": acomoda todos los estados automáticamente. Es la única operación que mueve todo; pide confirmación y se puede deshacer |
| JSON | Botón "JSON" de la barra superior: muestra el documento completo. Se puede editar y **Aplicar** (se valida antes), copiar o descargar. El número naranja es la cantidad de avisos de validación |
| Soltar un archivo | Arrastrar un `.json` sobre el lienzo lo importa. Si no es válido, se informa el error y la máquina abierta queda intacta |

## Guardar, compartir, respaldar

- **Guardar** deja la máquina en este navegador, en esta computadora. Otra
  persona, u otro navegador, no la ve. "Abrir…" lista las guardadas.
- Mientras trabajás hay un guardado automático de la copia de trabajo: si
  cerrás la pestaña sin guardar, al volver la encontrás como la dejaste.
  "Recargar" vuelve a la última versión guardada o cargada.
- Para **compartir o respaldar**, usá **Exportar JSON**. El archivo es
  autocontenido: trae negocio, posiciones y estilos. Quien lo reciba lo abre
  con "Importar JSON" o soltándolo sobre el lienzo. Guardá los archivos junto
  con el resto de la documentación del proyecto; el navegador no es un
  respaldo.
- El punto ● junto al nombre indica cambios sin guardar.

## Trabajar con un LLM

El formato está pensado para que un modelo de lenguaje edite la máquina sin
romper el dibujo. El circuito es:

1. **Ayuda → Guía para LLMs → "Copiar guía + máquina actual"**. Eso copia al
   portapapeles las instrucciones para el modelo y el JSON de la máquina
   abierta.
2. Pegalo en el chat del LLM y agregá tu pedido: "agregá un estado de revisión
   entre X e Y", "documentá en la descripción de cada transición qué área la
   ejecuta", "marcá como finales los estados que no tienen salida".
3. El modelo devuelve el JSON completo. Copialo.
4. En la herramienta, abrí **JSON**, reemplazá el contenido y apretá
   **Aplicar**. Si el JSON tiene errores (un destino que no existe, un id
   repetido), se listan y no se aplica nada. Si está bien, los estados nuevos
   aparecen ubicados automáticamente y los que ya existían no se mueven.
5. Revisá el resultado, acomodá lo que haga falta y **Guardar**.

Consejos:

- Pedile siempre el **JSON completo**, no un fragmento ni un diff.
- Si el modelo movió estados que no debía, deshacé (Ctrl/Cmd+Z) y pedile que
  no toque `layout`. La guía ya se lo dice, pero conviene repetirlo en pedidos
  largos.
- Para pedidos que no cambian el dibujo (descripciones, eventos, condiciones),
  el resultado suele entrar a la primera. Los cambios estructurales grandes
  conviene hacerlos de a pasos.

## Validación

La herramienta valida todo lo que entra, ya sea por importación, por el panel
JSON o desde el lienzo:

- **Errores** (rojo) impiden aplicar: id repetido, transición hacia un estado
  inexistente, inicial inválido, campos desconocidos.
- **Advertencias** (naranja) se aceptan pero conviene mirarlas: estados
  inalcanzables desde el inicial, máquina sin estado final, estado final con
  transiciones salientes, padre sin subestados.

El inspector de la máquina (sin nada seleccionado) muestra la lista completa.

## Problemas frecuentes

- **No veo mi máquina en otra computadora.** Lo guardado vive en el navegador
  donde se guardó. Exportá el JSON y llevalo.
- **Importé un archivo y no pasó nada.** Mirá el aviso: el archivo tiene
  errores y se rechazó entero para no dejar la máquina a medias.
- **Las flechas se superponen.** Seleccioná una y cambiale la curvatura, o
  dejala en "Auto".
- **Perdí el dibujo con "Reorganizar".** Deshacé con Ctrl/Cmd+Z.
- **El navegador abre el archivo en vez de importarlo.** Soltalo sobre el
  lienzo, no sobre la barra lateral ni la superior.
