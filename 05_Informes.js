/*******************************************************************
 * JMV — TESORERÍA · Informes contables
 *
 * Tesorería → Generar informe contable… Tres tipos, en PDF, en
 * CARPETA_INFORMES/<ejercicio>/:
 *
 *   - Cierre del ejercicio: todo, hasta la fecha de fin del ejercicio.
 *   - Provisional: lo mismo, hasta la fecha que se elija.
 *   - Actividad: una hoja de actividad, hasta la fecha que se elija.
 *
 * Criterio de caja: un asiento entra si su Fecha de pago (o su Fecha,
 * si no la tiene) es como muy tarde la de corte. Es el mismo criterio
 * del saldo, así que saldo inicial + ingresos − gastos (+ lo que no
 * tenga partida) = saldo final, y el informe lo comprueba.
 *
 * Privacidad: el informe se enseña en la asamblea. Nunca lleva el
 * «Concepto Banco» (trae nombres de familias y de menores): una cuota
 * sale como «Cuota de socio», y el resto con su Descripción, su
 * Proveedor o el nombre de la partida.
 *
 * calcularInforme() y calcularInformeActividad() son puras.
 *******************************************************************/

const INFORMES = {
  // Los márgenes del PDF están en Informe.html (div.margen): el
  // conversor no respeta @page.
  TIPOS: { cierre: 'Informe de cierre', provisional: 'Informe provisional', actividad: 'Informe de actividad' }
};


// ==================================================================
// DIÁLOGO
// ==================================================================

function abrirInformes() {
  const aj = leerAjustes();
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const hoy = new Date();
  const t = HtmlService.createTemplateFromFile('Informes');
  t.datos = JSON.stringify({
    ejercicio: aj.ejercicio, fin: iso(aj.fin), hoy: iso(hoy > aj.fin ? aj.fin : hoy),
    actividades: hojasDeActividad().map(a => ({ nombre: a.nombre, titulo: a.titulo }))
  });
  SpreadsheetApp.getUi().showModalDialog(t.evaluate().setWidth(480).setHeight(440), 'Informe contable');
}

/**
 * Lo llama Informes.html. op: { tipo, fecha: 'aaaa-mm-dd', actividad, movimientos }.
 * Devuelve { url, nombre, avisos }.
 */
function generarInforme(op) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const aj = leerAjustes(ss);
  let corte = op.tipo === 'cierre' ? aj.fin : fechaDeTexto(op.fecha);
  if (!corte) throw new Error('Falta la fecha de corte.');
  corte = new Date(corte.getFullYear(), corte.getMonth(), corte.getDate(), 23, 59, 59);
  if (corte < aj.inicio) throw new Error(`La fecha es anterior al inicio del ejercicio (${fechaCorta(aj.inicio)}).`);
  if (corte > aj.fin) corte = aj.fin;

  const filas = leerCaja(ss);
  const partidas = leerPartidas(ss);
  const iniciales = saldosIniciales(ss);
  let d, nombre;
  if (op.tipo === 'actividad') {
    const act = hojasDeActividad(ss).find(a => a.nombre === op.actividad);
    if (!act) throw new Error('No encuentro esa hoja de actividad.');
    d = calcularInformeActividad(filas, act, partidas, corte);
    nombre = `Informe de actividad — ${act.titulo} — a ${fechaCompacta(corte)}.pdf`;
  } else {
    d = calcularInforme(filas, partidas, iniciales, corte);
    d.actividades = hojasDeActividad(ss).map(a => calcularInformeActividad(filas, a, partidas, corte));
    d.descuadres = descuadresDeSaldo(filas, iniciales).filter(x => x.fecha && x.fecha <= corte);
    nombre = op.tipo === 'cierre'
      ? `Informe de cierre — Ejercicio ${aj.ejercicio}.pdf`
      : `Informe provisional — Ejercicio ${aj.ejercicio} — a ${fechaCompacta(corte)}.pdf`;
  }
  d.tipo = op.tipo;
  d.conMovimientos = op.tipo === 'actividad' || !!op.movimientos;
  d.meta = {
    titulo: INFORMES.TIPOS[op.tipo], centro: config('NOMBRE_CENTRO'), codigo: config('CODIGO_CENTRO'),
    ejercicio: aj.ejercicio, corte: fechaCorta(corte),
    emitido: Utilities.formatDate(new Date(), 'Europe/Madrid', 'dd/MM/yyyy HH:mm'),
    antesDelFin: op.tipo === 'cierre' && new Date() < aj.fin,
    logo: logoEnDataUri()
  };

  const t = HtmlService.createTemplateFromFile('Informe');
  t.d = d;
  const pdf = Utilities.newBlob(t.evaluate().getContent(), 'text/html', 'informe.html')
    .getAs('application/pdf').setName(nombre);
  const carpeta = carpetaDelEjercicio('CARPETA_INFORMES', ss);
  const viejos = carpeta.getFilesByName(nombre);
  while (viejos.hasNext()) viejos.next().setTrashed(true);
  const archivo = carpeta.createFile(pdf);
  registrar('INFO', `Informe generado: ${nombre}`, archivo.getUrl());
  return { url: archivo.getUrl(), nombre: nombre, avisos: avisosDelInforme(d) };
}

