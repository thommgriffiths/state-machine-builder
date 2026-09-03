import { useMemo } from 'react';
import { validateDocument, type State, type Transition } from '../../domain';
import { resolveCurvatures } from '../adapter';
import { useEditorStore } from '../store/editorStore';
import { ColorInput, CurvatureInput, Field, IdInput, TextInput } from './fields';
import { ValidationList } from './ValidationList';

export function Inspector() {
  const selection = useEditorStore((s) => s.selection);
  const stateCount = selection.stateIds.length;
  const transitionCount = selection.transitionIds.length;

  if (stateCount === 1 && transitionCount === 0) return <StateInspector stateId={selection.stateIds[0] as string} />;
  if (transitionCount === 1 && stateCount === 0) {
    return <TransitionInspector transitionId={selection.transitionIds[0] as string} />;
  }
  if (stateCount + transitionCount > 1) return <MultiInspector />;
  return <MachineInspector />;
}

function stateOption(state: State): string {
  return state.label === state.id ? state.id : state.label + ' (' + state.id + ')';
}

// ---------------------------------------------------------------------------

function MachineInspector() {
  const document = useEditorStore((s) => s.document);
  const updateMachine = useEditorStore((s) => s.updateMachine);
  const makeInitial = useEditorStore((s) => s.makeInitial);
  const issues = useMemo(() => validateDocument(document), [document]);
  const { machine } = document;

  return (
    <div className="inspector">
      <h2 className="inspector__title">Máquina</h2>
      <Field label="Nombre">
        <TextInput value={machine.name} onChange={(v) => updateMachine({ name: v }, 'machine.name')} />
      </Field>
      <Field label="ID" hint="(identifica la máquina al guardar)">
        <TextInput mono value={machine.id} onChange={(v) => updateMachine({ id: v }, 'machine.id')} />
      </Field>
      <Field label="Estado inicial">
        <select className="input" value={machine.initialStateId ?? ''} onChange={(e) => makeInitial(e.target.value)}>
          {machine.initialStateId === null && <option value="">— sin estado inicial —</option>}
          {machine.states.map((s) => (
            <option key={s.id} value={s.id}>
              {stateOption(s)}
            </option>
          ))}
        </select>
      </Field>
      <dl className="stats">
        <div>
          <dt>Estados</dt>
          <dd>{machine.states.length}</dd>
        </div>
        <div>
          <dt>Transiciones</dt>
          <dd>{machine.transitions.length}</dd>
        </div>
        <div>
          <dt>Finales</dt>
          <dd>{machine.states.filter((s) => s.type === 'final').length}</dd>
        </div>
      </dl>

      <h3 className="inspector__subtitle">Validación</h3>
      <ValidationList issues={issues} />

      <h3 className="inspector__subtitle">Cómo usar el lienzo</h3>
      <ul className="hints">
        <li>Doble clic en el lienzo: crear un estado.</li>
        <li>Arrastrar el cuerpo de un estado: moverlo (solo cambia su layout).</li>
        <li>Arrastrar desde el anillo exterior de un estado hasta otro (o el mismo): crear una transición.</li>
        <li>Clic en una flecha o su etiqueta: seleccionarla y editarla aquí.</li>
        <li>Supr / Retroceso: eliminar la selección. Ctrl/Cmd+Z: deshacer.</li>
        <li>Arrastrar con el botón izquierdo sobre el lienzo vacío: región de selección (solo estados).</li>
        <li>Con varios estados seleccionados, arrastrar uno los mueve a todos manteniendo sus distancias.</li>
        <li>Arrastrar con el botón derecho sobre el lienzo vacío: desplazar la vista. Rueda: zoom.</li>
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------

function StateInspector({ stateId }: { stateId: string }) {
  const document = useEditorStore((s) => s.document);
  const updateStateFields = useEditorStore((s) => s.updateStateFields);
  const renameState = useEditorStore((s) => s.renameState);
  const makeInitial = useEditorStore((s) => s.makeInitial);
  const styleState = useEditorStore((s) => s.styleState);
  const createTransition = useEditorStore((s) => s.createTransition);
  const deleteElements = useEditorStore((s) => s.deleteElements);
  const selectTransition = useEditorStore((s) => s.selectTransition);
  const selectState = useEditorStore((s) => s.selectState);

  const state = document.machine.states.find((s) => s.id === stateId);
  if (!state) return null;
  const isInitial = document.machine.initialStateId === stateId;
  const style = document.styles.states[stateId];
  const outgoing = document.machine.transitions.filter((t) => t.from === stateId);
  const incoming = document.machine.transitions.filter((t) => t.to === stateId);
  const position = document.layout.states[stateId];

  return (
    <div className="inspector">
      <h2 className="inspector__title">
        Estado {isInitial && <span className="badge">inicial</span>} {state.type === 'final' && <span className="badge">final</span>}
      </h2>
      <Field label="ID" hint="(Enter para aplicar; se propaga a transiciones, layout y estilos)">
        <IdInput value={state.id} onCommit={(next) => renameState(state.id, next)} />
      </Field>
      <Field label="Etiqueta" hint="(dentro del círculo)">
        <TextInput value={state.label} onChange={(v) => updateStateFields(stateId, { label: v }, 'state.label:' + stateId)} />
      </Field>
      <Field label="Descripción" hint="(debajo del nodo)">
        <TextInput
          multiline
          value={state.description ?? ''}
          onChange={(v) => updateStateFields(stateId, { description: v }, 'state.description:' + stateId)}
        />
      </Field>
      <Field label="Tipo">
        <select
          className="input"
          value={state.type}
          onChange={(e) => updateStateFields(stateId, { type: e.target.value as State['type'] })}
        >
          <option value="normal">normal</option>
          <option value="final">final</option>
        </select>
      </Field>
      <div className="field">
        <span className="field__label">Estado inicial</span>
        <button type="button" className="button" disabled={isInitial} onClick={() => makeInitial(stateId)}>
          {isInitial ? 'Es el estado inicial' : 'Marcar como inicial'}
        </button>
      </div>

      <h3 className="inspector__subtitle">Estilo</h3>
      <Field label="Color" hint="(solo presentación, sin semántica)">
        <ColorInput
          value={style?.color}
          defaultValue={document.styles.defaults.stateColor}
          onChange={(color) => styleState(stateId, { color }, 'state.color:' + stateId)}
        />
      </Field>
      {position && (
        <p className="muted">
          Posición (layout): x={Math.round(position.x)}, y={Math.round(position.y)}
        </p>
      )}

      <h3 className="inspector__subtitle">Transiciones</h3>
      <NewTransitionForm from={stateId} onCreate={(to) => createTransition({ from: stateId, to })} />
      <TransitionLinks title="Salientes" transitions={outgoing} describe={(t) => '→ ' + t.to} onSelect={selectTransition} />
      <TransitionLinks title="Entrantes" transitions={incoming} describe={(t) => '← ' + t.from} onSelect={selectTransition} />
      {(outgoing.length > 0 || incoming.length > 0) && (
        <p className="muted">
          Vecinos:{' '}
          {[...new Set([...outgoing.map((t) => t.to), ...incoming.map((t) => t.from)])].map((id) => (
            <button key={id} type="button" className="link" onClick={() => selectState(id)}>
              {id}
            </button>
          ))}
        </p>
      )}

      <div className="inspector__actions">
        <button type="button" className="button button--danger" onClick={() => deleteElements([stateId], [])}>
          Eliminar estado
        </button>
        <span className="muted">Elimina también sus {outgoing.length + incoming.length} transiciones.</span>
      </div>
    </div>
  );
}

function NewTransitionForm({ from, onCreate }: { from: string; onCreate: (to: string) => void }) {
  const states = useEditorStore((s) => s.document.machine.states);
  return (
    <div className="field">
      <span className="field__label">Nueva transición desde este estado hacia…</span>
      <select
        className="input"
        value=""
        onChange={(e) => {
          if (e.target.value) onCreate(e.target.value);
        }}
      >
        <option value="">Elegir destino…</option>
        {states.map((s) => (
          <option key={s.id} value={s.id}>
            {stateOption(s)}
            {s.id === from ? ' (bucle)' : ''}
          </option>
        ))}
      </select>
    </div>
  );
}

function TransitionLinks({
  title,
  transitions,
  describe,
  onSelect,
}: {
  title: string;
  transitions: Transition[];
  describe: (t: Transition) => string;
  onSelect: (id: string) => void;
}) {
  if (transitions.length === 0) return null;
  return (
    <div className="links">
      <span className="field__label">{title}</span>
      <ul>
        {transitions.map((t) => (
          <li key={t.id}>
            <button type="button" className="link" onClick={() => onSelect(t.id)}>
              {t.label ?? t.event ?? t.id}
            </button>{' '}
            <span className="muted">{describe(t)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------

function TransitionInspector({ transitionId }: { transitionId: string }) {
  const document = useEditorStore((s) => s.document);
  const updateTransitionFields = useEditorStore((s) => s.updateTransitionFields);
  const renameTransition = useEditorStore((s) => s.renameTransition);
  const styleTransition = useEditorStore((s) => s.styleTransition);
  const deleteElements = useEditorStore((s) => s.deleteElements);
  const selectState = useEditorStore((s) => s.selectState);
  const curvatures = useMemo(() => resolveCurvatures(document), [document]);

  const transition = document.machine.transitions.find((t) => t.id === transitionId);
  if (!transition) return null;
  const style = document.styles.transitions[transitionId];
  const states = document.machine.states;
  const key = (field: string) => 'transition.' + field + ':' + transitionId;

  return (
    <div className="inspector">
      <h2 className="inspector__title">Transición</h2>
      <Field label="ID" hint="(Enter para aplicar)">
        <IdInput value={transition.id} onCommit={(next) => renameTransition(transition.id, next)} />
      </Field>
      <div className="field-row">
        <Field label="Origen (from)">
          <select className="input" value={transition.from} onChange={(e) => updateTransitionFields(transitionId, { from: e.target.value })}>
            {states.map((s) => (
              <option key={s.id} value={s.id}>
                {stateOption(s)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Destino (to)">
          <select className="input" value={transition.to} onChange={(e) => updateTransitionFields(transitionId, { to: e.target.value })}>
            {states.map((s) => (
              <option key={s.id} value={s.id}>
                {stateOption(s)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <p className="muted">
        <button type="button" className="link" onClick={() => selectState(transition.from)}>
          {transition.from}
        </button>{' '}
        → {' '}
        <button type="button" className="link" onClick={() => selectState(transition.to)}>
          {transition.to}
        </button>
        {' · '}
        <button
          type="button"
          className="link"
          onClick={() => updateTransitionFields(transitionId, { from: transition.to, to: transition.from })}
          disabled={transition.from === transition.to}
        >
          invertir sentido
        </button>
      </p>
      <Field label="Etiqueta">
        <TextInput value={transition.label ?? ''} onChange={(v) => updateTransitionFields(transitionId, { label: v }, key('label'))} />
      </Field>
      <Field label="Evento">
        <TextInput mono value={transition.event ?? ''} onChange={(v) => updateTransitionFields(transitionId, { event: v }, key('event'))} />
      </Field>
      <Field label="Condición / guard">
        <TextInput
          mono
          value={transition.condition ?? ''}
          onChange={(v) => updateTransitionFields(transitionId, { condition: v }, key('condition'))}
        />
      </Field>
      <Field label="Acción">
        <TextInput mono value={transition.action ?? ''} onChange={(v) => updateTransitionFields(transitionId, { action: v }, key('action'))} />
      </Field>

      <h3 className="inspector__subtitle">Estilo</h3>
      <Field label="Color" hint="(solo presentación, sin semántica)">
        <ColorInput
          value={style?.color}
          defaultValue={document.styles.defaults.transitionColor}
          onChange={(color) => styleTransition(transitionId, { color }, key('color'))}
        />
      </Field>
      <Field label="Curvatura">
        <CurvatureInput
          value={style?.curvature}
          effective={curvatures[transitionId] ?? 0}
          isSelfLoop={transition.from === transition.to}
          onChange={(curvature) => styleTransition(transitionId, { curvature }, key('curvature'))}
        />
      </Field>
      <Field label="Línea">
        <select
          className="input"
          value={style?.lineStyle ?? 'solid'}
          onChange={(e) => styleTransition(transitionId, { lineStyle: e.target.value === 'dashed' ? 'dashed' : undefined })}
        >
          <option value="solid">continua</option>
          <option value="dashed">discontinua</option>
        </select>
      </Field>

      <div className="inspector__actions">
        <button type="button" className="button button--danger" onClick={() => deleteElements([], [transitionId])}>
          Eliminar transición
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

/** "3 estados", "2 transiciones", "3 estados y 2 transiciones" (omite lo que esté en cero). */
function describeSelection(states: number, transitions: number): string {
  const parts: string[] = [];
  if (states > 0) parts.push(states + (states === 1 ? ' estado' : ' estados'));
  if (transitions > 0) parts.push(transitions + (transitions === 1 ? ' transición' : ' transiciones'));
  return parts.length > 0 ? parts.join(' y ') : 'Nada seleccionado';
}

function MultiInspector() {
  const selection = useEditorStore((s) => s.selection);
  const deleteElements = useEditorStore((s) => s.deleteElements);
  const clearSelection = useEditorStore((s) => s.clearSelection);
  return (
    <div className="inspector">
      <h2 className="inspector__title">Selección múltiple</h2>
      <p>{describeSelection(selection.stateIds.length, selection.transitionIds.length)}.</p>
      {selection.stateIds.length > 1 && (
        <p className="muted">Arrastrar cualquiera de ellos mueve a todos, conservando sus distancias.</p>
      )}
      <div className="inspector__actions">
        <button type="button" className="button button--danger" onClick={() => deleteElements(selection.stateIds, selection.transitionIds)}>
          Eliminar selección
        </button>
        <button type="button" className="button" onClick={clearSelection}>
          Deseleccionar
        </button>
      </div>
    </div>
  );
}
