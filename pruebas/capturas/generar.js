#!/usr/bin/env node
/*
 * Capturas de pantalla de la documentación (docs/assets/img/<página>/NN.png).
 *
 *   npm install --prefix pruebas/capturas      (una vez: instala puppeteer-core)
 *   node pruebas/capturas/generar.js            (todas)
 *   node pruebas/capturas/generar.js efectivo   (solo las que contienen «efectivo»)
 *
 * Usa el Chrome instalado (variable CHROME para otra ruta).
 *
 * TODO lo que sale en las capturas es INVENTADO: socios, proveedores,
 * importes, IBAN (entidad 9999, que no existe) y CIF. La documentación es
 * pública: no metas aquí nada real.
 *
 * - Las ventanas (Asientos.html, Subir.html, Actividad.html, Informes.html)
 *   se abren tal cual, con google.script.run simulado: lo que devuelve el
 *   «servidor» lo calcula el propio código del proyecto (contextoDeVentana(),
 *   planDeTransferencia()…) sobre los datos de abajo. Se rellenan con
 *   clics y teclas, como lo haría una persona.
 * - El informe en PDF se pinta con Informe.html y calcularInforme().
 * - La hoja de cálculo (Caja, Presupuesto, menú…) es una recreación
 *   (hoja.js), con los colores y columnas que pone el código.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const puppeteer = require('puppeteer-core');
const { pantalla, esc } = require('./hoja');

const RAIZ = path.join(__dirname, '..', '..');
const IMG = path.join(RAIZ, 'docs', 'assets', 'img');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'capturas-'));
const FILTRO = process.argv[2] || '';

// ==================================================================
// EL CÓDIGO DEL PROYECTO, COMO EN pruebas/ejecutar.js
// ==================================================================

const G = vm.createContext({ console });
fs.readdirSync(RAIZ).filter(f => /^\d\d_.*\.js$/.test(f)).sort().forEach(f =>
  vm.runInContext(fs.readFileSync(path.join(RAIZ, f), 'utf8').replace(/^const /gm, 'var '), G, { filename: f }));
// Sin hoja Ajustes: la configuración del centro, fija.
Object.assign(G.CONFIG_FIJA, { TITULAR_CUENTA: 'Asociacion De Ejemplo', NOMBRE_CENTRO: 'Centro JMV de ejemplo',
  CARPETA_FACTURAS: 'x', ID_BD_SOCIOS: 'x' });
// Las fechas se crean dentro del contexto: si no, `instanceof Date` falla.
const D = vm.runInContext('(d, m, a, h) => new Date(a, m - 1, d, h || 0)', G);
const json = x => JSON.parse(JSON.stringify(x));

// ==================================================================
// DATOS INVENTADOS
// ==================================================================

const CURSO = '2026-2027';
const HOY = D(25, 11, 2026);
const IBAN_AUTOBUS = 'ES82 9999 0001 2345 6789 0123';
const IBAN_ALBERGUE = 'ES05 9999 0002 1098 7654 3210';
const URL_FACTURA = 'https://drive.google.com/file/d/EJEMPLO/view';
const TRAMOS = { '10-15': 'I11', '16-30': 'I12', '31+': 'I13' };

const CANDIDATOS = [
  ['000001', 'Lucía', 'Gómez Ruiz', '10-15', 20, 'Sí'], ['000002', 'Pablo', 'Gómez Ruiz', '16-30', 30, 'Sí'],
  ['000005', 'María Isabel', 'Robles Pardo', '10-15', 20, 'No'], ['000006', 'Hugo', 'Fernández Castillo', '10-15', 20, 'No'],
  ['000007', 'Sofía', 'Navarro Gil', '16-30', 30, 'No'], ['000008', 'Andrés', 'Molina Yáñez', '16-30', 30, 'No'],
  ['000009', 'Clara Inés', 'Ortega Luna', '16-30', 30, 'No'], ['000011', 'Daniel', 'Herrera Campos', '10-15', 20, 'No'],
  ['000012', 'Daniela', 'Herrera Campos', '10-15', 20, 'No']
].map(x => ({ id: 'JMV-' + x[0], nombre: x[1], apellidos: x[2], familia: '', tutores: [], tramo: x[3], cuota: x[4], pagada: x[5] }));

const CONCEPTO_SIN_IDENTIFICAR = 'Transferencia Inmediata De Jorge Robles Sanz, Concepto Pago de Mari Robles Pardo';
const NOTA_SIN_IDENTIFICAR = G.identificarMovimiento({ concepto: CONCEPTO_SIN_IDENTIFICAR, importe: 20 },
  { curso: CURSO, titular: 'Asociacion De Ejemplo', candidatos: CANDIDATOS, tramos: TRAMOS }).nota;

// Caja, en su orden (por fecha de pago; lo pendiente, al final).
const ASIENTOS = [
  { 'ID Transacción': '20260904-01', 'Fecha': D(4, 9, 2026), 'Concepto Banco': 'Transferencia Inmediata De Ana Ruiz Gil, Concepto Lucia Gomez Cuota26',
    'Descripción': 'Cuota ' + CURSO, 'Partida': 'I11', 'ID socio': 'JMV-000001', 'Cantidad': 20, 'Método de pago': 'Transferencia',
    'Fecha de pago': D(4, 9, 2026), 'Saldo extracto': 1270, 'BD Socios': '✓ PAG-000101', 'Huella extracto': 'h' },
  { 'ID Transacción': '20260905-01', 'Fecha': D(5, 9, 2026), 'Concepto Banco': 'Pago Con Tarjeta En Papeleria Central',
    'Descripción': 'Cartulinas y rotuladores', 'Partida': 'G12', 'Proveedor': 'Papelería Central SL', 'CIF proveedor': 'B12345674',
    'Cantidad': -45.9, 'Factura': URL_FACTURA, 'Método de pago': 'Tarjeta', 'Fecha de pago': D(5, 9, 2026), 'Saldo extracto': 1224.1, 'Huella extracto': 'h' },
  { 'ID Transacción': '20260915-01', 'Fecha': D(15, 9, 2026), 'Descripción': 'Cuota ' + CURSO, 'Partida': 'I12', 'ID socio': 'JMV-000002',
    'Cantidad': 30, 'Método de pago': 'Efectivo', 'Fecha de pago': D(15, 9, 2026), 'BD Socios': '✓ PAG-000102' },
  { 'ID Transacción': '20260918-01', 'Fecha': D(18, 9, 2026), 'Concepto Banco': 'Ingreso En Cajero Automatico 0049 El 18/09/2026',
    'Descripción': 'Ingreso de efectivo en el banco', 'Partida': 'Traspaso', 'Cantidad': 30, 'Método de pago': 'Ingreso en cajero',
    'Fecha de pago': D(18, 9, 2026), 'Saldo extracto': 1254.1, 'Huella extracto': 'h' },
  { 'ID Transacción': '20260918-02', 'Fecha': D(18, 9, 2026), 'Descripción': 'Efectivo ingresado en el banco (20260918-01)', 'Partida': 'Traspaso',
    'Cantidad': -30, 'Método de pago': 'Efectivo', 'Fecha de pago': D(18, 9, 2026) },
  { 'ID Transacción': '20261001-01', 'Fecha': D(1, 10, 2026), 'Concepto Banco': 'Recibo Telefonia Ejemplo Sa', 'Cantidad': -9.95,
    'Método de pago': 'Domiciliación', 'Fecha de pago': D(1, 10, 2026), 'Saldo extracto': 1244.15, 'Huella extracto': 'h' },
  { 'ID Transacción': '20261003-01', 'Fecha': D(3, 10, 2026), 'Concepto Banco': 'Pago Con Tarjeta En Libreria Del Barrio', 'Cantidad': -23.5,
    'Método de pago': 'Tarjeta', 'Fecha de pago': D(3, 10, 2026), 'Saldo extracto': 1220.65, 'Huella extracto': 'h' },
  { 'ID Transacción': '20261008-01', 'Fecha': D(8, 10, 2026), 'Concepto Banco': 'Pago Con Tarjeta En Supermercado Ejemplo', 'Cantidad': -112,
    'Método de pago': 'Tarjeta', 'Fecha de pago': D(8, 10, 2026), 'Saldo extracto': 1108.65, 'Huella extracto': 'h' },
  { 'ID Transacción': '20261012-01', 'Fecha': D(12, 10, 2026), 'Concepto Banco': 'Pago Con Tarjeta En Autocares Del Valle',
    'Descripción': 'Autobús de la convivencia', 'Partida': 'G23', 'Subpartida': 'G23T', 'Proveedor': 'Autocares del Valle SL',
    'Cantidad': -60, 'Método de pago': 'Tarjeta', 'Fecha de pago': D(12, 10, 2026), 'Saldo extracto': 1048.65, 'Huella extracto': 'h' },
  { 'ID Transacción': '20261014-01', 'Fecha': D(14, 10, 2026), 'Concepto Banco': CONCEPTO_SIN_IDENTIFICAR, 'Cantidad': 20,
    'Método de pago': 'Transferencia', 'Fecha de pago': D(14, 10, 2026), 'Saldo extracto': 1068.65, 'Huella extracto': 'h' },
  { 'ID Transacción': '20261016-01', 'Fecha': D(16, 10, 2026), 'Concepto Banco': 'Transferencia Inmediata De Marta Gil Prieto, Concepto Cuotas Sofia Y Andres',
    'Descripción': 'Cuota ' + CURSO, 'ID socio': 'JMV-000007, JMV-000008', 'Cantidad': 40, 'Método de pago': 'Transferencia',
    'Fecha de pago': D(16, 10, 2026), 'Saldo extracto': 1108.65, 'Huella extracto': 'h',
    'BD Socios': '⚠ El ingreso (40,00 €) no es la suma de sus cuotas (60,00 €): divide el asiento (Caja → Dividir el asiento seleccionado).' },
  { 'ID Transacción': '20261020-01', 'Fecha': D(20, 10, 2026), 'Descripción': 'Celo y pegamento', 'Partida': 'G12', 'Cantidad': -5,
    'Método de pago': 'Efectivo', 'Fecha de pago': D(20, 10, 2026) },
  { 'ID Transacción': '20261118-01', 'Fecha': D(18, 11, 2026), 'Descripción': 'Señal del albergue', 'Partida': 'G23', 'Subpartida': 'G23A',
    'Proveedor': 'Albergue Los Pinos', 'CIF proveedor': 'G12345674', 'Cantidad': -125.4, 'Método de pago': 'Transferencia',
    'Cuenta de abono': IBAN_ALBERGUE, 'Titular': 'Albergue Los Pinos', 'Fecha de pago': 'Pendiente',
    'Asunto transferencia': '20261118-01 Senal del albergue convivencia' }
];
const NOTAS = { '20261014-01': { 'ID socio': NOTA_SIN_IDENTIFICAR } };
const FILAS = ASIENTOS.map(a => G.filaNuevaDeCaja(a));
const CAJA_FILAS = FILAS.map((v, i) => G.filaDeCaja(v, G.CAJA.PRIMERA_FILA + i));
const INICIALES = { banco: 1250, efectivo: 60 };

const IMPORTES = { I11: 600, I12: 450, I13: 60, I21: 300, I22: 0, I31: 800, I41: 100, I23: 900,
                   G11: 350, G12: 150, G13: 80, G21: 200, G22: 0, G31: 300, G41: 50, G23: 1200 };
const lado = (xs, extra) => xs.concat([extra]).map(x => ({ codigo: x[0], descripcion: x[1],
  seccion: G.SECCIONES[parseInt(x[0].charAt(1), 10) - 1], importe: IMPORTES[x[0]] || 0 }));
const PARTIDAS = { ingresos: lado(G.PRESUPUESTO.INGRESOS, ['I23', 'Convivencia de otoño']),
                   gastos: lado(G.PRESUPUESTO.GASTOS, ['G23', 'Convivencia de otoño']) };
const ACTIVIDAD = { nombre: 'Act · Convivencia de otoño', titulo: 'Convivencia de otoño', tipo: 'actividad', ingresos: 'I23', gastos: 'G23',
  subpartidas: [['G23A', 'Alojamiento', 700], ['G23M', 'Manutención', 300], ['G23T', 'Transporte', 150], ['G23MT', 'Material', 50]]
    .map(x => ({ codigo: x[0], descripcion: x[1], presupuesto: x[2] })) };
const SUBPARTIDAS = G.listaDeSubpartidas([ACTIVIDAD]);
const AJ = { ejercicio: CURSO, inicio: D(1, 9, 2026), fin: D(31, 8, 2027, 23), curso: CURSO, tramos: TRAMOS };
const CTXV = G.ctxDeValidacion(CAJA_FILAS, PARTIDAS, SUBPARTIDAS, AJ, INICIALES);
const VENTANA = json(G.contextoDeVentana(CAJA_FILAS, PARTIDAS, SUBPARTIDAS, AJ, INICIALES, HOY, { facturas: true, bdSocios: true }));
const SOCIOS = CANDIDATOS.map(c => ({ id: c.id, nombre: `${c.nombre} ${c.apellidos}`, apellidos: c.apellidos, tramo: c.tramo,
  cuota: c.cuota, partida: TRAMOS[c.tramo], pagada: c.pagada }));

// Lo que la ventana manda al guardar en cada historia, y lo que devolvería el servidor.
const NUEVA_TRANSFERENCIA = { fecha: '2026-11-25', importe: '150,00', proveedor: 'Autocares del Valle SL', cif: 'B98765431',
  cuentaAbono: IBAN_AUTOBUS, titular: '', partida: 'G23', subpartida: 'G23T', descripcion: 'Autobús de vuelta de la convivencia',
  asunto: 'Autobus convivencia otono' };
function respuestaTransferencia(d) {
  const plan = G.planDeTransferencia(d, CTXV);
  if (plan.errores.length) throw new Error('La transferencia de ejemplo no es válida: ' + plan.errores.join(' '));
  plan.valores['ID Transacción'] = '20261125-01';
  plan.valores['Asunto transferencia'] = G.asuntoDeTransferencia('20261125-01', plan.textoAsunto);
  return { asiento: json(G.asientoParaVentana(G.filaDeCaja(G.filaNuevaDeCaja(plan.valores), 17))), lineas: [] };
}
const COMPLETAR = { id: '20261008-01', partida: 'G23', subpartida: 'G23M', descripcion: 'Comida de la convivencia',
  proveedor: 'Supermercado Ejemplo SA' };
function respuestaCompletar() {
  const f = CAJA_FILAS.find(x => x.id === COMPLETAR.id);
  const cambios = {};
  ['partida', 'subpartida', 'descripcion', 'proveedor'].forEach(k => { cambios[k] = { antes: f[k], despues: COMPLETAR[k] }; });
  const plan = G.planDeCambios(f, cambios, CTXV);
  const v = FILAS[CAJA_FILAS.indexOf(f)].slice();
  Object.keys(plan.escribir).forEach(c => { v[G.colCaja(c) - 1] = plan.escribir[c]; });
  v[G.colCaja('Factura') - 1] = URL_FACTURA;
  return { asiento: json(G.asientoParaVentana(G.filaDeCaja(v, f.fila))),
    lineas: ['Guardado.', `Guardada como ${f.id}.pdf en la carpeta ${CURSO} de facturas.`] };
}

// ==================================================================
// VENTANAS: plantilla de HtmlService + google.script.run simulado
// ==================================================================

/** Evalúa una plantilla de HtmlService (<? ?>, <?= ?>, <?!= ?>) dentro del contexto del proyecto. */
function plantilla(html, vars) {
  let codigo = 'var __o = "";\n', ultimo = 0, m;
  const re = /<\?(!?=)?([\s\S]*?)\?>/g;
  while ((m = re.exec(html)) !== null) {
    codigo += '__o += ' + JSON.stringify(html.slice(ultimo, m.index)) + ';\n';
    if (m[1] === '=') codigo += '__o += __esc(' + m[2] + ');\n';
    else if (m[1] === '!=') codigo += '__o += (' + m[2] + ');\n';
    else codigo += m[2] + '\n';
    ultimo = re.lastIndex;
  }
  codigo += '__o += ' + JSON.stringify(html.slice(ultimo)) + ';\nreturn __o;';
  const nombres = Object.keys(vars);
  const fn = vm.runInContext(`(function (__esc, ${nombres.join(', ')}) {\n${codigo}\n})`, G);
  return fn(esc, ...nombres.map(k => vars[k]));
}

