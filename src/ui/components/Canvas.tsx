import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  useReactFlow,
  type Connection,
  type ConnectionLineComponentProps,
  type EdgeChange,
  type EdgeTypes,
  type NodeChange,
  type NodeTypes,
  type OnBeforeDelete,
  type Viewport,
} from '@xyflow/react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { Position } from '../../domain';
import { NODE_BOX, documentToFlow, nodePositionToCenter, type StateFlowNode, type TransitionFlowEdge } from '../adapter';
import { useEditorStore } from '../store/editorStore';
import { StateNode } from './StateNode';
import { TransitionEdge } from './TransitionEdge';

const nodeTypes: NodeTypes = { state: StateNode };
const edgeTypes: EdgeTypes = { transition: TransitionEdge };

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

  const { screenToFlowPosition, fitView, setViewport } = useReactFlow<StateFlowNode, TransitionFlowEdge>();
  const wrapperRef = useRef<HTMLDivElement>(null);

  const { nodes, edges } = useMemo(
    () =>
      documentToFlow(document, {
        stateIds: new Set(selection.stateIds),
        transitionIds: new Set(selection.transitionIds),
      }),
    [document, selection],
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
    (changes: NodeChange<StateFlowNode>[]) => {
      const positions: Record<string, Position> = {};
      let selectionChanged = false;
      const stateIds = new Set(useEditorStore.getState().selection.stateIds);
      for (const change of changes) {
        if (change.type === 'position' && change.position) {
          positions[change.id] = nodePositionToCenter(change.position);
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
      let selectionChanged = false;
      const transitionIds = new Set(useEditorStore.getState().selection.transitionIds);
      for (const change of changes) {
        if (change.type === 'select') {
          selectionChanged = true;
          if (change.selected) transitionIds.add(change.id);
          else transitionIds.delete(change.id);
        }
      }
      if (selectionChanged) {
        setSelection({ stateIds: useEditorStore.getState().selection.stateIds, transitionIds: [...transitionIds] });
      }
    },
    [setSelection],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (connection.source && connection.target) {
        createTransition({ from: connection.source, to: connection.target });
      }
    },
    [createTransition],
  );

  const onBeforeDelete = useCallback<OnBeforeDelete<StateFlowNode, TransitionFlowEdge>>(
    async ({ nodes: toDeleteNodes, edges: toDeleteEdges }) => {
      deleteElements(
        toDeleteNodes.map((n) => n.id),
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

  return (
    <div className="canvas" ref={wrapperRef} onDoubleClick={onDoubleClick}>
      <ReactFlow<StateFlowNode, TransitionFlowEdge>
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
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable nodeColor={(node) => (node.data as { color?: string }).color ?? '#000'} nodeStrokeWidth={0} />
      </ReactFlow>
    </div>
  );
}
