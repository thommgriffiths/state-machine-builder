/**
 * Valida uno o más archivos JSON de máquina de estados desde la línea de comandos.
 *
 *   npm run validate -- examples/simple.json otro.json
 *
 * Imprime errores (bloqueantes), advertencias y lo que haría la reconciliación
 * (estados que recibirían posición automática, metadata huérfana). Sale con
 * código 1 si algún archivo tiene errores. Pensado para que un agente pueda
 * comprobar su trabajo sin abrir la UI.
 */
import { readFileSync } from 'node:fs';
import { parseDocumentJson } from '../src/domain';

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Uso: npm run validate -- <archivo.json> [más archivos...]');
  process.exit(2);
}

let failed = false;
for (const file of files) {
  const result = parseDocumentJson(readFileSync(file, 'utf8'));
  console.log('== ' + file);
  if (!result.ok) {
    failed = true;
    for (const issue of result.issues) {
      console.log('  ERROR ' + issue.code + (issue.path ? ' @ ' + issue.path : '') + ': ' + issue.message);
    }
    continue;
  }
  const { document, report, warnings } = result;
  console.log(
    '  OK: ' + document.machine.states.length + ' estados, ' + document.machine.transitions.length + ' transiciones.',
  );
  if (report.placedStates.length > 0) console.log('  Recibirían posición automática: ' + report.placedStates.join(', '));
  if (report.prunedLayoutStates.length > 0) console.log('  Layout huérfano (se eliminaría): ' + report.prunedLayoutStates.join(', '));
  if (report.prunedStateStyles.length > 0) console.log('  Estilos de estado huérfanos: ' + report.prunedStateStyles.join(', '));
  if (report.prunedTransitionStyles.length > 0) {
    console.log('  Estilos de transición huérfanos: ' + report.prunedTransitionStyles.join(', '));
  }
  for (const warning of warnings) {
    console.log('  AVISO ' + warning.code + ': ' + warning.message);
  }
}
process.exit(failed ? 1 : 0);