function logoEnDataUri() {
  const id = config('LOGO_INFORME');
  if (!id) return '';
  try {
    const b = DriveApp.getFileById(id).getBlob();
    return `data:${b.getContentType()};base64,${Utilities.base64Encode(b.getBytes())}`;
  } catch (e) { return ''; }
}

/** Lo que conviene saber antes de dar el informe por bueno. */
function avisosDelInforme(d) {
  const a = [];
  if (d.meta && d.meta.antesDelFin) a.push('El ejercicio todavía no ha terminado: este cierre puede cambiar.');
  if (d.sinPartida && d.sinPartida.n) a.push(`Asientos sin partida: ${d.sinPartida.n} (${euros(d.sinPartida.importe)}).`);
  if (d.desconocidas && d.desconocidas.length) a.push('Partidas que no están en el Presupuesto: '
    + d.desconocidas.map(x => x.codigo).join(', ') + '.');
  if (d.traspasos && redondear(d.traspasos) !== 0) a.push(`Los traspasos entre banco y efectivo no suman cero (${euros(d.traspasos)}).`);
  if (d.gastosSinFactura && d.gastosSinFactura.length) a.push(`Pagos sin factura: ${d.gastosSinFactura.length}.`);
  if (d.descuadres && d.descuadres.length) a.push(`Filas de Caja donde el saldo no coincide con el del banco: ${d.descuadres.length}.`);
  if (d.cuadre && redondear(d.cuadre.diferencia) !== 0) a.push(`No cuadra: saldo inicial + ingresos − gastos no da el saldo final (diferencia ${euros(d.cuadre.diferencia)}).`);
  return a;
}


// ==================================================================
// CÁLCULO (puro)
// ==================================================================

/** Texto de un asiento en un informe: nunca el Concepto Banco. */
function conceptoParaInforme(f, descripciones) {
  if (f.idSocio) return 'Cuota de socio';
  if (f.partida === CAJA.TRASPASO) return f.descripcion || 'Traspaso entre banco y efectivo';
  return f.descripcion || f.proveedor || descripciones[f.partida] || '—';
}

function movimientoParaInforme(f, descripciones) {
  return { id: f.id, fecha: fechaCorta(f.fechaEfectiva), concepto: conceptoParaInforme(f, descripciones),
    partida: f.partida || '—', subpartida: f.subpartida, cantidad: f.cantidad,
    cuenta: f.esEfectivo ? 'Efectivo' : 'Banco', factura: !!f.factura };
}

function esGastoQuePideFactura(f) {
  return f.cantidad < 0 && !f.factura && f.partida !== CAJA.TRASPASO && f.metodo !== 'Cargo bancario';
}

/**
 * filas: leerCaja(). partidas: leerPartidas(). iniciales: { banco, efectivo }.
 * corte: Date. Devuelve todo lo que pinta Informe.html.
 */
