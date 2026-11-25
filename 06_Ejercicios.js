/*******************************************************************
 * JMV — TESORERÍA · Paso de un ejercicio al siguiente
 *
 * Crear el ejercicio siguiente COPIA este libro y lo vacía: Caja sin
 * asientos, Presupuesto con las mismas partidas y sin importes, sin hojas
 * de actividad, Log vacío y Ajustes del año nuevo (con la misma
 * configuración del centro). Los saldos iniciales son los finales de este.
 *
 * Drive copia con el libro su script: el nuevo trae el programa (con un ID
 * nuevo, que apuntará en Ajustes al abrirse) y quien lo use tendrá que
 * autorizarlo otra vez. Tampoco viaja el disparador horario de
 * sincronización.
 *
 * crearEjercicioSiguiente() es la opción del menú; ejercicioSiguiente(),
 * lo mismo sin ventanas, la usa también la consola para todos los centros.
 *******************************************************************/

function crearEjercicioSiguiente() {
  const ss = libro();
  const ui = SpreadsheetApp.getUi();
  const plan = planDelEjercicioSiguiente(ss);
  if (plan.existe) {
    ui.alert(`Ya existe «${plan.nombre}» en la carpeta ${plan.carpeta.getName()}. No se ha creado nada.`);
    return;
  }
  const r = ui.alert('Crear el ejercicio siguiente',
    `Se creará «${plan.nombre}» (${plan.anio}-${plan.anio + 1}) en la carpeta ${plan.carpeta.getName()}, con:\n\n`
    + `• Saldo inicial del banco: ${euros(plan.saldos.banco)}\n`
    + `• Saldo inicial del efectivo: ${euros(plan.saldos.efectivo)}\n`
    + '• Las mismas partidas del presupuesto, sin importes.\n\n'
    + plan.avisos.map(a => '⚠ ' + a + '\n\n').join('')
    + 'Si después se añaden asientos a este ejercicio, en el nuevo se puede usar '
    + '«Traer los saldos iniciales del ejercicio anterior». ¿Sigo?',
    ui.ButtonSet.YES_NO);
  if (r !== ui.Button.YES) return;

  const hecho = ejercicioSiguiente(ss);
  const html = HtmlService.createHtmlOutput(
    '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5">'
    + `<p><b>${hecho.nombre}</b> está creado: <a href="${hecho.url}" target="_blank">abrirlo</a>.</p>`
    + '<p>En el nuevo libro, la primera vez:</p><ol>'
    + '<li>Ábrelo y usa cualquier opción del menú Tesorería: pedirá autorización (es otro script).</li>'
    + '<li>Tesorería → Diagnóstico → Diagnóstico del sistema.</li>'
    + '<li>Si usas la sincronización automática, quítala aquí e instálala allí.</li></ol>'
    + (hecho.avisos.length ? '<p>⚠ ' + hecho.avisos.join('<br>⚠ ') + '</p>' : '')
    + '</div>').setWidth(520).setHeight(300);
  ui.showModalDialog(html, 'Ejercicio creado');
}

/** Qué haría ejercicioSiguiente(), sin hacerlo: { anio, nombre, carpeta, existe, saldos, avisos }. */
function planDelEjercicioSiguiente(ss) {
  return conLibro(ss, () => {
    const aj = leerAjustes(ss);
    const anio = aj.inicio.getFullYear() + 1;
    const nombre = nombreDeEjercicio(anio);
    const padres = DriveApp.getFileById(ss.getId()).getParents();
    const carpeta = padres.hasNext() ? padres.next() : DriveApp.getRootFolder();
    const filas = leerCaja(ss);
    const saldos = saldosALaFecha(filas, saldosIniciales(ss), aj.fin);
    const despues = filas.filter(f => f.fechaEfectiva && f.fechaEfectiva > aj.fin);
    const pendientes = filas.filter(f => f.pendiente);
    const avisos = [];
    if (despues.length) avisos.push(`Hay ${despues.length} asientos con fecha de pago posterior al ${fechaCorta(aj.fin)} `
      + `(${despues.slice(0, 5).map(f => f.id).join(', ')}…): no cuentan en estos saldos y habría que pasarlos al nuevo.`);
    if (pendientes.length) avisos.push(`Hay ${pendientes.length} transferencias pendientes (${pendientes.slice(0, 5).map(f => f.id).join(', ')}): `
      + 'no están en estos saldos. Si salen del banco ya en el ejercicio nuevo, apúntalas allí.');
    return { anio: anio, nombre: nombre, carpeta: carpeta, existe: carpeta.getFilesByName(nombre).hasNext(),
      saldos: saldos, avisos: avisos };
  });
}

/** Crea el libro del ejercicio siguiente al de `ss`, sin ventanas. { nombre, id, url, avisos }. */
function ejercicioSiguiente(ss) {
  const plan = planDelEjercicioSiguiente(ss);
  if (plan.existe) throw new Error(`Ya existe «${plan.nombre}» en la carpeta ${plan.carpeta.getName()}.`);
  SpreadsheetApp.flush();
  const copia = DriveApp.getFileById(ss.getId()).makeCopy(plan.nombre, plan.carpeta);
  const nuevo = SpreadsheetApp.openById(copia.getId());
  const avisos = plan.avisos.concat(conLibro(nuevo, () =>
    prepararEjercicioNuevo(nuevo, { anio: plan.anio, anterior: ss.getId(), saldos: plan.saldos })));
  conLibro(ss, () => registrar('INFO', `Creado el ejercicio siguiente: ${plan.nombre}`, copia.getUrl()));
  return { nombre: plan.nombre, id: copia.getId(), url: copia.getUrl(), avisos: avisos };
}

