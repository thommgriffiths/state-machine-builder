/**
 * Envolvente de los estados padre (presentación derivada).
 *
 * Un estado padre no tiene posición propia: su forma se calcula a partir de las
 * posiciones de sus subestados. Por eso `layout` no gana ninguna entrada al
 * agrupar, y mover un subestado reacomoda la forma sola.
 *
 * NO es un rectángulo envolvente. Un rectángulo ocupa todo el hueco entre los
 * subestados y termina encerrando visualmente a estados ajenos que casualmente
 * caen dentro de ese rectángulo. En su lugar se usa la envolvente convexa de la
 * huella de cada subestado, engrosada un poco: abraza al grupo y deja afuera lo
 * que no le pertenece.
 *
 * Aun así la envolvente convexa puede contener a un ajeno que esté justo en el
 * medio del grupo. Eso no se puede evitar con ninguna forma, así que se detecta
 * y se informa en `intruders`.
 */
import type { StateMachineDocument } from '../../domain';
import { NODE_RADIUS, RING_PAD } from './constants';
import type { Point } from './geometry';

export interface ParentGroupShape {
  parentId: string;
  label: string;
  /** Envolvente convexa de las huellas, sin engrosar, en coordenadas del lienzo. */
  hull: Point[];
  /** Cuánto se engrosa la envolvente al dibujarla. */
  pad: number;
  /** Caja que contiene la forma ya engrosada (para dimensionar el SVG). */
  bounds: { x: number; y: number; width: number; height: number };
  /**
   * Centro geométrico de la figura (centroide del polígono de la envolvente).
   * Es donde se dibuja el nodo que reemplaza al grupo cuando está plegado.
   */
  centroid: Point;
  substateCount: number;
  /** Estados que NO son subestados pero caen dentro de la forma. */
  intruders: string[];
}

/** Engrosado de la envolvente. Chico a propósito: cuanto más grande, más fácil es tragarse un ajeno. */
export const GROUP_PAD = 16;

/** Alto reservado bajo el nodo para el subtítulo, y ancho de ese texto. */
const SUBTITLE_BOX = { width: 150, height: 46 };

/** Puntos que delimitan lo que ocupa un subestado en pantalla: el círculo y su subtítulo. */
function footprint(center: Point): Point[] {
  const r = NODE_RADIUS + RING_PAD;
  const subtitleTop = center.y + r;
  const subtitleBottom = subtitleTop + SUBTITLE_BOX.height;
  const halfText = SUBTITLE_BOX.width / 2;
  return [
    { x: center.x - r, y: center.y - r },
    { x: center.x + r, y: center.y - r },
    { x: center.x + r, y: subtitleTop },
    { x: center.x + halfText, y: subtitleBottom },
    { x: center.x - halfText, y: subtitleBottom },
    { x: center.x - r, y: subtitleTop },
  ];
}

export function computeParentGroups(doc: StateMachineDocument): ParentGroupShape[] {
  const shapes: ParentGroupShape[] = [];

  for (const parent of doc.machine.parents) {
    const substates = doc.machine.states.filter((s) => s.parentId === parent.id);
    const points = substates.flatMap((s) => {
      const center = doc.layout.states[s.id];
      return center ? footprint(center) : [];
    });
    if (points.length === 0) continue;

    const hull = convexHull(points);
    const xs = hull.map((p) => p.x);
    const ys = hull.map((p) => p.y);
    const bounds = {
      x: Math.min(...xs) - GROUP_PAD,
      y: Math.min(...ys) - GROUP_PAD,
      width: Math.max(...xs) - Math.min(...xs) + GROUP_PAD * 2,
      height: Math.max(...ys) - Math.min(...ys) + GROUP_PAD * 2,
    };

    const propios = new Set(substates.map((s) => s.id));
    const intruders = doc.machine.states
      .filter((s) => !propios.has(s.id))
      .filter((s) => {
        const center = doc.layout.states[s.id];
        // Basta con que el círculo del ajeno toque la forma para que confunda.
        return center !== undefined && distanceToHull(center, hull) <= GROUP_PAD + NODE_RADIUS;
      })
      .map((s) => s.id);

    shapes.push({
      parentId: parent.id,
      label: parent.label,
      hull,
      pad: GROUP_PAD,
      bounds,
      centroid: polygonCentroid(hull),
      substateCount: substates.length,
      intruders,
    });
  }

  return shapes;
}