function calcularInforme(filas, partidas, iniciales, corte) {
  // «Ejercicio anterior» ya está en el saldo inicial: no existe para este informe.
  const dentro = filas.filter(f => f.cantidad !== null && f.fechaEfectiva && f.fechaEfectiva <= corte
    && f.partida !== CAJA.EJERCICIO_ANTERIOR);
  const descripciones = {};
  partidas.ingresos.concat(partidas.gastos).forEach(p => { descripciones[p.codigo] = p.descripcion; });

  let banco = iniciales.banco, efectivo = iniciales.efectivo;
  const real = {};
  dentro.forEach(f => {
    if (f.esEfectivo) efectivo += f.cantidad; else banco += f.cantidad;
    real[f.partida] = (real[f.partida] || 0) + f.cantidad;
  });

  const conPct = (p, r) => Object.assign({}, p, { real: redondear(r),
    desviacion: redondear(r - p.importe), pct: p.importe ? Math.round(100 * r / p.importe) : null });
  const ingresos = partidas.ingresos.map(p => conPct(p, real[p.codigo] || 0));
  const gastos = partidas.gastos.map(p => conPct(p, -(real[p.codigo] || 0)));

  const conocidas = {};
  partidas.ingresos.concat(partidas.gastos).forEach(p => { conocidas[p.codigo] = true; });
  conocidas[CAJA.TRASPASO] = true;
  const desconocidas = Object.keys(real).filter(c => c && !conocidas[c])
    .map(c => ({ codigo: c, importe: redondear(real[c]) }));
  const sinPartida = dentro.filter(f => !f.partida);

  const secciones = SECCIONES.map(s => {
    const suma = (lista, campo) => redondear(lista.filter(p => p.seccion === s).reduce((t, p) => t + p[campo], 0));
    return { seccion: s, presI: suma(ingresos, 'importe'), realI: suma(ingresos, 'real'),
             presG: suma(gastos, 'importe'), realG: suma(gastos, 'real') };
  });
  const total = campo => redondear(secciones.reduce((t, s) => t + s[campo], 0));
  const totales = { presI: total('presI'), realI: total('realI'), presG: total('presG'), realG: total('realG') };

  const inicial = redondear(iniciales.banco + iniciales.efectivo);
  const final = redondear(banco + efectivo);
  const otros = redondear(sinPartida.reduce((t, f) => t + f.cantidad, 0) + desconocidas.reduce((t, x) => t + x.importe, 0));
  const traspasos = redondear(real[CAJA.TRASPASO] || 0);

  return {
    saldos: {
      inicial: { banco: redondear(iniciales.banco), efectivo: redondear(iniciales.efectivo), total: inicial },
      final: { banco: redondear(banco), efectivo: redondear(efectivo), total: final }
    },
    secciones: secciones, totales: totales, ingresos: ingresos, gastos: gastos,
    sinPartida: { n: sinPartida.length, importe: redondear(sinPartida.reduce((t, f) => t + f.cantidad, 0)) },
    desconocidas: desconocidas, traspasos: traspasos,
    cuadre: { inicial: inicial, ingresos: totales.realI, gastos: totales.realG, otros: otros, traspasos: traspasos,
      final: final, diferencia: redondear(inicial + totales.realI - totales.realG + otros + traspasos - final) },
    gastosSinFactura: dentro.filter(esGastoQuePideFactura).map(f => movimientoParaInforme(f, descripciones)),
    movimientos: dentro.map(f => movimientoParaInforme(f, descripciones)),
    numAsientos: dentro.length
  };
}

/** Lo mismo para una actividad (act: de hojasDeActividad()). */
function calcularInformeActividad(filas, act, partidas, corte) {
  const descripciones = {};
  partidas.ingresos.concat(partidas.gastos).forEach(p => { descripciones[p.codigo] = p.descripcion; });
  const dentro = filas.filter(f => f.cantidad !== null && f.fechaEfectiva && f.fechaEfectiva <= corte && f.partida
    && (f.partida === act.ingresos || f.partida === act.gastos));
  const ing = dentro.filter(f => f.partida === act.ingresos);
  const gas = dentro.filter(f => f.partida === act.gastos);
  const suma = lista => redondear(lista.reduce((t, f) => t + f.cantidad, 0));
  const pres = (lista, codigo) => { const p = lista.find(x => x.codigo === codigo); return p ? p.importe : 0; };

  const presI = pres(partidas.ingresos, act.ingresos), presG = pres(partidas.gastos, act.gastos);
  const realI = suma(ing), realG = -suma(gas);
  const codigos = act.subpartidas.map(s => s.codigo);
  const subpartidas = act.subpartidas.map(s => {
    const signo = s.codigo.charAt(0) === 'G' ? -1 : 1;
    const r = redondear(signo * suma(dentro.filter(f => f.subpartida === s.codigo)));
    return Object.assign({}, s, { real: r, diferencia: redondear(r - s.presupuesto) });
  });
  return {
    titulo: act.titulo, nombre: act.nombre,
    partidaIngresos: act.ingresos ? `${act.ingresos} — ${descripciones[act.ingresos] || '¿?'}` : '—',
    partidaGastos: act.gastos ? `${act.gastos} — ${descripciones[act.gastos] || '¿?'}` : '—',
    resumen: { presI: presI, realI: realI, presG: presG, realG: realG,
               presB: redondear(presI - presG), realB: redondear(realI - realG) },
    subpartidas: subpartidas,
    sinSubpartida: {
      ingresos: redondear(suma(ing.filter(f => codigos.indexOf(f.subpartida) < 0))),
      gastos: redondear(-suma(gas.filter(f => codigos.indexOf(f.subpartida) < 0)))
    },
    movIngresos: ing.map(f => movimientoParaInforme(f, descripciones)),
    movGastos: gas.map(f => movimientoParaInforme(f, descripciones)),
    gastosSinFactura: gas.filter(esGastoQuePideFactura).map(f => movimientoParaInforme(f, descripciones))
  };
}
