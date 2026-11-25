#!/usr/bin/env node
/*
 * Para el libro que se instaló con Config.js (antes de la configuración en
 * Ajustes): saca sus valores como filas de la hoja Ajustes, listas para
 * pegar ANTES de desplegar la versión nueva y reparar (DESPLIEGUE.md §7).
 * Si no, «Reparar» no los conoce: buscaría las carpetas junto al libro y,
 * si no las encuentra con su nombre, crearía otras vacías.
 *
 *   node despliegue/config-a-ajustes.js              lee ./Config.js
 *   node despliegue/config-a-ajustes.js otro/Config.js
 *
 * Solo escribe en la pantalla: no sube nada a ningún sitio.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..');
const archivo = process.argv[2] || path.join(RAIZ, 'Config.js');
if (!fs.existsSync(archivo)) { console.error(`No está ${archivo}.`); process.exit(1); }

const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(RAIZ, '00_Estructura.js'), 'utf8').replace(/^const /gm, 'var '), ctx);
vm.runInContext(fs.readFileSync(archivo, 'utf8').replace(/^const /gm, 'var '), ctx);
const config = ctx.CONFIG || {};
const filas = Object.keys(ctx.CONFIG_EN_AJUSTES)
  .map(k => [ctx.CONFIG_EN_AJUSTES[k][0], String(config[k] || '').trim(), ctx.CONFIG_EN_AJUSTES[k][1]])
  .filter(f => f[1]);

if (!filas.length) { console.log('Ese Config.js no tiene ningún valor que pasar.'); process.exit(0); }
console.log('Pega estas filas en la hoja Ajustes del libro, debajo de la última fila (columnas A, B y C).');
console.log('Si Sheets avisa de que el rango está protegido, acepta: es solo un aviso.\n');
filas.forEach(f => console.log(f.join('\t')));
console.log(`\n${filas.length} filas. Después: desplegar a ese libro y Tesorería → Ejercicio → Reparar.`);