/**
 * Centroide de un polígono simple por la fórmula del cordón (shoelace): lineal
 * en la cantidad de vértices y exacto, sin integrar nada. Es el centro de masa
 * de la figura tomada como lámina uniforme, que para una envolvente convexa es
 * el punto que uno señalaría como "el medio".
 *
 * Con menos de tres vértices, o si son colineales, cae al promedio de puntos.
 */
export function polygonCentroid(points: readonly Point[]): Point {
  const n = points.length;
  if (n === 0) return { x: 0, y: 0 };
  const promedio = () => ({
    x: points.reduce((acc, p) => acc + p.x, 0) / n,
    y: points.reduce((acc, p) => acc + p.y, 0) / n,
  });
  if (n < 3) return promedio();

  let area2 = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i += 1) {
    const a = points[i] as Point;
    const b = points[(i + 1) % n] as Point;
    const cruz = a.x * b.y - b.x * a.y;
    area2 += cruz;
    cx += (a.x + b.x) * cruz;
    cy += (a.y + b.y) * cruz;
  }
  if (Math.abs(area2) < 1e-9) return promedio();
  return { x: cx / (3 * area2), y: cy / (3 * area2) };
}

/**
 * Posiciones nuevas de los subestados cuando el nodo plegado del padre se
 * arrastra hasta `newCenter`: todos se desplazan el mismo delta que separa el
 * centroide actual del destino. Trasladar todos los puntos traslada el
 * centroide exactamente igual, así que tras aplicar el movimiento el nodo
 * plegado queda justo donde se soltó, sin acumular error.
 */
export function substatePositionsForGroupMove(
  doc: StateMachineDocument,
  parentId: string,
  newCenter: Point,
): Record<string, Point> {
  const shape = computeParentGroups(doc).find((g) => g.parentId === parentId);
  if (!shape) return {};
  const delta = { x: newCenter.x - shape.centroid.x, y: newCenter.y - shape.centroid.y };
  const result: Record<string, Point> = {};
  for (const state of doc.machine.states) {
    if (state.parentId !== parentId) continue;
    const current = doc.layout.states[state.id];
    if (current) result[state.id] = { x: current.x + delta.x, y: current.y + delta.y };
  }
  return result;
}

/** Path SVG de la envolvente, en coordenadas relativas a `bounds`. */
export function hullPath(shape: ParentGroupShape): string {
  const puntos = shape.hull.map((p) => (p.x - shape.bounds.x).toFixed(2) + ' ' + (p.y - shape.bounds.y).toFixed(2));
  return 'M ' + puntos.join(' L ') + ' Z';
}

/**
 * Distancia de un punto a la envolvente: 0 si está dentro, y si no la distancia
 * al lado más cercano. Con eso se decide si un ajeno queda visualmente adentro.
 */
export function distanceToHull(point: Point, hull: readonly Point[]): number {
  if (hull.length === 0) return Number.POSITIVE_INFINITY;
  if (pointInPolygon(point, hull)) return 0;
  let min = Number.POSITIVE_INFINITY;
  for (let i = 0; i < hull.length; i += 1) {
    const a = hull[i] as Point;
    const b = hull[(i + 1) % hull.length] as Point;
    min = Math.min(min, distanceToSegment(point, a, b));
  }
  return min;
}

function pointInPolygon(p: Point, poly: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[i] as Point;
    const b = poly[j] as Point;
    const cruza = a.y > p.y !== b.y > p.y;
    if (cruza && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const largo = dx * dx + dy * dy;
  if (largo === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / largo;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Envolvente convexa (cadena monótona de Andrew), en orden horario para el eje Y hacia abajo. */
export function convexHull(points: readonly Point[]): Point[] {
  if (points.length <= 2) return [...points];
  const orden = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));

  const cruz = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const construir = (lista: Point[]) => {
    const cadena: Point[] = [];
    for (const p of lista) {
      while (cadena.length >= 2 && cruz(cadena[cadena.length - 2] as Point, cadena[cadena.length - 1] as Point, p) <= 0) {
        cadena.pop();
      }
      cadena.push(p);
    }
    cadena.pop();
    return cadena;
  };

  return [...construir(orden), ...construir([...orden].reverse())];
}