/** 2027 → «Ejercicio 27-28». Pura. */
function nombreDeEjercicio(anio) { return `Ejercicio ${String(anio).slice(2)}-${String(anio + 1).slice(2)}`; }

/** Vacía la copia y la deja lista para el año nuevo. Devuelve avisos. */
function prepararEjercicioNuevo(nuevo, o) {
  const avisos = [];
  const P = CAJA.PRIMERA_FILA;

  const caja = nuevo.getSheetByName(HOJAS.CAJA);
  const ultima = ultimaFilaDeCaja(caja);
  if (ultima >= P) {
    const n = ultima - P + 1, s = colCaja('Saldo');
    caja.getRange(P, 1, n, s - 1).clearContent().clearNote();
    caja.getRange(P, s + 1, n, CAJA.COLUMNAS.length - s).clearContent().clearNote();
  }
  caja.getRange('B1').setValue(o.saldos.banco);
  caja.getRange('C1').setValue(o.saldos.efectivo);
  caja.getRange('I2').clearContent().clearNote();

  const pres = nuevo.getSheetByName(HOJAS.PRESUPUESTO);
  const n = pres.getMaxRows() - PRESUPUESTO.PRIMERA_FILA + 1;
  pres.getRange(PRESUPUESTO.PRIMERA_FILA, 4, n, 1).clearContent();
  pres.getRange(PRESUPUESTO.PRIMERA_FILA, 8, n, 1).clearContent();

  nuevo.getSheets().filter(esHojaDeActividad).forEach(h => {
    try { nuevo.deleteSheet(h); }
    catch (e) { avisos.push(`No se ha podido borrar la hoja «${h.getName()}»: bórrala a mano.`); }
  });
  const listas = nuevo.getSheetByName(HOJAS.LISTAS);
  if (listas) listas.getRange('B2:B').clearContent();

  const log = nuevo.getSheetByName(HOJAS.LOG);
  if (log && log.getLastRow() > 1) log.deleteRows(2, log.getLastRow() - 1);

  escribirAjuste(nuevo, AJUSTES.EJERCICIO, `${o.anio}-${o.anio + 1}`);
  escribirAjuste(nuevo, AJUSTES.INICIO, new Date(o.anio, 8, 1));
  escribirAjuste(nuevo, AJUSTES.FIN, new Date(o.anio + 1, 7, 31));
  escribirAjuste(nuevo, AJUSTES.CURSO, `${o.anio}-${o.anio + 1}`);
  escribirAjuste(nuevo, AJUSTES.ANTERIOR, o.anterior);
  escribirAjuste(nuevo, AJUSTES.ULTIMO_EXTRACTO, '');
  // La copia tiene su propio script: lo apuntará ella al abrirse.
  escribirAjuste(nuevo, AJUSTES.PROGRAMA, '');
  // Copia del libro plantilla para otro centro: nada de la configuración de
  // la plantilla vale (carpetas, cuenta…); reparar la rellena con la suya.
  if (o.otroCentro) Object.keys(CONFIG_EN_AJUSTES).forEach(k => escribirAjuste(nuevo, CONFIG_EN_AJUSTES[k][0], ''));
  return avisos;
}

/** Saldos de banco y efectivo al final del día de corte (puro). */
function saldosALaFecha(filas, iniciales, corte) {
  let banco = iniciales.banco, efectivo = iniciales.efectivo;
  filas.forEach(f => {
    if (f.cantidad === null || !f.fechaEfectiva || f.fechaEfectiva > corte) return;
    if (f.partida === CAJA.EJERCICIO_ANTERIOR) return;   // ya estaba en el saldo inicial
    if (f.esEfectivo) efectivo += f.cantidad; else banco += f.cantidad;
  });
  return { banco: redondear(banco), efectivo: redondear(efectivo) };
}

function traerSaldosInicialesDelAnterior() {
  const ss = libro();
  const ui = SpreadsheetApp.getUi();
  const aj = leerAjustes(ss);
  if (!aj.anterior) {
    ui.alert(`Pon en Ajustes («${AJUSTES.ANTERIOR}») el ID del libro del ejercicio anterior: `
      + 'lo que va entre /d/ y /edit en su dirección.');
    return;
  }
  const previo = SpreadsheetApp.openById(aj.anterior);
  const ajPrevio = leerAjustes(previo);
  const s = saldosALaFecha(leerCaja(previo), saldosIniciales(previo), ajPrevio.fin);
  const ahora = saldosIniciales(ss);
  if (redondear(ahora.banco) === s.banco && redondear(ahora.efectivo) === s.efectivo) {
    ui.alert(`Los saldos iniciales ya coinciden con los finales de ${previo.getName()}.`);
    return;
  }
  const r = ui.alert('Saldos iniciales',
    `Según ${previo.getName()}, a ${fechaCorta(ajPrevio.fin)}:\n\n`
    + `• Banco: ${euros(s.banco)} (aquí pone ${euros(ahora.banco)})\n`
    + `• Efectivo: ${euros(s.efectivo)} (aquí pone ${euros(ahora.efectivo)})\n\n¿Los cambio?`,
    ui.ButtonSet.YES_NO);
  if (r !== ui.Button.YES) return;
  const caja = ss.getSheetByName(HOJAS.CAJA);
  caja.getRange('B1').setValue(s.banco);
  caja.getRange('C1').setValue(s.efectivo);
  registrar('INFO', 'Saldos iniciales traídos del ejercicio anterior', `Banco ${euros(s.banco)} · Efectivo ${euros(s.efectivo)}`);
}
