import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  SelectionMode,
  useReactFlow,
  useStoreApi,
  type Connection,
  type ConnectionLineComponentProps,
  type EdgeChange,
  type EdgeTypes,
  type NodeChange,
  type NodeTypes,
  type OnBeforeDelete,
  type Viewport,
} from '@xyflow/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Position } from '../../domain';
import {
  NODE_BOX,
  documentToFlow,
  nodePositionToCenter,
  substatePositionsForGroupMove,
  type FlowNode,
  type TransitionFlowEdge,
} from '../adapter';
import { importFromText } from '../store/documentActions';
import { useEditorStore } from '../store/editorStore';
import { CollapsedParentNode } from './CollapsedParentNode';
import { ParentGroups } from './ParentGroups';
import { StateNode } from './StateNode';
import { TransitionEdge } from './TransitionEdge';

const nodeTypes: NodeTypes = { state: StateNode, parent: CollapsedParentNode };
const edgeTypes: EdgeTypes = { transition: TransitionEdge };

/**
 * Botones del mouse que arrastran el lienzo: solo el derecho (2).
 * El izquierdo queda libre para dibujar la región de selección.
 *
 * Constante a nivel de módulo a propósito: React Flow reconfigura su motor de
 * pan/zoom cada vez que cambia la identidad de este array.
 */
const PAN_MOUSE_BUTTONS = [2];

function ConnectionLine({ fromX, fromY, toX, toY }: ConnectionLineComponentProps) {
  return (
    <g className="connection-line">
      <path d={'M ' + fromX + ' ' + fromY + ' L ' + toX + ' ' + toY} />
      <circle cx={toX} cy={toY} r={4} />
    </g>
  );
}

