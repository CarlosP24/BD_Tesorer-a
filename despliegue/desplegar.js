#!/usr/bin/env node
/*
 * Sube el programa (los .js y .html de este repositorio) al script de cada
 * libro: los de los centros activos, el libro plantilla y la consola.
 *
 *   node despliegue/desplegar.js              todos los de despliegue/proyectos.txt
 *   node despliegue/desplegar.js --prueba     dice qué subiría y a dónde, sin subir nada
 *   node despliegue/desplegar.js otra.txt     otra lista
 *
 * proyectos.txt: una línea por script, «ID  # quién». Lo que empieza por #
 * se ignora. Lo da la consola nacional: Tesorería → Consola nacional →
 * Lista de programas para desplegar (DESPLIEGUE.md). No va a git.
 *
 * Usa clasp con la cuenta de administración (`clasp login`) y la API de
 * Apps Script activada en https://script.google.com/home/usersettings.
 * Antes de subir nada pasa las pruebas; si fallan, no sube.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const RAIZ = path.join(__dirname, '..');
const prueba = process.argv.includes('--prueba');
const lista = process.argv.slice(2).find(a => !a.startsWith('--')) || path.join(__dirname, 'proyectos.txt');

if (!fs.existsSync(lista)) {
  console.error(`No está ${path.relative(RAIZ, lista)}. Cópialo de la consola (Lista de programas para desplegar).`);
  process.exit(1);
}
const proyectos = fs.readFileSync(lista, 'utf8').split(/\r?\n/)
  .map(l => l.trim()).filter(l => l && !l.startsWith('#'))
  .map(l => { const m = l.match(/^([-\w]{20,})\s*(?:#\s*(.*))?$/); return m ? { id: m[1], quien: m[2] || '' } : { error: l }; });
const malas = proyectos.filter(p => p.error);
if (malas.length) { console.error('Líneas que no entiendo:\n  ' + malas.map(p => p.error).join('\n  ')); process.exit(1); }
if (!proyectos.length) { console.error('La lista no tiene ningún programa.'); process.exit(1); }

// 1. Las pruebas.
const pruebas = spawnSync(process.execPath, [path.join(RAIZ, 'pruebas', 'ejecutar.js')], { encoding: 'utf8' });
process.stdout.write(pruebas.stdout);
if (pruebas.status !== 0) { console.error(pruebas.stderr || 'Fallan las pruebas: no se sube nada.'); process.exit(1); }

// 2. El manifiesto tiene que ser el del proyecto. Un `clasp create` o un
// `clasp pull` en esta carpeta lo cambia por el de por defecto (sin el
// servicio de Drive: «ReferenceError: Drive is not defined») y pasó.
const manifiesto = JSON.parse(fs.readFileSync(path.join(RAIZ, 'appsscript.json'), 'utf8'));
const servicios = ((manifiesto.dependencies || {}).enabledAdvancedServices || []).map(s => s.userSymbol);
if (manifiesto.timeZone !== 'Europe/Madrid' || servicios.indexOf('Drive') < 0 || !(manifiesto.oauthScopes || []).length) {
  console.error('appsscript.json no es el del proyecto (falta el servicio de Drive, los permisos o la zona horaria). '
    + 'Recupéralo con `git checkout appsscript.json` y no subas nada hasta entonces.');
  process.exit(1);
}

// 3. Solo lo que forma el programa. Nunca Config.js: daría a todos los
// centros los datos de uno.
const archivos = fs.readdirSync(RAIZ).filter(f => /^\d\d_.*\.js$/.test(f) || /\.html$/.test(f) || f === 'appsscript.json');
// La ruta real: en macOS la carpeta temporal pasa por un enlace (/var →
// /private/var) y clasp 3 se niega a subir desde ahí («is a symlink»).
const preparado = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tesoreria-')));
archivos.forEach(f => fs.copyFileSync(path.join(RAIZ, f), path.join(preparado, f)));
fs.writeFileSync(path.join(preparado, '.claspignore'), '.clasp.json\n.claspignore\n');
console.log(`Programa: ${archivos.length} archivos (${archivos.filter(f => f.endsWith('.js')).length} .js). `
  + `Destinos: ${proyectos.length}.${prueba ? ' PRUEBA: no se sube nada.' : ''}\n`);

// 4. A cada script.
let bien = 0;
const mal = [];
proyectos.forEach((p, i) => {
  const etiqueta = `[${i + 1}/${proyectos.length}] ${p.quien || p.id}`;
  if (prueba) { console.log(`${etiqueta}: se subiría a ${p.id}`); return; }
  fs.writeFileSync(path.join(preparado, '.clasp.json'), JSON.stringify({ scriptId: p.id, rootDir: preparado }));
  const r = spawnSync('clasp', ['-P', preparado, '-I', path.join(preparado, '.claspignore'), 'push', '-f'],
    { cwd: preparado, encoding: 'utf8' });
  if (r.status === 0) { bien++; console.log(`✓ ${etiqueta}`); }
  else {
    const motivo = ((r.stderr || '') + (r.stdout || '')).trim().split('\n').slice(-3).join(' ') || (r.error && r.error.message) || '¿?';
    mal.push(`${etiqueta}: ${motivo}`);
    console.log(`✖ ${etiqueta}: ${motivo}`);
  }
});

fs.rmSync(preparado, { recursive: true, force: true });
if (!prueba) {
  console.log(`\nSubido a ${bien} de ${proyectos.length}.`);
  if (mal.length) {
    console.log('Fallaron (vuelve a lanzarlo con una lista solo de esos):\n  ' + mal.join('\n  '));
    process.exit(1);
  }
  console.log('Si la versión cambia la estructura (VERSION_ESTRUCTURA), ahora: Consola nacional → Reparar la estructura de todos los libros.');
}
