/**
 * Geometría de transiciones (puramente de presentación).
 *
 * El documento solo conoce `from`, `to` y, opcionalmente, una curvatura. Aquí
 * se calculan puntos de salida/entrada, el path SVG y la punta de flecha.
 *
 * Invariante: la punta (`end`) siempre está sobre el borde del círculo del
 * estado `to`, y `endDirection` apunta hacia su centro. Esto no depende de
 * dónde estén los nodos ni de la curvatura.
 */
export interface Point {
  x: number;
  y: number;
}

export interface TransitionGeometry {
  kind: 'curve' | 'loop';
  /** Atributo `d` del path SVG. */
  path: string;
  /** Punto de salida sobre el borde del estado origen. */
  start: Point;
  /** Punta de la flecha, sobre el borde del estado destino. */
  end: Point;
  /** Vector unitario en la punta, apuntando al centro del estado destino. */
  endDirection: Point;
  /** Triángulo de la punta de flecha (tip, base izquierda, base derecha). */
  arrowhead: [Point, Point, Point];
  /** Punto de anclaje de la etiqueta: junto al punto medio de la curva, del lado exterior. */
  labelPosition: Point;
  /**
   * Vector unitario que apunta desde la curva hacia el lado donde va la
   * etiqueta (exterior del abombamiento; "arriba" en rectas). La UI ancla la
   * caja de texto para que quede completamente de ese lado.
   */
  labelAnchor: Point;
}

/** Separación entre la curva y el borde de la etiqueta. */
export const LABEL_GAP = 5;

export interface GeometryOptions {
  radius: number;
  curvature: number;
  arrowLength: number;
  arrowWidth: number;
  loopSize: number;
}

export function computeTransitionGeometry(from: Point, to: Point, options: GeometryOptions): TransitionGeometry {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) return computeSelfLoop(from, options);

  const unit = { x: dx / length, y: dy / length };
  // `+ 0` evita el -0 de negar un cero (rompe comparaciones estrictas).
  const normal = { x: -unit.y + 0, y: unit.x + 0 };
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const offset = options.curvature * length;
  const control = { x: mid.x + normal.x * offset, y: mid.y + normal.y * offset };

  const start = pointTowards(from, control, options.radius);
  const end = pointTowards(to, control, options.radius);
  const endDirection = unitVector(end, to);
  const midpoint = {
    x: 0.25 * start.x + 0.5 * control.x + 0.25 * end.x,
    y: 0.25 * start.y + 0.5 * control.y + 0.25 * end.y,
  };

  // Lado de la etiqueta: exterior del abombamiento; en rectas, "arriba"
  // (o a la izquierda si la recta es vertical).
  let labelAnchor: Point;
  if (Math.abs(options.curvature) > 1e-6) {
    labelAnchor = options.curvature > 0 ? normal : negate(normal);
  } else if (Math.abs(normal.y) > 1e-6) {
    labelAnchor = normal.y < 0 ? normal : negate(normal);
  } else {
    labelAnchor = normal.x < 0 ? normal : negate(normal);
  }
  const labelPosition = { x: midpoint.x + labelAnchor.x * LABEL_GAP, y: midpoint.y + labelAnchor.y * LABEL_GAP };

  return {
    kind: 'curve',
    path: 'M ' + fmt(start) + ' Q ' + fmt(control) + ' ' + fmt(end),
    start,
    end,
    endDirection,
    arrowhead: arrowhead(end, endDirection, options.arrowLength, options.arrowWidth),
    labelPosition,
    labelAnchor,
  };
}

/**
 * Bucle para auto-transiciones. La curvatura (en [-1, 1]) se interpreta como
 * posición angular del bucle: 0 arriba, 0.5 derecha, -0.5 izquierda, 1 o -1 abajo.
 */
export function computeSelfLoop(center: Point, options: GeometryOptions): TransitionGeometry {
  const theta = -Math.PI / 2 + options.curvature * Math.PI;
  const halfAngle = 0.6;
  const a = theta - halfAngle;
  const b = theta + halfAngle;
  const r = options.radius;
  const k = r + options.loopSize;

  const start = { x: center.x + r * Math.cos(a), y: center.y + r * Math.sin(a) };
  const end = { x: center.x + r * Math.cos(b), y: center.y + r * Math.sin(b) };
  const c1 = { x: center.x + k * Math.cos(a - 0.25), y: center.y + k * Math.sin(a - 0.25) };
  const c2 = { x: center.x + k * Math.cos(b + 0.25), y: center.y + k * Math.sin(b + 0.25) };
  const endDirection = unitVector(end, center);
  const midpoint = {
    x: (start.x + 3 * c1.x + 3 * c2.x + end.x) / 8,
    y: (start.y + 3 * c1.y + 3 * c2.y + end.y) / 8,
  };
  const labelAnchor = unitVector(center, midpoint);
  const labelPosition = { x: midpoint.x + labelAnchor.x * LABEL_GAP, y: midpoint.y + labelAnchor.y * LABEL_GAP };

  return {
    kind: 'loop',
    path: 'M ' + fmt(start) + ' C ' + fmt(c1) + ' ' + fmt(c2) + ' ' + fmt(end),
    start,
    end,
    endDirection,
    arrowhead: arrowhead(end, endDirection, options.arrowLength, options.arrowWidth),
    labelPosition,
    labelAnchor,
  };
}

/** Punto sobre el círculo de centro `center` en la dirección de `towards`. */
function pointTowards(center: Point, towards: Point, radius: number): Point {
  const direction = unitVector(center, towards);
  return { x: center.x + direction.x * radius, y: center.y + direction.y * radius };
}

/** Vector opuesto, evitando -0. */
function negate(p: Point): Point {
  return { x: p.x === 0 ? 0 : -p.x, y: p.y === 0 ? 0 : -p.y };
}

function unitVector(a: Point, b: Point): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-9) return { x: 1, y: 0 };
  return { x: dx / length, y: dy / length };
}

function arrowhead(tip: Point, direction: Point, length: number, width: number): [Point, Point, Point] {
  const base = { x: tip.x - direction.x * length, y: tip.y - direction.y * length };
  const perp = { x: -direction.y, y: direction.x };
  return [
    tip,
    { x: base.x + (perp.x * width) / 2, y: base.y + (perp.y * width) / 2 },
    { x: base.x - (perp.x * width) / 2, y: base.y - (perp.y * width) / 2 },
  ];
}

function fmt(p: Point): string {
  return fmtNumber(p.x) + ' ' + fmtNumber(p.y);
}

function fmtNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}
