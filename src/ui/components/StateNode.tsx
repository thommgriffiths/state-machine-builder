import { Handle, Position, useConnection, type NodeProps } from '@xyflow/react';
import { memo } from 'react';
import type { StateFlowNode } from '../adapter';
import { NODE_RADIUS, RING_PAD } from '../adapter';

function labelFontSize(label: string): number {
  const length = label.length;
  if (length <= 4) return 17;
  if (length <= 6) return 14;
  if (length <= 8) return 12.5;
  if (length <= 10) return 11;
  return 10;
}

function StateNodeComponent({ data, selected }: NodeProps<StateFlowNode>) {
  const inProgress = useConnection((connection) => connection.inProgress);
  const classes = ['state-node', selected ? 'is-selected' : '', inProgress ? 'is-connecting' : ''].filter(Boolean).join(' ');

  return (
    <div className={classes} style={{ '--node-color': data.color } as React.CSSProperties} title={data.stateId}>
      {!inProgress && (
        <Handle type="source" position={Position.Right} className="state-node__ring" title="Arrastra para crear una transición" />
      )}
      <div className="state-node__body">
        {data.isFinal && <div className="state-node__inner-ring" />}
        <span className="state-node__label" style={{ fontSize: labelFontSize(data.label) }}>
          {data.label}
        </span>
      </div>
      {inProgress && <Handle type="target" position={Position.Left} className="state-node__target" isConnectableStart={false} />}
      {data.isInitial && (
        <svg className="state-node__initial-marker" width={RING_PAD + 34} height={16} viewBox={'0 0 ' + (RING_PAD + 34) + ' 16'}>
          <line x1={0} y1={8} x2={RING_PAD + 34 - 12} y2={8} stroke="var(--node-color)" strokeWidth={2} />
          <polygon
            points={[RING_PAD + 34, 8, RING_PAD + 34 - 12, 2.5, RING_PAD + 34 - 12, 13.5].join(' ')}
            fill="var(--node-color)"
          />
        </svg>
      )}
      {data.subtitle && (
        <div className="state-node__subtitle" style={{ top: NODE_RADIUS * 2 + RING_PAD + 2 }}>
          {data.subtitle}
        </div>
      )}
    </div>
  );
}

export const StateNode = memo(StateNodeComponent);