export function Canvas() {
  const document = useEditorStore((s) => s.document);
  const selection = useEditorStore((s) => s.selection);
  const loadCounter = useEditorStore((s) => s.loadCounter);
  const setSelection = useEditorStore((s) => s.setSelection);
  const moveStatesTo = useEditorStore((s) => s.moveStatesTo);
  const endGesture = useEditorStore((s) => s.endGesture);
  const createTransition = useEditorStore((s) => s.createTransition);
  const createState = useEditorStore((s) => s.createState);
  const deleteElements = useEditorStore((s) => s.deleteElements);
  const updateViewport = useEditorStore((s) => s.updateViewport);
  const notify = useEditorStore((s) => s.notify);
  const collapsedParentIds = useEditorStore((s) => s.collapsedParentIds);

  const { screenToFlowPosition, fitView, setViewport } = useReactFlow<FlowNode, TransitionFlowEdge>();
  const storeApi = useStoreApi();
  const wrapperRef = useRef<HTMLDivElement>(null);
  /** Resalte mientras se arrastra un archivo por encima del lienzo. */
  const [fileOver, setFileOver] = useState(false);

  const { nodes, edges } = useMemo(
    () =>
      documentToFlow(document, {
        stateIds: new Set(selection.stateIds),
        transitionIds: new Set(selection.transitionIds),
        collapsedParentIds: new Set(collapsedParentIds),
      }),
    [document, selection, collapsedParentIds],
  );

  // Al cargar un documento: restaurar su cámara o ajustar la vista.
  useEffect(() => {
    const viewport = useEditorStore.getState().document.layout.viewport;
    const frame = requestAnimationFrame(() => {
      if (viewport) void setViewport(viewport);
      else void fitView({ padding: 0.15, duration: 0 });
    });
    return () => cancelAnimationFrame(frame);
  }, [loadCounter, fitView, setViewport]);

  const onNodesChange = useCallback(
    (changes: NodeChange<FlowNode>[]) => {
      const positions: Record<string, Position> = {};
      let selectionChanged = false;
      const store = useEditorStore.getState();
      const collapsed = new Set(store.collapsedParentIds);
      const stateIds = new Set(store.selection.stateIds);
      for (const change of changes) {
        if (change.type === 'position' && change.position) {
          if (collapsed.has(change.id)) {
            // Arrastrar un padre plegado mueve a todos sus subestados el mismo delta.
            Object.assign(positions, substatePositionsForGroupMove(store.document, change.id, nodePositionToCenter(change.position)));
          } else {
            positions[change.id] = nodePositionToCenter(change.position);
          }
        } else if (change.type === 'select') {
          selectionChanged = true;
          if (change.selected) stateIds.add(change.id);
          else stateIds.delete(change.id);
        }
      }
      if (Object.keys(positions).length > 0) moveStatesTo(positions);
      if (selectionChanged) {
        setSelection({ stateIds: [...stateIds], transitionIds: useEditorStore.getState().selection.transitionIds });
      }
    },
    [moveStatesTo, setSelection],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<TransitionFlowEdge>[]) => {
      // La región de selección es solo para estados. React Flow, además de los
      // nodos encerrados, marca todas las transiciones incidentes a ellos; esas
      // altas se descartan mientras la región está activa. Las bajas siempre se
      // aplican, para que empezar a dibujar la región limpie lo que hubiera.
      //
      // Se mira `userSelectionRect` y no `userSelectionActive`: el rect existe
      // desde el pointerdown y durante todo el gesto, mientras que el flag se
      // activa recién después de emitir estos cambios (que llegan síncronos).
      const boxSelecting = storeApi.getState().userSelectionRect !== null;
      let selectionChanged = false;
      const transitionIds = new Set(useEditorStore.getState().selection.transitionIds);
      for (const change of changes) {
        if (change.type === 'select') {
          if (change.selected && boxSelecting) continue;
          selectionChanged = true;
          if (change.selected) transitionIds.add(change.id);
          else transitionIds.delete(change.id);
        }
      }
      if (selectionChanged) {
        setSelection({ stateIds: useEditorStore.getState().selection.stateIds, transitionIds: [...transitionIds] });
      }
    },
    [setSelection, storeApi],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (connection.source && connection.target) {
        createTransition({ from: connection.source, to: connection.target });
      }
    },
    [createTransition],
  );

  const onBeforeDelete = useCallback<OnBeforeDelete<FlowNode, TransitionFlowEdge>>(
    async ({ nodes: toDeleteNodes, edges: toDeleteEdges }) => {
      deleteElements(
        // Un padre plegado no es un elemento del modelo: no se borra desde el lienzo.
        toDeleteNodes.filter((n) => n.type === 'state').map((n) => n.id),
        toDeleteEdges.map((e) => e.id),
      );
      // El dominio ya aplicó (o rechazó) la eliminación: React Flow no debe hacer nada más.
      return false;
    },
    [deleteElements],
  );

  const onDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.classList.contains('react-flow__pane')) return;
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      createState({ position });
    },
    [createState, screenToFlowPosition],
  );

  const onMoveEnd = useCallback(
    (_event: unknown, viewport: Viewport) => {
      updateViewport({ x: viewport.x, y: viewport.y, zoom: viewport.zoom });
    },
    [updateViewport],
  );

  // --- soltar un archivo sobre el lienzo para importarlo ---------------------

  // Se cuenta enter/leave porque los hijos del lienzo también los disparan y,
  // sin contador, el resaltado parpadearía al pasar sobre un nodo.
  const dragDepth = useRef(0);

  const onDragEnter = useCallback((event: React.DragEvent) => {
    if (!dragCarriesFiles(event)) return;
    event.preventDefault();
    dragDepth.current += 1;
    setFileOver(true);
  }, []);

  const onDragOver = useCallback((event: React.DragEvent) => {
    if (!dragCarriesFiles(event)) return;
    // Sin preventDefault el navegador no permite soltar aquí.
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  const onDragLeave = useCallback((event: React.DragEvent) => {
    if (!dragCarriesFiles(event)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setFileOver(false);
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      if (!dragCarriesFiles(event)) return;
      event.preventDefault();
      dragDepth.current = 0;
      setFileOver(false);

      const files = Array.from(event.dataTransfer.files);
      const file = files[0];
      if (!file) return;
      if (!looksLikeJson(file)) {
        notify('error', 'Solo se pueden importar archivos .json. "' + file.name + '" no lo es.');
        return;
      }
      if (files.length > 1) {
        notify('info', 'Se soltaron ' + files.length + ' archivos; se importa solo "' + file.name + '".');
      }
      void file
        .text()
        .then((text) => {
          if (importFromText(text, 'Importar "' + file.name + '"')) {
            notify('success', 'Importado "' + file.name + '".');
          }
        })
        .catch((error: unknown) => {
          notify('error', 'No se pudo leer "' + file.name + '": ' + (error instanceof Error ? error.message : String(error)));
        });
    },
    [notify],
  );

  return (
    <div
      className={'canvas' + (fileOver ? ' canvas--file-over' : '')}
      ref={wrapperRef}
      onDoubleClick={onDoubleClick}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <ReactFlow<FlowNode, TransitionFlowEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={endGesture}
        onSelectionDragStop={endGesture}
        onConnect={onConnect}
        onBeforeDelete={onBeforeDelete}
        onMoveEnd={onMoveEnd}
        connectionMode={ConnectionMode.Loose}
        connectionRadius={NODE_BOX / 2}
        connectionLineComponent={ConnectionLine}
        // Paneo solo con el botón derecho sobre el lienzo vacío. Pasar el botón 2
        // hace además que React Flow suprima el menú contextual nativo del lienzo.
        panOnDrag={PAN_MOUSE_BUTTONS}
        // El botón izquierdo sobre el lienzo vacío dibuja la región de selección.
        // React Flow solo la inicia si el gesto empieza en el lienzo (no en un nodo)
        // y con el botón 0, así que no compite con arrastrar nodos ni con el paneo.
        selectionOnDrag
        // Basta con que la región toque un estado para seleccionarlo.
        selectionMode={SelectionMode.Partial}
        zoomOnDoubleClick={false}
        minZoom={0.15}
        maxZoom={3}
        deleteKeyCode={['Backspace', 'Delete']}
        multiSelectionKeyCode={['Meta', 'Control']}
        selectionKeyCode="Shift"
        edgesReconnectable={false}
        nodeOrigin={[0, 0]}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1.2} color="#c9c9c9" />
        <ParentGroups />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable nodeColor={(node) => (node.data as { color?: string }).color ?? '#000'} nodeStrokeWidth={0} />
      </ReactFlow>
      {fileOver && (
        <div className="canvas__drop-hint">
          <div className="canvas__drop-card">Soltá el archivo para importar la máquina</div>
        </div>
      )}
    </div>
  );
}

/** ¿El arrastre trae archivos del sistema (y no un nodo del propio lienzo)? */
function dragCarriesFiles(event: React.DragEvent): boolean {
  return Array.from(event.dataTransfer.types ?? []).includes('Files');
}

function looksLikeJson(file: File): boolean {
  return file.type === 'application/json' || file.name.toLowerCase().endsWith('.json');
}
