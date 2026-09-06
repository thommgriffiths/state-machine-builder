import expediente from '../../examples/expediente.json';
import pedidoSinLayout from '../../examples/pedido-sin-layout.json';
import simple from '../../examples/simple.json';

export interface ExampleEntry {
  key: string;
  name: string;
  data: unknown;
}

/**
 * Ejemplos incluidos (los archivos viven en /examples para que humanos y agentes
 * los encuentren). Todo lo que se lista acá viaja dentro del build y queda
 * visible para cualquiera que abra la aplicación desplegada: los documentos
 * reales del proyecto (como examples/circuito-6019-admisibilidad.json) se
 * quedan fuera a propósito y se abren con "Importar JSON".
 */
export const EXAMPLES: ExampleEntry[] = [
  { key: 'expediente', name: 'Circuito de expediente (referencia visual)', data: expediente },
  { key: 'simple', name: 'Proceso de ejemplo (3 estados)', data: simple },
  { key: 'pedido-sin-layout', name: 'Pedido sin layout (posicionamiento automático)', data: pedidoSinLayout },
];