/** El script que hace de google.script.run. `respuestas`: nombre de función → lo que devuelve. */
function simulador(respuestas) {
  return `<script>
window.__R = ${JSON.stringify(respuestas)};
window.__guardados = [];
window.__nuevos = [];
window.__responder = function (k, arg) {
  if (k === 'datosDeAsientos') {
    var d = JSON.parse(JSON.stringify(__R.datosDeAsientos));
    __guardados.forEach(function (a) {
      d.asientos = d.asientos.map(function (x) { return x.id === a.id ? a : x; })
        .filter(function (x) { return x.pendiente || x.completar || x.faltaFactura; });
    });
    __nuevos.forEach(function (a) { d.asientos.push(a); d.ids.push(a.id); });
    return d;
  }
  var r = __R[k];
  if (k === 'guardarCambiosDeAsiento' && r) __guardados.push(r.asiento);
  if (k === 'guardarTransferencia' && r) __nuevos.push(r.asiento);
  if (r === undefined) throw new Error('Simulador: sin respuesta para ' + k);
  return JSON.parse(JSON.stringify(r));
};
window.google = { script: { host: { close: function () {} }, run: (function () {
  function hacer(ok, mal) {
    return new Proxy({}, { get: function (t, k) {
      if (k === 'withSuccessHandler') return function (f) { return hacer(f, mal); };
      if (k === 'withFailureHandler') return function (f) { return hacer(ok, f); };
      return function (arg) { setTimeout(function () {
        try { var r = __responder(k, arg); if (ok) ok(r); } catch (e) { if (mal) mal(e); }
      }, 40); };
    } });
  }
  return hacer(null, null);
})() } };
</script>`;
}

