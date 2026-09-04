/**
 * Tipos del dominio.
 *
 * El documento persistido tiene tres capas independientes:
 *
 *   machine  -> modelo semántico de la máquina de estados (fuente de verdad del negocio)
 *   layout   -> posiciones (centro de cada estado) y viewport
 *   styles   -> colores, curvatura y estilo de línea, indexados por ID
 *
 * Las capas se relacionan exclusivamente mediante IDs. Nada del layout ni de los
 * estilos tiene significado de negocio. Ver docs/ARCHITECTURE.md y AGENTS.md.
 */

// ---------------------------------------------------------------------------
// Capa 1: Machine (semántica)
// ---------------------------------------------------------------------------

export type StateType = 'normal' | 'final';

export interface State {
  /** Identidad estable y única (en todo el documento). */
  id: string;
  /** Nombre corto que se muestra dentro del nodo. */
  label: string;
  /** `final` marca un estado terminal. El estado inicial se define en `Machine.initialStateId`. */
  type: StateType;
  /** Texto corto que se dibuja debajo del nodo, junto al label. */
  subtitle?: string;
  /**
   * Detalle de negocio del estado, tan largo como haga falta. No se dibuja en
   * el lienzo: se lee y edita en el inspector.
   */
  description?: string;
  /**
   * ID del estado padre al que pertenece este subestado (ver `ParentState`).
   * Ausente = subestado suelto. Es una relación semántica más, expresada por
   * ID como todas: no implica nada sobre dónde se dibuja el nodo.
   */
  parentId?: string;
}

/**
 * Estado padre: agrupa subestados. NO se dibuja en el lienzo ni participa de
 * las transiciones; existe solo en el modelo. Por eso vive en su propia
 * colección y no en `states`: todo lo que hay en `states` es un subestado que
 * se dibuja, tenga padre o no.
 *
 * Por ahora los padres son planos: agrupan subestados pero no se anidan entre
 * sí.
 */
export interface ParentState {
  /** Identidad estable y única (en todo el documento, junto a estados y transiciones). */
  id: string;
  label: string;
  /** Detalle de negocio del padre. No se dibuja. */
  description?: string;
}

export interface Transition {
  /** Identidad estable y única (en todo el documento). */
  id: string;
  /** ID del estado origen. */
  from: string;
  /** ID del estado destino. La flecha siempre apunta a este estado. */
  to: string;
  /** Etiqueta visible. */
  label?: string;
  /** Evento que dispara la transición. */
  event?: string;
  /** Condición / guard que debe cumplirse. */
  condition?: string;
  /** Acción o función ejecutada al transicionar. */
  action?: string;
  /**
   * Detalle de negocio de la transición, tan largo como haga falta. No se
   * dibuja en el lienzo: se lee y edita en el inspector.
   */
  description?: string;
}

export interface Machine {
  id: string;
  name: string;
  /** ID del estado inicial. Solo puede ser `null` si la máquina no tiene estados. */
  initialStateId: string | null;
  /** Subestados: lo que se dibuja en el lienzo. */
  states: State[];
  transitions: Transition[];
  /** Estados padre que agrupan subestados. No se dibujan. */
  parents: ParentState[];
}

// ---------------------------------------------------------------------------
// Capa 2: Layout (geometría de presentación)
// ---------------------------------------------------------------------------

export interface Position {
  x: number;
  y: number;
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface Layout {
  /** Centro de cada estado, indexado por ID de estado. */
  states: Record<string, Position>;
  /** Posición de la cámara. Opcional, puramente de conveniencia. */
  viewport?: Viewport;
}

// ---------------------------------------------------------------------------
// Capa 3: Styles (presentación)
// ---------------------------------------------------------------------------

export type LineStyle = 'solid' | 'dashed';

export interface StateStyle {
  /** Color CSS (preferentemente hex). Sin semántica. */
  color?: string;
}

export interface TransitionStyle {
  /** Color CSS (preferentemente hex). Sin semántica. */
  color?: string;
  /**
   * Curvatura en [-1, 1]. 0 = recta. Ausente = automática (la UI separa
   * transiciones paralelas/antiparalelas). En auto-transiciones controla
   * la posición angular del bucle.
   */
  curvature?: number;
  lineStyle?: LineStyle;
}

export interface StyleDefaults {
  stateColor: string;
  transitionColor: string;
}

export interface Styles {
  defaults: StyleDefaults;
  states: Record<string, StateStyle>;
  transitions: Record<string, TransitionStyle>;
}

// ---------------------------------------------------------------------------
// Documento persistido
// ---------------------------------------------------------------------------

/**
 * Versión del formato persistido.
 *
 *   1 → los estados tenían `description` como texto dibujado bajo el nodo.
 *   2 → ese texto pasó a llamarse `subtitle`, y `description` es el detalle de
 *       negocio (no se dibuja) que ahora también tienen las transiciones.
 *
 * Los documentos de la versión 1 se migran solos al abrirlos (ver migrate.ts).
 */
export const DOCUMENT_VERSION = 2 as const;

export interface StateMachineDocument {
  version: typeof DOCUMENT_VERSION;
  machine: Machine;
  layout: Layout;
  styles: Styles;
}

export const DEFAULT_STYLE_DEFAULTS: StyleDefaults = {
  stateColor: '#000000',
  transitionColor: '#000000',
};
