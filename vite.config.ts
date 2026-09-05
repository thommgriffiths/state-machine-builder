import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * El build produce un único archivo, dist/index.html, con JS, CSS, ejemplos y
 * guías incrustados. Es lo que hace portable a la herramienta: se abre con
 * doble clic (los navegadores bloquean módulos ES externos bajo file://, pero
 * no los inline), se manda por correo y se sube a cualquier hosting estático
 * arrastrando un archivo. Por eso no hay code splitting: no habría dónde
 * cargar los trozos.
 */
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  server: { port: 5173 },
});
