/*******************************************************************
 * JMV — TESORERÍA · Plan de partidas común e informe nacional
 *
 * Todos los centros comparten unas partidas, con el mismo código y
 * nombre: las de PRESUPUESTO.INGRESOS y PRESUPUESTO.GASTOS
 * (00_Estructura.js). Cada centro añade las suyas encima (una actividad,
 * una campaña) con códigos libres de la misma sección.
 *
 * Para sumar los centros, cada partida se lleva a una común
 * (partidaNacional()): la común es ella misma; una del centro cuenta en
 * la común por defecto de su lado y su sección (NACIONAL.POR_DEFECTO): una
 * convivencia (G23) en «G21 Actividades de centro», una lotería (I32) en
 * «I31 Campañas de financiación».
 *
 * Reparar un libro añade las comunes que le falten (asegurarPartidasComunes())
 * y las marca en negrita en el Presupuesto. La consola (10_Consola.js) suma
 * los centros con resumenNacional().
 *******************************************************************/

const NACIONAL = {
  // Común en la que cuenta una partida del centro, por lado y sección.
  POR_DEFECTO: { I1: 'I14', I2: 'I21', I3: 'I31', I4: 'I41', G1: 'G13', G2: 'G21', G3: 'G31', G4: 'G41' }
};

/** [{ codigo, descripcion, seccion, lado }] de las partidas comunes. */
function partidasComunes() {
  const lado = (xs, l) => xs.map(x => ({ codigo: x[0], descripcion: x[1], lado: l,
    seccion: SECCIONES[parseInt(x[0].charAt(1), 10) - 1] }));
  return lado(PRESUPUESTO.INGRESOS, 'I').concat(lado(PRESUPUESTO.GASTOS, 'G'));
}

function esPartidaComun(codigo) { return PRESUPUESTO.INGRESOS.concat(PRESUPUESTO.GASTOS).some(x => x[0] === codigo); }

/** La partida común en la que cuenta `codigo`, o '' (traspasos, códigos no válidos). Pura. */
function partidaNacional(codigo) {
  const c = String(codigo || '').toUpperCase();
  if (esPartidaComun(c)) return c;
  if (!PATRON_PARTIDA.test(c)) return '';
  return NACIONAL.POR_DEFECTO[c.charAt(0) + c.charAt(1)] || '';
}

/**
 * Las cuentas de un centro por partida común, a una fecha (criterio de
 * caja, como calcularInforme()). Pura.
 * { saldos: { banco, efectivo, total }, ingresos: { I11: { presupuesto, real } }, gastos: {…},
 *   sinPartida, totales: { presI, realI, presG, realG } }
 */
function resumenNacional(filas, partidas, iniciales, corte) {
  const d = calcularInforme(filas, partidas, iniciales, corte);
  const r = { saldos: d.saldos.final, ingresos: {}, gastos: {}, sinPartida: d.sinPartida.importe,
    totales: { presI: d.totales.presI, realI: d.totales.realI, presG: d.totales.presG, realG: d.totales.realG } };
  const sumar = (lado, p) => {
    const n = partidaNacional(p.codigo);
    if (!n) return;
    const x = lado[n] || (lado[n] = { presupuesto: 0, real: 0 });
    x.presupuesto = redondear(x.presupuesto + (p.importe || 0));
    x.real = redondear(x.real + (p.real || 0));
  };
  d.ingresos.forEach(p => sumar(r.ingresos, p));
  d.gastos.forEach(p => sumar(r.gastos, p));
  // Partidas usadas en Caja que no están en el Presupuesto: cuentan igual.
  d.desconocidas.forEach(x => {
    if (x.codigo === CAJA.TRASPASO) return;
    const gasto = x.codigo.charAt(0) === 'G';
    sumar(gasto ? r.gastos : r.ingresos, { codigo: x.codigo, importe: 0, real: gasto ? -x.importe : x.importe });
  });
  // Los totales reales, de las filas: así incluyen también esas partidas.
  const suma = lado => redondear(Object.keys(lado).reduce((t, k) => t + lado[k].real, 0));
  r.totales.realI = suma(r.ingresos);
  r.totales.realG = suma(r.gastos);
  return r;
}

/**
 * Añade al Presupuesto las partidas comunes que le falten (al final de su
 * lado, sin importe). No toca las que ya están. Devuelve las añadidas.
 */
function asegurarPartidasComunes(ss) {
  const hay = {};
  const p = leerPartidas(ss);
  p.ingresos.concat(p.gastos).forEach(x => { hay[x.codigo] = true; });
  const faltan = partidasComunes().filter(x => !hay[x.codigo]);
  faltan.forEach(x => añadirPartida(ss, x.codigo, x.descripcion));
  return faltan.map(x => x.codigo);
}
