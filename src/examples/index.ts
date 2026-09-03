import expediente from '../../examples/expediente.json';
import pedidoSinLayout from '../../examples/pedido-sin-layout.json';
import simple from '../../examples/simple.json';

export interface ExampleEntry {
  key: string;
  name: string;
  data: unknown;
}

/** Ejemplos incluidos (los archivos viven en /examples para que humanos y agentes los encuentren). */
export const EXAMPLES: ExampleEntry[] = [
  { key: 'expediente', name: 'Circuito de expediente (referencia visual)', data: expediente },
  { key: 'simple', name: 'Proceso de ejemplo (3 estados)', data: simple },
  { key: 'pedido-sin-layout', name: 'Pedido sin layout (posicionamiento automático)', data: pedidoSinLayout },
];
