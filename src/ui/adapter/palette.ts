/**
 * Paleta derivada del color de un estado padre.
 *
 * El documento guarda **un** color por padre, no tres. La envolvente se dibuja
 * como un tinte claro de ese color con borde del mismo tono y etiqueta
 * oscurecida. Así elegir "azul" tiñe al grupo de azul en vez de taparlo con un
 * bloque azul sólido que escondería a los estados de adentro, y la misma paleta
 * de colores que sirve para un estado sirve para un grupo.
 *
 * Las proporciones están calibradas para que el color por defecto (el azul de
 * la interfaz) reproduzca el aspecto que la envolvente tuvo siempre.
 */

export interface ParentPalette {
  /** Fondo de la envolvente. */
  fill: string;
  /** Borde de la envolvente. */
  border: string;
  /** Texto y borde de la etiqueta: el mismo tono, oscurecido para que se lea. */
  label: string;
}

/** Cuánto del color queda en cada mezcla con blanco (el resto es blanco). */
const FILL_MIX = 0.13;
const BORDER_MIX = 0.4;
/** Factor de oscurecimiento de la etiqueta. */
const LABEL_DARKEN = 0.7;

/** Color con el que se marca un grupo que encierra visualmente a un estado ajeno. */
export const CONFLICT_COLOR = '#C8912F';

interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function parentPalette(color: string): ParentPalette {
  const rgb = parseHexColor(color);
  if (!rgb) {
    // Color CSS no hexadecimal: lo puede escribir un agente en el JSON
    // ("red", "rgb(...)"). La mezcla se delega al navegador.
    return {
      fill: mixCss(color, FILL_MIX),
      border: mixCss(color, BORDER_MIX),
      label: color,
    };
  }
  return {
    fill: toHex(mixWithWhite(rgb, FILL_MIX)),
    border: toHex(mixWithWhite(rgb, BORDER_MIX)),
    label: toHex(darken(rgb, LABEL_DARKEN)),
  };
}

/** `#abc` y `#aabbcc`. Cualquier otra cosa devuelve `undefined`. */
export function parseHexColor(color: string): Rgb | undefined {
  const match = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(color.trim());
  if (!match) return undefined;
  const hex = match[1] as string;
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

function mixWithWhite(rgb: Rgb, ratio: number): Rgb {
  const canal = (c: number) => Math.round(255 - (255 - c) * ratio);
  return { r: canal(rgb.r), g: canal(rgb.g), b: canal(rgb.b) };
}

function darken(rgb: Rgb, factor: number): Rgb {
  return { r: Math.round(rgb.r * factor), g: Math.round(rgb.g * factor), b: Math.round(rgb.b * factor) };
}

function toHex(rgb: Rgb): string {
  const dosDigitos = (c: number) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0');
  return '#' + dosDigitos(rgb.r) + dosDigitos(rgb.g) + dosDigitos(rgb.b);
}

function mixCss(color: string, ratio: number): string {
  return 'color-mix(in srgb, ' + color + ' ' + Math.round(ratio * 100) + '%, #ffffff)';
}
