import { Handle, Position, type NodeProps } from '@xyflow/react';
import { memo } from 'react';
import type { CollapsedParentFlowNode } from '../adapter';
import { NODE_RADIUS, RING_PAD, parentPalette } from '../adapter';
import { useEditorStore } from '../store/editorStore';

/** Un poco más chico que en un estado: el círculo tiene el mismo ancho pero el nombre de un grupo suele ser más largo. */
function labelFontSize(label: string): number {
  const length = label.length;
  if (length <= 4) return 15;
  if (length <= 8) return 12;
  if (length <= 11) return 10;
  return 8.5;
}

/**
 * Un estado padre plegado: reemplaza a todos sus subestados por un único nodo
 * en el centroide de la figura del grupo. Arrastrarlo mueve a los subestados.
 *
 * Lleva un handle invisible y no conectable porque React Flow no dibuja una
 * arista hacia un nodo sin handles; las transiciones redirigidas lo necesitan.
 *
 * Usa el color del grupo, igual que la envolvente que reemplaza: el tinte claro
 * como fondo y el tono oscurecido para el trazo, así se lo reconoce plegado y
 * desplegado.
 */
function CollapsedParentNodeComponent({ data }: NodeProps<CollapsedParentFlowNode>) {
  const toggle = useEditorStore((s) => s.toggleParentCollapsed);
  const palette = parentPalette(data.color);
  return (
    <div
      className="parent-node"
      style={{ '--node-color': palette.label, '--node-fill': palette.fill } as React.CSSProperties}
      title={data.parentId}
    >
      <Handle type="source" position={Position.Right} className="parent-node__handle" isConnectable={false} />
      <div className="parent-node__body">
        <div className="parent-node__stack" />
        <span className="parent-node__label" style={{ fontSize: labelFontSize(data.label) }}>
          {data.label}
        </span>
        <span className="parent-node__count" title={data.substateCount + ' subestado(s) plegados'}>
          {data.substateCount}
        </span>
      </div>
      <button
        type="button"
        className="parent-node__expand nodrag nopan"
        title="Desplegar"
        onClick={(event) => {
          event.stopPropagation();
          toggle(data.parentId);
        }}
      >
        ⊞
      </button>
      {data.containsInitial && (
        <svg className="state-node__initial-marker" width={RING_PAD + 34} height={16} viewBox={'0 0 ' + (RING_PAD + 34) + ' 16'}>
          <line x1={0} y1={8} x2={RING_PAD + 34 - 12} y2={8} stroke="var(--node-color)" strokeWidth={2} />
          <polygon
            points={[RING_PAD + 34, 8, RING_PAD + 34 - 12, 2.5, RING_PAD + 34 - 12, 13.5].join(' ')}
            fill="var(--node-color)"
          />
        </svg>
      )}
      <div className="state-node__subtitle" style={{ top: NODE_RADIUS * 2 + RING_PAD + 2 }}>
        {data.substateCount} subestado{data.substateCount === 1 ? '' : 's'} plegado{data.substateCount === 1 ? '' : 's'}
      </div>
    </div>
  );
}

export const CollapsedParentNode = memo(CollapsedParentNodeComponent);
