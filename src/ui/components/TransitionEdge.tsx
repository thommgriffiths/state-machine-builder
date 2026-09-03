import { BaseEdge, EdgeLabelRenderer, type EdgeProps } from '@xyflow/react';
import { memo } from 'react';
import type { TransitionFlowEdge } from '../adapter';
import { useEditorStore } from '../store/editorStore';

function TransitionEdgeComponent({ id, data, selected }: EdgeProps<TransitionFlowEdge>) {
  const selectTransition = useEditorStore((s) => s.selectTransition);
  if (!data) return null;
  const { geometry, color, lineStyle, primaryText, secondaryText } = data;
  const points = geometry.arrowhead.map((p) => p.x.toFixed(2) + ',' + p.y.toFixed(2)).join(' ');
  const dash = lineStyle === 'dashed' ? '8 5' : undefined;
  // Ancla la caja de la etiqueta del lado exterior de la curva: con anchor
  // (0,-1) el borde inferior de la caja queda sobre el punto; con (1,0), el izquierdo.
  const anchorX = -50 + 50 * geometry.labelAnchor.x;
  const anchorY = -50 + 50 * geometry.labelAnchor.y;

  return (
    <>
      {selected && <path d={geometry.path} className="transition-edge__halo" />}
      <BaseEdge
        id={id}
        path={geometry.path}
        interactionWidth={18}
        style={{ stroke: color, strokeWidth: selected ? 2.5 : 2, strokeDasharray: dash }}
      />
      <polygon points={points} fill={color} className="transition-edge__arrow" />
      {(primaryText || secondaryText) && (
        <EdgeLabelRenderer>
          <div
            className={'transition-label nodrag nopan' + (selected ? ' is-selected' : '')}
            style={{
              transform:
                'translate(' + anchorX.toFixed(1) + '%, ' + anchorY.toFixed(1) + '%) translate(' +
                geometry.labelPosition.x.toFixed(2) + 'px, ' + geometry.labelPosition.y.toFixed(2) + 'px)',
              color,
            }}
            onClick={(event) => {
              event.stopPropagation();
              selectTransition(id);
            }}
            title={id}
          >
            {primaryText && <div className="transition-label__primary">{primaryText}</div>}
            {secondaryText && <div className="transition-label__secondary">{secondaryText}</div>}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const TransitionEdge = memo(TransitionEdgeComponent);
