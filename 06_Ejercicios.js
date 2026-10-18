/*******************************************************************
 * JMV — TESORERÍA · Paso de un ejercicio al siguiente
 *
 * Crear el ejercicio siguiente COPIA este libro (Drive copia con él su
 * proyecto de Apps Script, así que el nuevo trae el código, el menú y la
 * estructura) y lo vacía: Caja sin asientos, Presupuesto con las mismas
 * partidas y sin importes, sin hojas de actividad, Log vacío y Ajustes
 * del año nuevo. Los saldos iniciales son los finales de este.
 *
 * Lo que NO viaja con la copia (hay que hacerlo en el nuevo, ver
 * README.md): la autorización del script, el disparador horario de
 * sincronización, y el ID del proyecto en .clasp.json.
 *
 * El libro viejo se queda como está, con su código: un ejercicio cerrado
 * no debe cambiar porque el código de hoy haga algo distinto.
 *******************************************************************/

function crearEjercicioSiguiente() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const aj = leerAjustes(ss);
  const anio = aj.inicio.getFullYear() + 1;
  const nombre = `Ejercicio ${String(anio).slice(2)}-${String(anio + 1).slice(2)}`;

  const archivo = DriveApp.getFileById(ss.getId());
  const padres = archivo.getParents();
  const carpeta = padres.hasNext() ? padres.next() : DriveApp.getRootFolder();
  if (carpeta.getFilesByName(nombre).hasNext()) {
    ui.alert(`Ya existe «${nombre}» en la carpeta ${carpeta.getName()}. No se ha creado nada.`);
    return;
  }

  const filas = leerCaja(ss);
  const saldos = saldosALaFecha(filas, saldosIniciales(ss), aj.fin);
  const despues = filas.filter(f => f.fechaEfectiva && f.fechaEfectiva > aj.fin);
  const r = ui.alert('Crear el ejercicio siguiente',
    `Se creará «${nombre}» (${anio}-${anio + 1}) en la carpeta ${carpeta.getName()}, con:\n\n`
    + `• Saldo inicial del banco: ${euros(saldos.banco)}\n`
    + `• Saldo inicial del efectivo: ${euros(saldos.efectivo)}\n`
    + '• Las mismas partidas del presupuesto, sin importes.\n\n'
    + (despues.length ? `⚠ Hay ${despues.length} asientos con fecha de pago posterior al ${fechaCorta(aj.fin)} `
      + `(${despues.slice(0, 5).map(f => f.id).join(', ')}…): no cuentan en estos saldos y habría que pasarlos al nuevo.\n\n` : '')
    + 'Si después se añaden asientos a este ejercicio, en el nuevo se puede usar '
    + '«Traer los saldos iniciales del ejercicio anterior». ¿Sigo?',
    ui.ButtonSet.YES_NO);
  if (r !== ui.Button.YES) return;

  SpreadsheetApp.flush();
  const copia = archivo.makeCopy(nombre, carpeta);
  const avisos = prepararEjercicioNuevo(SpreadsheetApp.openById(copia.getId()),
    { anio: anio, anterior: ss.getId(), saldos: saldos });
  registrar('INFO', `Creado el ejercicio siguiente: ${nombre}`, copia.getUrl());

  const html = HtmlService.createHtmlOutput(
    '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5">'
    + `<p><b>${nombre}</b> está creado: <a href="${copia.getUrl()}" target="_blank">abrirlo</a>.</p>`
    + '<p>En el nuevo libro, la primera vez:</p><ol>'
    + '<li>Ábrelo y usa cualquier opción del menú Tesorería: pedirá autorización (es otro proyecto de script).</li>'
    + '<li>Tesorería → Diagnóstico → Diagnóstico del sistema.</li>'
    + '<li>Si usas la sincronización automática, quítala aquí e instálala allí.</li>'
    + '<li>Para trabajar con clasp: Extensiones → Apps Script → Configuración del proyecto → ID de la secuencia de comandos, '
    + 'y pon ese ID en el .clasp.json del repositorio.</li></ol>'
    + (avisos.length ? '<p>⚠ ' + avisos.join('<br>⚠ ') + '</p>' : '')
    + '</div>').setWidth(520).setHeight(360);
  ui.showModalDialog(html, 'Ejercicio creado');
}

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
  const ss = SpreadsheetApp.getActiveSpreadsheet();
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