let contador = 0;
/** Escribe la ventana (y, si lleva marco, la página que la enseña como un diálogo de Sheets). Devuelve la ruta. */
function ventana(archivo, vars, respuestas, marco) {
  const html = plantilla(fs.readFileSync(path.join(RAIZ, archivo + '.html'), 'utf8'), vars)
    .replace('<head>', '<head>' + simulador(respuestas || {}));
  const nombre = `v${++contador}-${archivo}.html`;
  fs.writeFileSync(path.join(TMP, nombre), html);
  if (!marco) return path.join(TMP, nombre);
  const envoltorio = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body { margin: 0; background: #7f8389; font-family: 'Google Sans', Arial, sans-serif; }
    #modal { position: absolute; left: 24px; top: 24px; background: #fff; border-radius: 8px; box-shadow: 0 12px 40px rgba(0,0,0,.35); }
    #modal .tit { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px 10px 24px; font-size: 20px; color: #1f1f1f; }
    #modal .tit span { font-size: 18px; color: #444; }
    iframe { display: block; border: 0; margin: 0 8px 8px; }
  </style></head><body><div id="modal"><div class="tit">${esc(marco.titulo)}<span>✕</span></div>
  <iframe src="${nombre}" width="${marco.ancho}" height="${marco.alto}"></iframe></div></body></html>`;
  const env = path.join(TMP, `marco-${contador}.html`);
  fs.writeFileSync(env, envoltorio);
  return env;
}

const ASIENTOS_MARCO = { titulo: 'Tesorería · asientos', ancho: 1150, alto: 760 };
const asientos = (seccion, inicial) => ventana('Asientos', { seccion: seccion, inicial: inicial || '' }, {
  datosDeAsientos: VENTANA, sociosParaEfectivo: SOCIOS, guardarTransferencia: respuestaTransferencia(NUEVA_TRANSFERENCIA),
  guardarCambiosDeAsiento: respuestaCompletar(), guardarEfectivo: { ids: [], lineas: [] },
  apuntarTraspaso: 'Apuntado: 20261125-01 (banco, 90,00 €) y 20261125-02 (efectivo, -90,00 €).'
}, ASIENTOS_MARCO);

// ==================================================================
// LA HOJA (recreación)
// ==================================================================

const AMARILLO = '#FFF2CC', NARANJA = '#FCE8B2', AZUL = '#DCEBFA', GRIS = '#F3F3F3', CREMA = '#FFF6E5', CABECERA = '#6075BB';
const ANCHO_HOJA = { 'ID Transacción': 100, 'Fecha': 112, 'Concepto Banco': 205, 'Descripción': 165, 'Partida': 72, 'Subpartida': 80,
  'ID socio': 108, 'Proveedor': 150, 'CIF proveedor': 92, 'Cantidad': 84, 'Saldo': 88, 'Factura': 128, 'Método de pago': 112,
  'Cuenta de abono': 150, 'Titular': 102, 'Fecha de pago': 88, 'Saldo extracto': 92, 'BD Socios': 360, 'Asunto transferencia': 230 };
const PESTANAS = ['Caja', 'Presupuesto', 'Cuentas', 'Act · Convivencia de otoño', 'Ajustes', 'Log'];
const esFecha = d => !!d && typeof d === 'object' && typeof d.getTime === 'function';
const fecha = d => esFecha(d) ? G.fechaCorta(d) : String(d || '');
const euros = n => n === null || n === undefined || n === '' ? '' : G.euros(n);

/** Saldo de cada fila de Caja, como la fórmula de K3. */
function saldos() {
  let banco = INICIALES.banco, efectivo = INICIALES.efectivo;
  return CAJA_FILAS.map(f => {
    if (f.pendiente || f.cantidad === null) return '';
    if (f.esEfectivo) { efectivo += f.cantidad; return efectivo; }
    banco += f.cantidad; return banco;
  });
}
const SALDOS = saldos();
const FINAL = { banco: SALDOS.filter((x, i) => x !== '' && !CAJA_FILAS[i].esEfectivo).pop(),
                efectivo: SALDOS.filter((x, i) => x !== '' && CAJA_FILAS[i].esEfectivo).pop() };

/** Una celda de datos de Caja con el formato que le darían el código y el formato condicional. */
function celdaDeCaja(i, nombre) {
  const f = CAJA_FILAS[i], v = FILAS[i][G.colCaja(nombre) - 1];
  const c = { t: esFecha(v) ? fecha(v) : (typeof v === 'number' ? euros(v) : String(v || '')) };
  if (['Fecha', 'Fecha de pago', 'Cantidad', 'Saldo', 'Saldo extracto'].indexOf(nombre) >= 0) c.alinear = 'right';
  if (nombre === 'Saldo') { c.t = euros(SALDOS[i]); c.fondo = GRIS; }
  if (['Partida', 'Subpartida', 'Método de pago'].indexOf(nombre) >= 0 && c.t) c.chip = true;
  if (nombre === 'Partida' && !c.t && f.cantidad !== null) c.fondo = AMARILLO;
  if (nombre === 'Factura') {
    if (c.t) { c.t = 'drive.google.com/file/d/EJEMPLO'; c.color = '#1155cc'; }
    else if (f.cantidad < 0 && f.partida !== 'Traspaso' && f.metodo !== 'Cargo bancario') c.fondo = AMARILLO;
  }
  if (nombre === 'Fecha de pago' && f.pendiente) { c.fondo = AZUL; c.alinear = 'left'; }
  if (['Saldo extracto', 'BD Socios'].indexOf(nombre) >= 0) { c.fondo = GRIS; c.color = '#666'; }
  if (nombre === 'BD Socios' && c.t.charAt(0) === '⚠') { c.fondo = NARANJA; c.color = '#222'; }
  if (NOTAS[f.id] && NOTAS[f.id][nombre]) c.nota = NOTAS[f.id][nombre];
  return c;
}

/** Las filas 1 a 3 de Caja: saldos y cabecera. */
function cabeceraDeCaja(nombres) {
  const fila1 = { 'ID Transacción': { t: 'Saldo inicial', negrita: true },
    'Fecha': { t: 'Banco: ' + euros(INICIALES.banco), fondo: CREMA, alinear: 'right' },
    'Concepto Banco': { t: 'Efectivo: ' + euros(INICIALES.efectivo), fondo: CREMA, alinear: 'right' },
    'Descripción': { t: 'Total: ' + euros(INICIALES.banco + INICIALES.efectivo), negrita: true, alinear: 'right' },
    'Proveedor': { t: 'Último asiento', negrita: true, alinear: 'right' }, 'CIF proveedor': { t: '18/11/2026', alinear: 'right' } };
  const fila2 = { 'ID Transacción': { t: 'Saldo actual', negrita: true },
    'Fecha': { t: 'Banco: ' + euros(FINAL.banco), alinear: 'right' }, 'Concepto Banco': { t: 'Efectivo: ' + euros(FINAL.efectivo), alinear: 'right' },
    'Descripción': { t: 'Total: ' + euros(FINAL.banco + FINAL.efectivo), negrita: true, alinear: 'right' },
    'Proveedor': { t: 'Banco según extracto', negrita: true, alinear: 'right' }, 'CIF proveedor': { t: euros(FINAL.banco), alinear: 'right' } };
  return [
    { n: 1, celdas: nombres.map(c => fila1[c] || null) },
    { n: 2, celdas: nombres.map(c => fila2[c] || null) },
    { n: 3, alto: 34, celdas: nombres.map(c => ({ t: c === 'Saldo' ? 'Saldo' : c, fondo: CABECERA, color: '#fff', negrita: true, ajustar: true })) }
  ];
}

/** Op de pantalla() para una vista de Caja con esas columnas (las dos primeras, inmovilizadas). */
function vistaCaja(nombres, op) {
  op = op || {};
  const indices = op.indices || CAJA_FILAS.map((f, i) => i);
  const filas = cabeceraDeCaja(nombres).concat(indices.map(i => ({ n: G.CAJA.PRIMERA_FILA + i,
    celdas: nombres.map(c => celdaDeCaja(i, c)) })));
  const extra = (op.vacias || 0);
  for (let k = 0; k < extra; k++) filas.push({ n: filas[filas.length - 1].n + 1, celdas: [] });
  return Object.assign({ titulo: 'Ejercicio 26-27', columnas: nombres.map(c => ({ letra: G.letraCaja(c), ancho: ANCHO_HOJA[c] })),
    fijas: 2, filasFijas: 3, filas: filas, pestañas: PESTANAS, activa: 'Caja', celda: 'A4', formula: '20260904-01' }, op);
}
const fila = id => CAJA_FILAS.findIndex(f => f.id === id);
const nCaja = id => G.CAJA.PRIMERA_FILA + fila(id);
const PRINCIPALES = ['ID Transacción', 'Fecha', 'Concepto Banco', 'Descripción', 'Partida', 'Subpartida'];

function vistaPresupuesto(real) {
  const P = PARTIDAS, n = Math.max(P.ingresos.length, P.gastos.length);
  const realDe = codigo => {
    const s = CAJA_FILAS.filter(f => f.partida === codigo && f.cantidad !== null).reduce((t, f) => t + f.cantidad, 0);
    return codigo.charAt(0) === 'G' ? -s : s;
  };
  const imp = p => real ? realDe(p.codigo) : p.importe;
  const filas = [];
  const cab = real ? ['Sección', 'Ingresos', 'Gastos', 'Balance'] : ['Sección', 'Ingresos', 'Gastos'];
  filas.push({ n: 1, celdas: cab.map(t => ({ t: t, fondo: CABECERA, color: '#fff', negrita: true })) });
  const tot = { i: 0, g: 0 };
  G.SECCIONES.forEach((s, k) => {
    const i = P.ingresos.filter(p => p.seccion === s).reduce((t, p) => t + imp(p), 0);
    const g = P.gastos.filter(p => p.seccion === s).reduce((t, p) => t + imp(p), 0);
    tot.i += i; tot.g += g;
    const c = [{ t: s }, { t: euros(i), alinear: 'right' }, { t: euros(g), alinear: 'right' }];
    if (real) c.push({ t: euros(i - g), alinear: 'right' });
    filas.push({ n: k + 2, celdas: c });
  });
  if (real) {
    filas.push({ n: 6, celdas: [{ t: 'Total', negrita: true }, { t: euros(tot.i), alinear: 'right', negrita: true },
      { t: euros(tot.g), alinear: 'right', negrita: true }, { t: euros(tot.i - tot.g), alinear: 'right', negrita: true }] });
    const sin = CAJA_FILAS.filter(f => f.cantidad !== null && !f.partida);
    const neto = sin.reduce((t, f) => t + f.cantidad, 0);
    filas.push({ n: 7, celdas: [{ t: `⚠ Hay ${sin.length} asientos sin partida en Caja (${G.euros(neto).replace(' €', '')} €): no cuentan aquí.`, cursiva: true }] });
    filas.push({ n: 8, celdas: [{ t: '✓ Todas las partidas usadas en Caja están en el Presupuesto.', cursiva: true }] });
    filas.push({ n: 9, celdas: [{ t: '✓ Los traspasos entre banco y efectivo cuadran.', cursiva: true }] });
  } else {
    filas.push({ n: 6, celdas: [] }, { n: 7, celdas: [] });
    filas.push({ n: 8, celdas: [{ t: 'Añade partidas en la tabla cuando haga falta, también a mitad de curso. Código: I (ingreso) o G (gasto) + número de sección (1-4) + número de partida. Ej.: I32, G32.', cursiva: true, color: '#666' }] });
    filas.push({ n: 9, celdas: [] });
  }
  const cabT = ['Partida ingresos', 'Sección', 'Descripción', real ? 'Importe real' : 'Importe presupuestado',
                'Partida gastos', 'Sección', 'Descripción', real ? 'Importe real' : 'Importe presupuestado'];
  filas.push({ n: 10, alto: 34, celdas: cabT.map(t => ({ t: t, fondo: '#18A2B5', color: '#fff', negrita: true, ajustar: true })) });
  for (let k = 0; k < n; k++) {
    const a = P.ingresos[k], b = P.gastos[k];
    const lado2 = p => p ? [{ t: p.codigo }, { t: p.seccion }, { t: p.descripcion }, { t: euros(imp(p)), alinear: 'right' }] : [null, null, null, null];
    filas.push({ n: 11 + k, celdas: lado2(a).concat(lado2(b)) });
  }
  // La fila 7 de Cuentas es un texto largo que se desborda: se pinta en una celda que ocupa toda la fila.
  return { titulo: 'Ejercicio 26-27', columnas: 'ABCDEFGH'.split('').map((l, i) => ({ letra: l, ancho: [130, 100, 160, 96, 76, 100, 160, 96][i] })),
    fijas: 0, filasFijas: 10, filas: filas, pestañas: PESTANAS, activa: real ? 'Cuentas' : 'Presupuesto', celda: real ? 'A7' : 'D18',
    formula: real ? '=LET(sinPartida; COUNTIFS(Caja!$J$4:$J; "<>"; Caja!$E$4:$E; ""); …)' : '900',
    script: 'document.querySelectorAll("td").forEach(function (td) { if (/^[⚠✓]|^Añade/.test(td.textContent)) { td.style.overflow = "visible"; td.style.position = "relative"; td.style.zIndex = 2; } });' };
}

function vistaActividad() {
  const a = ACTIVIDAD;
  const realDe = sub => -CAJA_FILAS.filter(f => f.subpartida === sub).reduce((t, f) => t + f.cantidad, 0);
  const realP = c => { const s = CAJA_FILAS.filter(f => f.partida === c).reduce((t, f) => t + f.cantidad, 0); return c.charAt(0) === 'G' ? -s : s; };
  const presI = IMPORTES.I23, presG = IMPORTES.G23, realI = realP('I23'), realG = realP('G23');
  const R = 'right', fondoSub = CREMA;
  const filas = [
    { n: 1, alto: 26, celdas: [{ t: 'Actividad', negrita: true }, { t: a.titulo, negrita: true, grande: 17, desborda: true }] },
    { n: 2, celdas: [{ t: 'Partida de ingresos', negrita: true }, { t: 'I23' }, { t: 'Convivencia de otoño', desborda: true }] },
    { n: 3, celdas: [{ t: 'Partida de gastos', negrita: true }, { t: 'G23' }, { t: 'Convivencia de otoño', desborda: true }] },
    { n: 4, celdas: [] },
    { n: 5, celdas: ['Resumen', 'Presupuestado', 'Real', 'Diferencia'].map(t => ({ t: t, fondo: CABECERA, color: '#fff', negrita: true })) },
    { n: 6, celdas: [{ t: 'Ingresos', negrita: true }, { t: euros(presI), alinear: R }, { t: euros(realI), alinear: R }, { t: euros(realI - presI), alinear: R }] },
    { n: 7, celdas: [{ t: 'Gastos', negrita: true }, { t: euros(presG), alinear: R }, { t: euros(realG), alinear: R }, { t: euros(realG - presG), alinear: R }] },
    { n: 8, celdas: [{ t: 'Balance', negrita: true }, { t: euros(presI - presG), alinear: R, negrita: true }, { t: euros(realI - realG), alinear: R, negrita: true },
      { t: euros(realI - realG - presI + presG), alinear: R, negrita: true }] },
    { n: 9, celdas: [] },
    { n: 10, celdas: ['Subpartida', 'Descripción', 'Presupuestado', 'Real', 'Diferencia'].map(t => ({ t: t, fondo: '#18A2B5', color: '#fff', negrita: true })) }
  ];
  a.subpartidas.forEach((s, k) => filas.push({ n: 11 + k, celdas: [{ t: s.codigo, fondo: fondoSub }, { t: s.descripcion, fondo: fondoSub },
    { t: euros(s.presupuesto), alinear: R, fondo: fondoSub }, { t: euros(realDe(s.codigo)), alinear: R }, { t: euros(realDe(s.codigo) - s.presupuesto), alinear: R }] }));
  for (let k = a.subpartidas.length; k < 6; k++) filas.push({ n: 11 + k, celdas: [{ t: '', fondo: fondoSub }, { t: '', fondo: fondoSub }, { t: '', fondo: fondoSub }] });
  return { titulo: 'Ejercicio 26-27', columnas: 'ABCDE'.split('').map((l, i) => ({ letra: l, ancho: [150, 175, 112, 100, 100][i] })),
    fijas: 0, filas: filas, pestañas: PESTANAS, activa: 'Act · Convivencia de otoño', celda: 'A15', formula: '' };
}

const MENU = G.entradasDelMenu();
const menu = (resaltar, filas) => ({ titulo: 'Ejercicio 26-27', columnas: PRINCIPALES.map(c => ({ letra: G.letraCaja(c), ancho: ANCHO_HOJA[c] })),
  fijas: 2, filasFijas: 3, filas: cabeceraDeCaja(PRINCIPALES).concat(CAJA_FILAS.slice(0, filas || 6).map((f, i) => ({ n: 4 + i, celdas: PRINCIPALES.map(c => celdaDeCaja(i, c)) }))),
  menu: { entradas: MENU, resaltar: resaltar }, celda: 'A4', formula: '20260904-01' });

function hoja(op) {
  const nombre = `h${++contador}.html`;
  fs.writeFileSync(path.join(TMP, nombre), pantalla(op));
  return path.join(TMP, nombre);
}

/** La hoja con el panel lateral abierto a la derecha, como en Sheets. */
function hojaConPanel() {
  const hojaUrl = hoja(Object.assign(vistaCaja(PRINCIPALES.slice(0, 5), { indices: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] })));
  const estado = Object.assign({ libro: true, centro: 'Centro JMV de ejemplo', bdSocios: true, reparar: false,
    ultimoExtracto: '01/10/2026 – 16/10/2026 (importado el 18/10/2026)' }, json(G.resumenDelLibro(CAJA_FILAS, INICIALES, AJ)));
  const panelUrl = ventana('Panel', {}, { estadoDelPanel: estado });
  const nombre = path.join(TMP, `panel-${++contador}.html`);
  fs.writeFileSync(nombre, `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
    <body style="margin:0"><div id="todo" style="display:flex;background:#f9fbfd;width:1130px">
    <iframe src="${path.basename(hojaUrl)}" width="790" height="780" style="border:0"></iframe>
    <div style="width:340px;border-left:1px solid #c4c7c5;background:#fff">
      <div style="display:flex;justify-content:space-between;padding:14px 16px 8px;font:18px 'Google Sans',Arial,sans-serif;color:#1f1f1f">Tesorería<span>✕</span></div>
      <iframe src="${path.basename(panelUrl)}" width="340" height="730" style="border:0"></iframe>
    </div></div></body></html>`);
  return nombre;
}

// ==================================================================
// LA CONSOLA NACIONAL (recreación, con centros inventados)
// ==================================================================

const PESTANAS_CONSOLA = ['Centros', 'Informe nacional', 'Ajustes de la consola'];
const ESTADO_EJEMPLO = G.resumenDelLibro(CAJA_FILAS, INICIALES, AJ);
// Los otros centros son el de ejemplo a escala, igual que en vistaInformeNacional().
const ESCALA_CENTROS = { 'Centro de Valdemar': 0.7, 'Área de Formación': 0.3 };
const aEscala = (v, centro) => Math.round(v * ESCALA_CENTROS[centro] * 100) / 100;
const CENTROS_EJEMPLO = [
  { 'Centro': 'Centro JMV de ejemplo', 'Activo': 'Sí', 'Ejercicio': CURSO, 'Estructura': G.VERSION_ESTRUCTURA,
    'Banco': ESTADO_EJEMPLO.saldos.banco, 'Efectivo': ESTADO_EJEMPLO.saldos.efectivo, 'Pendientes': ESTADO_EJEMPLO.pendientes,
    'Por completar': ESTADO_EJEMPLO.completar, 'Sin factura': ESTADO_EJEMPLO.facturas, 'Errores': '✔' },
  { 'Centro': 'Centro de Valdemar', 'Activo': 'Sí', 'Ejercicio': CURSO, 'Estructura': G.VERSION_ESTRUCTURA,
    'Banco': aEscala(ESTADO_EJEMPLO.saldos.banco, 'Centro de Valdemar'), 'Efectivo': aEscala(ESTADO_EJEMPLO.saldos.efectivo, 'Centro de Valdemar'), 'Pendientes': 0, 'Por completar': 1, 'Sin factura': 2, 'Errores': '✔' },
  { 'Centro': 'Área de Formación', 'Activo': 'Sí', 'Ejercicio': CURSO, 'Estructura': G.VERSION_ESTRUCTURA - 1,
    'Banco': aEscala(ESTADO_EJEMPLO.saldos.banco, 'Área de Formación'), 'Efectivo': aEscala(ESTADO_EJEMPLO.saldos.efectivo, 'Área de Formación'), 'Pendientes': 0, 'Por completar': 0, 'Sin factura': 0,
    'Errores': `✖ 1: La estructura del libro es de la versión ${G.VERSION_ESTRUCTURA - 1} y el programa espera la ${G.VERSION_ESTRUCTURA}…` },
  { 'Centro': 'Centro Las Lomas', 'Activo': 'No' },
  { 'Centro': 'Centro San Marcos', 'Activo': 'No' }
];
const COLS_CONSOLA = [['Centro', 165], ['Activo', 58], ['Ejercicio', 82], ['Estructura', 78], ['Banco', 92], ['Efectivo', 82],
  ['Pendientes', 82], ['Por completar', 92], ['Sin factura', 80], ['Errores', 210]];

function vistaCentros(op) {
  const letra = c => G.letraDeColumna(G.colConsola(c));
  const cab = { n: 1, alto: 34, celdas: COLS_CONSOLA.map(c => ({ t: c[0], fondo: '#6075BB', color: '#fff', negrita: true, ajustar: true })) };
  const filas = [cab].concat(CENTROS_EJEMPLO.map((x, i) => ({ n: i + 2, celdas: COLS_CONSOLA.map(c => {
    const v = x[c[0]];
    if (v === undefined || v === '') return null;
    const celda = { t: typeof v === 'number' && ['Banco', 'Efectivo'].indexOf(c[0]) >= 0 ? euros(v) : String(v) };
    if (typeof v === 'number') celda.alinear = 'right';
    if (c[0] === 'Errores' && String(v).charAt(0) === '✖') celda.color = '#b00020';
    if (c[0] === 'Activo') celda.chip = true;
    return celda;
  }) })));
  for (let k = filas.length + 1; k <= 12; k++) filas.push({ n: k, celdas: [] });
  return Object.assign({ titulo: 'Consola nacional de Tesorería', columnas: COLS_CONSOLA.map(c => ({ letra: letra(c[0]), ancho: c[1] })),
    fijas: 1, filasFijas: 1, filas: filas, pestañas: PESTANAS_CONSOLA, activa: 'Centros', celda: 'B4', formula: 'Sí' }, op || {});
}

function vistaInformeNacional() {
  const rn = G.resumenNacional(CAJA_FILAS, PARTIDAS, INICIALES, D(25, 11, 2026, 23));
  const v1 = json(G.valoresDelInformeNacional(rn));
  const escala = (v, f) => { const r = {}; Object.keys(v).forEach(k => { r[k] = Math.round(v[k] * f * 100) / 100; }); return r; };
  const centros = [['Centro JMV de ejemplo', v1], ['Centro de Valdemar', escala(v1, ESCALA_CENTROS['Centro de Valdemar'])],
    ['Área de Formación', escala(v1, ESCALA_CENTROS['Área de Formación'])]];
  const filasInf = G.filasDelInformeNacional();
  const filas = [
    { n: 1, celdas: [{ t: `Informe nacional · Ejercicio ${CURSO} · movimientos hasta el 25/11/2026 (criterio de caja) · sin las transferencias pendientes`, negrita: true, desborda: true }] },
    { n: 2, celdas: [] },
    { n: 3, alto: 34, celdas: ['Concepto'].concat(centros.map(c => c[0]), ['Total']).map(t => ({ t: t, fondo: '#6075BB', color: '#fff', negrita: true, ajustar: true })) }
  ];
  filasInf.forEach((f, i) => {
    const celdas = [{ t: f.etiqueta, negrita: !!f.titulo }];
    let total = 0;
    centros.forEach(c => { const x = f.titulo ? '' : (c[1][f.clave] || 0); if (x !== '') total += x; celdas.push(f.titulo ? null : { t: euros(x), alinear: 'right' }); });
    celdas.push(f.titulo ? null : { t: euros(total), alinear: 'right', negrita: true });
    if (f.titulo) celdas.forEach((c, k) => { celdas[k] = Object.assign(c || { t: '' }, { fondo: '#EEF0F8' }); });
    filas.push({ n: 4 + i, celdas: celdas });
  });
  return { titulo: 'Consola nacional de Tesorería', columnas: 'ABCDE'.split('').map((l, i) => ({ letra: l, ancho: [300, 118, 118, 118, 118][i] })),
    fijas: 1, filasFijas: 3, filas: filas, pestañas: PESTANAS_CONSOLA, activa: 'Informe nacional', celda: 'A3', formula: 'Concepto' };
}

// ==================================================================
// EL INFORME EN PDF
// ==================================================================

function informe() {
  const corte = D(25, 11, 2026, 23);
  const d = G.calcularInforme(CAJA_FILAS, PARTIDAS, INICIALES, corte);
  d.actividades = [G.calcularInformeActividad(CAJA_FILAS, ACTIVIDAD, PARTIDAS, corte)];
  d.descuadres = G.descuadresDeSaldo(CAJA_FILAS, INICIALES).filter(x => x.fecha && x.fecha <= corte);
  d.tipo = 'provisional';
  d.conMovimientos = true;
  d.meta = { titulo: G.INFORMES.TIPOS.provisional, centro: 'Centro JMV de ejemplo', codigo: '', ejercicio: CURSO, corte: '25/11/2026',
    emitido: '25/11/2026 18:30', antesDelFin: false, logo: '' };
  const html = plantilla(fs.readFileSync(path.join(RAIZ, 'Informe.html'), 'utf8'), { d: d });
  const nombre = path.join(TMP, 'informe.html');
  fs.writeFileSync(nombre, html);
  return { ruta: nombre, avisos: json(G.avisosDelInforme(d)) };
}

// ==================================================================
// QUÉ SE CAPTURA
// ==================================================================

const espera = ms => new Promise(r => setTimeout(r, ms));
async function escribir(frame, sel, texto) {
  await frame.click(sel, { clickCount: 3 });
  await frame.type(sel, texto, { delay: 2 });
}
async function elegirPartida(frame, sel, texto) {
  await frame.click(sel);
  await frame.type(sel, texto, { delay: 5 });
  await espera(150);
  await frame.page().keyboard.press('Enter');
}
const archivoDePrueba = nombre => {
  const p = path.join(TMP, nombre);
  fs.writeFileSync(p, '%PDF-1.4 ejemplo');
  return p;
};

const INFORME = informe();
const ACTIVIDAD_VARS = (() => {
  const T = G.ACT.TIPOS.actividad;
  const lista = xs => xs.map(x => ({ codigo: x.codigo, texto: `${x.codigo} — ${x.descripcion}`, seccion: x.seccion }));
  const num = G.siguientePartidaLibre(PARTIDAS, T.seccionNueva);
  return { partidas: JSON.stringify({ ingresos: lista(PARTIDAS.ingresos), gastos: lista(PARTIDAS.gastos), nueva: G.ACT.NUEVA,
    nuevaIngresos: `I${T.seccionNueva}${num}`, nuevaGastos: `G${T.seccionNueva}${num}` }),
    tipo: 'actividad', ejemplo: T.ejemplo, textoSubpartidas: T.textoSubpartidas };
})();

/*
 * Cada captura: archivo (dentro de docs/assets/img), la página que se abre,
 * los pasos que se dan en ella y qué se recorta:
 *   'modal'           el diálogo entero con su marco
 *   '#pantalla'       la recreación de la hoja entera
 *   [selectores]      la unión de esos elementos (dentro de la ventana si la hay)
 * margen: px alrededor del recorte.
 */
const CAPTURAS = [
  // --- Primeros pasos ---
  { archivo: 'primeros-pasos/01.png', url: () => hoja(Object.assign(vistaCaja(PRINCIPALES, { indices: [0, 1, 2, 3, 4, 5, 6, 7, 8] }), {
      script: "llamada(1, '#menuTesoreria', 100, -2); llamada(2, '#c_E1', 10, 18); llamada(3, '#c_C3', 160, 5); llamada(4, '#c_F9', 25, 20); llamada(5, '.pestanas .p:last-child', 60, 2);" })),
    recorte: ['#pantalla'] },
  { archivo: 'primeros-pasos/02.png', url: () => hoja(Object.assign(menu(null, 20))), recorte: ['.arriba', '.menu'], margen: 10 },
  { archivo: 'primeros-pasos/04.png', url: hojaConPanel, recorte: ['#todo'], principal: true },
  { archivo: 'primeros-pasos/03.png', url: () => hoja(vistaCaja(['ID Transacción', 'Fecha', 'Cantidad', 'Saldo', 'Factura', 'Método de pago',
      'Cuenta de abono', 'Titular', 'Fecha de pago'], { celda: 'P16', formula: 'Pendiente' })), recorte: ['#pantalla'] },

  // --- Importar el extracto ---
  { archivo: 'importar-extracto/01.png', url: () => hoja(menu('Importar extracto bancario…')), recorte: ['.arriba', '.menu .op.res'], margen: 6 },
  { archivo: 'importar-extracto/02.png',
    url: () => ventana('Subir', { modo: 'extracto', ayuda: 'Sube el Excel de movimientos tal cual lo descargas del banco. Se puede importar un extracto '
      + 'que se solape con otro ya importado: lo repetido no se vuelve a meter.', acepta: '.xls,.xlsx,.csv', contexto: '{}' }, {},
      { titulo: 'Importar extracto bancario', ancho: 520, alto: 500 }),
    pasos: async f => { const i = await f.$('#archivo'); await i.uploadFile(archivoDePrueba('Movimientos_cuenta.xls')); },
    recorte: 'modal' },
  { archivo: 'importar-extracto/03.png',
    url: () => ventana('Subir', { modo: 'extracto', ayuda: 'Sube el Excel de movimientos tal cual lo descargas del banco. Se puede importar un extracto '
      + 'que se solape con otro ya importado: lo repetido no se vuelve a meter.', acepta: '.xls,.xlsx,.csv', contexto: '{}' }, {
      recibirArchivo: { titulo: 'Extracto importado', lineas: [
        'Extracto de la cuenta …0123 del 01/10/2026 al 16/10/2026: 7 movimientos.',
        'Nuevos en Caja: 7 del banco.',
        'Cuotas identificadas: 1 (0 por número de socio, 1 por nombre, 0 por el nombre del tutor/a).',
        'Ingresos sin socio identificado: 1; 1 llevan una nota en «ID socio» con quién podría ser.',
        'BD Socios: 0 pagos nuevos, 0 pagos de Tally conciliados, 0 actualizados, 0 deshechos. 0 inscripciones recalculadas.',
        '⚠ 1 asientos con ID de socio tienen algo que resolver: está en naranja en la columna «BD Socios» de Caja.',
        '✓ El saldo calculado coincide con el del banco en todas las filas importadas.'] } },
      { titulo: 'Importar extracto bancario', ancho: 520, alto: 500 }),
    pasos: async f => { const i = await f.$('#archivo'); await i.uploadFile(archivoDePrueba('Movimientos_cuenta.xls')); await f.click('#subir'); },
    recorte: 'modal' },
  { archivo: 'importar-extracto/04.png', url: () => hoja(Object.assign(vistaCaja(PRINCIPALES.concat(['ID socio']),
      { indices: [5, 6, 7, 8, 9, 10], vacias: 3, celda: `G${nCaja('20261014-01')}`, formula: '' }), {
      capas: `<div class="nota" id="nota">${esc(NOTA_SIN_IDENTIFICAR)}</div>`,
      script: `colocar('nota', '#c_G${nCaja('20261014-01')}', -250, 4); recuadro('#c_G${nCaja('20261014-01')}');` })),
    recorte: ['#pantalla'] },

  // --- Pagar por transferencia ---
  { archivo: 'pagar-transferencia/01.png', url: () => hoja(menu('Nuevo gasto por transferencia…')), recorte: ['.arriba', '.menu .op.res'], margen: 6 },
  { archivo: 'pagar-transferencia/02.png', url: () => asientos('transferencia'),
    pasos: async f => {
      await escribir(f, '#f_importe', NUEVA_TRANSFERENCIA.importe);
      await escribir(f, '#f_proveedor', NUEVA_TRANSFERENCIA.proveedor);
      await escribir(f, '#f_cif', NUEVA_TRANSFERENCIA.cif);
      await escribir(f, '#f_iban', NUEVA_TRANSFERENCIA.cuentaAbono);
    }, recorte: 'modal' },
  { archivo: 'pagar-transferencia/03.png', url: () => asientos('transferencia'),
    pasos: async f => {
      await f.evaluate(() => document.getElementById('f_partida').scrollIntoView({ block: 'start' }));
      await f.click('#f_partida'); await f.type('#f_partida', 'conviv', { delay: 5 });
    }, recorte: ['fieldset:has(#f_partida)', '#f_partida_sug'], margen: 8 },
  { archivo: 'pagar-transferencia/04.png', url: () => asientos('transferencia'),
    pasos: async f => {
      await elegirPartida(f, '#f_partida', 'conviv');
      await f.select('#f_subpartida', 'G23T');
      await escribir(f, '#f_descripcion', NUEVA_TRANSFERENCIA.descripcion);
      await escribir(f, '#f_asunto', NUEVA_TRANSFERENCIA.asunto);
      const i = await f.$('#ficheroFactura'); await i.uploadFile(archivoDePrueba('Presupuesto autocares.pdf'));
      await f.evaluate(() => document.getElementById('f_descripcion').scrollIntoView({ block: 'start' }));
    }, recorte: ['fieldset:has(#f_partida)', 'fieldset:has(#f_asunto)', 'fieldset:has(#zona)'], margen: 8 },
  { archivo: 'pagar-transferencia/05.png', url: () => asientos('transferencia'),
    pasos: async f => {
      await escribir(f, '#f_importe', NUEVA_TRANSFERENCIA.importe);
      await escribir(f, '#f_proveedor', NUEVA_TRANSFERENCIA.proveedor);
      await escribir(f, '#f_cif', NUEVA_TRANSFERENCIA.cif);
      await escribir(f, '#f_iban', NUEVA_TRANSFERENCIA.cuentaAbono);
      await elegirPartida(f, '#f_partida', 'conviv');
      await f.select('#f_subpartida', 'G23T');
      await escribir(f, '#f_descripcion', NUEVA_TRANSFERENCIA.descripcion);
      await escribir(f, '#f_asunto', NUEVA_TRANSFERENCIA.asunto);
      await f.click('#guardar');
    }, recorte: 'modal' },
  { archivo: 'pagar-transferencia/06.png', url: () => hoja(vistaCaja(['ID Transacción', 'Fecha', 'Cantidad', 'Saldo', 'Factura', 'Método de pago',
      'Cuenta de abono', 'Titular', 'Fecha de pago'], { indices: [7, 8, 9, 10, 11, 12], vacias: 2, celda: `P${nCaja('20261118-01')}`, formula: 'Pendiente',
      script: `recuadro('#c_A${nCaja('20261118-01')}', '#c_P${nCaja('20261118-01')}');` })), recorte: ['#pantalla'] },
  { archivo: 'pagar-transferencia/07.png', url: () => asientos('pendientes'), recorte: 'modal' },

  // --- Completar movimientos con tarjeta ---
  { archivo: 'completar-movimientos/01.png', url: () => hoja(menu('Completar movimientos del banco (tarjeta…)…')), recorte: ['.arriba', '.menu .op.res'], margen: 6 },
  { archivo: 'completar-movimientos/02.png', url: () => asientos('completar'), recorte: 'modal' },
  { archivo: 'completar-movimientos/03.png', url: () => asientos('completar'),
    pasos: async f => {
      await elegirPartida(f, '#f_partida', 'conviv');
      await f.select('#f_subpartida', COMPLETAR.subpartida);
      await escribir(f, '#f_descripcion', COMPLETAR.descripcion);
      await escribir(f, '#f_proveedor', COMPLETAR.proveedor);
      const i = await f.$('#ficheroFactura'); await i.uploadFile(archivoDePrueba('ticket supermercado.jpg'));
      await f.evaluate(() => document.getElementById('f_partida').scrollIntoView({ block: 'start' }));
    }, recorte: ['fieldset:has(#f_partida)', 'fieldset:has(#f_proveedor)', 'fieldset:has(#zona)'], margen: 8 },
  { archivo: 'completar-movimientos/04.png', url: () => asientos('completar'),
    pasos: async f => {
      await elegirPartida(f, '#f_partida', 'conviv');
      await f.select('#f_subpartida', COMPLETAR.subpartida);
      await escribir(f, '#f_descripcion', COMPLETAR.descripcion);
      await escribir(f, '#f_proveedor', COMPLETAR.proveedor);
      await f.click('#guardar');
    }, recorte: 'modal' },

  // --- Facturas ---
  { archivo: 'facturas/01.png', url: () => hoja(menu('Facturas que faltan…')), recorte: ['.arriba', '.menu .op.res'], margen: 6 },
  { archivo: 'facturas/02.png', url: () => asientos('facturas', '20261012-01'), recorte: 'modal' },
  { archivo: 'facturas/03.png', url: () => asientos('facturas', '20261012-01'),
    pasos: async f => { const i = await f.$('#ficheroFactura'); await i.uploadFile(archivoDePrueba('Factura autocares octubre.pdf')); },
    recorte: ['fieldset:has(#zona)'], margen: 8 },
  { archivo: 'facturas/04.png', url: () => asientos('transferencia'),
    pasos: async f => {
      const opciones = await f.$$('#tiposFactura label');
      await opciones[2].click();
      await f.evaluate(() => document.getElementById('tiposFactura').scrollIntoView({ block: 'center' }));
    }, recorte: ['fieldset:has(#tiposFactura)'], margen: 8 },

  // --- Efectivo y traspasos ---
  { archivo: 'efectivo/01.png', url: () => hoja(menu('⇄ Traspaso entre banco y efectivo…')), recorte: ['.arriba', '.menu .op.res'], margen: 6 },
  { archivo: 'efectivo/02.png', url: () => asientos('traspaso'),
    pasos: async f => { await escribir(f, '#t_importe', '90,00'); await escribir(f, '#t_descripcion', 'Cuotas cobradas en la reunión de padres'); },
    recorte: 'modal' },
  { archivo: 'efectivo/03.png', url: () => hoja(menu('Ingreso o gasto en efectivo…')), recorte: ['.arriba', '.menu .op.res'], margen: 6 },
  { archivo: 'efectivo/04.png', url: () => asientos('efectivo'),
    pasos: async f => {
      for (const q of ['ortega', 'herrera']) {
        await f.click('#buscarSocio'); await espera(200);
        await f.type('#buscarSocio', q, { delay: 5 }); await espera(150);
        await f.click('.socio[data-i="0"]'); await espera(100);
      }
      await f.type('#buscarSocio', 'herrera', { delay: 5 });
    }, recorte: 'modal' },
  { archivo: 'efectivo/05.png', url: () => asientos('efectivo'),
    pasos: async f => {
      await f.click('input[name=te][value=gasto]'); await espera(150);
      await escribir(f, '#e_importe', '8,40');
      await elegirPartida(f, '#f_partida', 'material');
      await escribir(f, '#f_descripcion', 'Pilas para el equipo de música');
      await escribir(f, '#f_proveedor', 'Ferretería La Esquina');
    }, recorte: ['#tiposEfectivo', 'fieldset:has(#e_fecha)', 'fieldset:has(#e_importe)', 'fieldset:has(#f_proveedor)'], margen: 8 },

  // --- Cuotas de socio ---
  { archivo: 'cuotas/01.png', url: () => hoja(vistaCaja(['ID Transacción', 'Fecha', 'Cantidad', 'Saldo', 'Factura', 'Método de pago'].slice(0, 2)
      .concat(['Fecha de pago', 'Saldo extracto', 'BD Socios']), { indices: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], celda: `R${nCaja('20261016-01')}`,
      formula: CAJA_FILAS[fila('20261016-01')].bdSocios })), recorte: ['#pantalla'] },

  // --- Escribir en la hoja ---
  { archivo: 'escribir-en-la-hoja/01.png', url: () => {
      const n = nCaja('20261003-01');
      const op = vistaCaja(PRINCIPALES, { indices: [0, 1, 2, 3, 4, 5, 6, 7, 8], vacias: 3, celda: `E${n}`, formula: 'activ' });
      op.filas.find(x => x.n === n).celdas[4] = { t: 'activ', activa: true };
      const opciones = PARTIDAS.ingresos.concat(PARTIDAS.gastos).filter(p => /activ/i.test(p.descripcion));
      op.capas = '<div class="desplegable" id="desp">' + opciones.map((p, i) =>
        `<div${i === 0 ? ' class="res"' : ''}><span class="chip">${esc(p.codigo + G.CAJA.SEPARADOR_OPCION + p.descripcion)}</span></div>`).join('') + '</div>';
      op.script = `colocar('desp', '#c_E${n}', -200, 2);`;
      return hoja(op);
    }, recorte: ['#pantalla'] },

  // --- Actividades y presupuesto ---
  { archivo: 'actividades/01.png', url: () => ventana('Actividad', ACTIVIDAD_VARS, {}, { titulo: 'Nueva hoja de actividad', ancho: 480, alto: 470 }),
    pasos: async f => { await escribir(f, '#titulo', 'Campamento de verano'); }, recorte: 'modal' },
  { archivo: 'actividades/02.png', url: () => hoja(vistaActividad()), recorte: ['#pantalla'] },
  { archivo: 'actividades/03.png', url: () => hoja(vistaPresupuesto(false)), recorte: ['#pantalla'] },
  { archivo: 'actividades/04.png', url: () => hoja(vistaPresupuesto(true)), recorte: ['#pantalla'] },

  // --- Consola nacional ---
  { archivo: 'consola-nacional/01.png', url: () => hoja(vistaCentros()), recorte: ['#pantalla'] },
  { archivo: 'consola-nacional/02.png', alto: 1150, url: () => {
      const entradas = G.entradasDelMenu(true);
      const sub = entradas[entradas.length - 1];
      return hoja(vistaCentros({ menu: { entradas: entradas, resaltar: 'Consola nacional',
        sub: { titulo: 'Consola nacional', entradas: sub.entradas, resaltar: 'Crear los libros que falten del ejercicio…' } } }));
    }, recorte: ['.arriba', '#menuTes', '#menuSub'], margen: 8 },
  { archivo: 'consola-nacional/03.png', alto: 1300, url: () => hoja(vistaInformeNacional()), recorte: ['#pantalla'] },

  // --- Informes ---
  { archivo: 'informes/01.png', url: () => ventana('Informes', { datos: JSON.stringify({ ejercicio: CURSO, fin: '2027-08-31', hoy: '2026-11-25',
      actividades: [{ nombre: ACTIVIDAD.nombre, titulo: ACTIVIDAD.titulo }] }) }, {
      generarInforme: { url: '#', nombre: 'Informe provisional — Ejercicio 2026-2027 — a 20261125.pdf', avisos: INFORME.avisos } },
      { titulo: 'Informe contable', ancho: 480, alto: 440 }),
    pasos: async f => { await f.click('#movimientos'); await f.click('#generar'); }, recorte: 'modal' },
  { archivo: 'informes/02.png', url: () => INFORME.ruta, ancho: 820, alto: 1160, recorte: ['body'], alto_max: 1123 }
];

// ==================================================================
// A CAPTURAR
// ==================================================================

async function recortar(page, frame, c) {
  if (c.recorte === 'modal') {
    const b = await (await page.$('#modal')).boundingBox();
    const m = 12;
    return { x: b.x - m, y: b.y - m, width: b.width + 2 * m, height: b.height + 2 * m };
  }
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const sel of c.recorte) {
    for (const e of await frame.$$(sel)) {
      const b = await e.boundingBox();
      if (!b) continue;
      x1 = Math.min(x1, b.x); y1 = Math.min(y1, b.y); x2 = Math.max(x2, b.x + b.width); y2 = Math.max(y2, b.y + b.height);
    }
  }
  if (x1 === Infinity) throw new Error(`${c.archivo}: no encuentro ${c.recorte.join(', ')}`);
  const m = c.margen || 0;
  const r = { x: Math.max(0, x1 - m), y: Math.max(0, y1 - m), width: x2 - x1 + 2 * m, height: y2 - y1 + 2 * m };
  if (c.alto_max) r.height = Math.min(r.height, c.alto_max);
  return r;
}

(async () => {
  const navegador = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--allow-file-access-from-files', '--lang=es-ES', '-AppleLanguages', '(es)'], env: Object.assign({}, process.env, { LANG: 'es_ES.UTF-8' }) });
  let hechas = 0;
  for (const c of CAPTURAS.filter(x => x.archivo.indexOf(FILTRO) >= 0)) {
    const page = await navegador.newPage();
    const errores = [];
    page.on('pageerror', e => errores.push(e.message));
    const modal = /marco-/.test(c.url.toString()) || c.recorte === 'modal';
    await page.setViewport({ width: c.ancho || 1250, height: c.alto || (modal ? 900 : 1000), deviceScaleFactor: 2 });
    await page.goto('file://' + c.url(), { waitUntil: 'load' });
    await espera(500);
    const frame = c.principal ? page.mainFrame() : c.recorte === 'modal' || (page.frames().length > 1)
      ? page.frames().find(f => f !== page.mainFrame()) || page.mainFrame() : page.mainFrame();
    if (c.pasos) await c.pasos(frame, page);
    await espera(700);
    const destino = path.join(IMG, c.archivo);
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    await page.screenshot({ path: destino, clip: await recortar(page, frame, c) });
    const dentro = await frame.evaluate(() => Array.from(document.querySelectorAll('.error')).map(e => e.textContent));
    if (errores.length || dentro.length) console.log(`⚠ ${c.archivo}: ${errores.concat(dentro).join(' | ')}`);
    await page.close();
    hechas++;
    console.log('✓ ' + c.archivo);
  }
  await navegador.close();
  console.log(`${hechas} capturas en ${path.relative(RAIZ, IMG)}`);
})().catch(e => { console.error(e); process.exit(1); });
