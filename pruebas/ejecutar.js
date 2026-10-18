/*
 * Ejecuta pruebasTesoreria() (07_Diagnostico.js) en Node, sin Apps
 * Script. Carga todos los NN_*.js en un mismo contexto, como hace Apps
 * Script, con `const` cambiado a `var` para que sea global.
 *
 *   node pruebas/ejecutar.js
 *
 * Solo sirve para la lógica pura: lo que toca Sheets o Drive no se
 * ejecuta al cargar, así que no hace falta simularlo.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const raiz = path.join(__dirname, '..');
const contexto = vm.createContext({ console: console });
vm.runInContext("var CONFIG = { TITULAR_CUENTA: 'Juventudes Marianas Vicencianas España' };", contexto);

fs.readdirSync(raiz).filter(f => /^\d\d_.*\.js$/.test(f)).sort().forEach(f => {
  const fuente = fs.readFileSync(path.join(raiz, f), 'utf8').replace(/^const /gm, 'var ');
  vm.runInContext(fuente, contexto, { filename: f });
});

const r = vm.runInContext('pruebasTesoreria()', contexto);
console.log(r.fallos.length ? `Fallan ${r.fallos.length} de ${r.total}:\n\n` + r.fallos.join('\n') : `Los ${r.total} casos correctos.`);
process.exit(r.fallos.length ? 1 : 0);
