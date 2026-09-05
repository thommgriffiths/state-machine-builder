import { ViewportPortal } from '@xyflow/react';
import { useMemo } from 'react';
import { computeParentGroups, hullPath } from '../adapter';
import { useEditorStore } from '../store/editorStore';

/** Grosor del borde de la envolvente. */
const BORDE = 1.5;

/**
 * Dibuja la envolvente de cada estado padre detrás de sus subestados.
 *
 * Va por `ViewportPortal`, que renderiza en coordenadas del lienzo, y no como
 * nodos de React Flow: así la envolvente no participa del arrastre, ni de la
 * selección por región, ni del borrado. Es presentación derivada; el documento
 * no guarda nada de esto.
 *
 * La forma se dibuja como la envolvente convexa engrosada, con el truco de
 * pintarla dos veces: primero con un trazo grueso del color del borde y encima
 * con uno un poco más fino del color de relleno. Eso da el contorno redondeado
 * exacto de la forma engrosada sin tener que calcular el desplazamiento a mano.
 */
export function ParentGroups() {
  const document = useEditorStore((s) => s.document);
  const selectState = useEditorStore((s) => s.selectState);
  const groups = useMemo(() => computeParentGroups(document), [document]);
  if (groups.length === 0) return null;

  return (
    <ViewportPortal>
      {groups.map((group) => {
        const path = hullPath(group);
        const conflicto = group.intruders.length > 0;
        return (
          <div
            key={group.parentId}
            className={'parent-group' + (conflicto ? ' parent-group--conflict' : '')}
            style={{ transform: 'translate(' + group.bounds.x + 'px, ' + group.bounds.y + 'px)' }}
          >
            <svg width={group.bounds.width} height={group.bounds.height} style={{ overflow: 'visible' }}>
              <g transform={'translate(' + group.pad + ', ' + group.pad + ')'}>
                <path className="parent-group__border" d={path} strokeWidth={group.pad * 2 + BORDE * 2} />
                <path className="parent-group__fill" d={path} strokeWidth={group.pad * 2} />
              </g>
            </svg>
            <button
              type="button"
              className="parent-group__label nodrag nopan"
              title={
                conflicto
                  ? 'Este englobador contiene visualmente a ' + group.intruders.join(', ') + ', que no le pertenece(n)'
                  : 'Estado padre · ' + group.substateCount + ' subestado(s)'
              }
              onClick={(event) => {
                event.stopPropagation();
                // El padre no es un nodo seleccionable: llevar al primer
                // subestado es la forma más directa de llegar a su inspector.
                const first = document.machine.states.find((s) => s.parentId === group.parentId);
                if (first) selectState(first.id);
              }}
            >
              {group.label}
              {conflicto && <span className="parent-group__warn" aria-label="conflicto"> ⚠</span>}
            </button>
          </div>
        );
      })}
    </ViewportPortal>
  );
}
