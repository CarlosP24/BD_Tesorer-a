/*******************************************************************
 * JMV — TESORERÍA · Hojas de actividad
 *
 * Tesorería → Actividades → Nueva hoja de actividad… crea una hoja
 * "Act · <título>" para un par de partidas (una de ingresos y otra de
 * gastos; puede faltar una de las dos). La hoja tiene:
 *
 *   - Resumen: presupuestado (de Presupuesto), real (de Caja) y
 *     diferencia, de ingresos, gastos y balance.
 *   - Subpartidas: código, descripción y presupuesto se escriben aquí;
 *     el real sale de Caja. Por defecto, las de la partida de gastos con
 *     A (Alojamiento), M (Manutención), T (Transporte) y MT (Material):
 *     G21A, G21M… Son las que luego se ofrecen en Caja.
 *   - Movimientos: los asientos de Caja de esas partidas, con FILTER.
 *
 * Todo lo copiado está protegido. Las columnas a partir de la N son
 * libres para cálculos de la actividad. Ojo: los movimientos se
 * recalculan, así que una columna libre debe ser una FÓRMULA de su fila
 * (=J28*2), no un dato tecleado: si entra un asiento anterior en Caja,
 * las filas bajan y un dato tecleado quedaría al lado de otro asiento.
 *
 * La hoja se reconoce por sus metadatos (ACT.META), no por su nombre:
 * se puede renombrar.
 *******************************************************************/

const ACT = {
  META: 'tesoreria.actividad',
  PREFIJO: 'Act · ',
  CELDA_TITULO: 'B1', CELDA_INGRESOS: 'B2', CELDA_GASTOS: 'B3',
  FILA_SUB_CAB: 10, PRIMERA_SUB: 11, FILAS_SUB: 12,
  FILA_SIN_SUB: 23,   // 23: ingresos sin subpartida; 24: gastos sin subpartida
  FILA_MOV_TITULO: 26, FILA_MOV_CAB: 27, PRIMERA_MOV: 28,
  COLUMNAS_MOV: ['ID Transacción', 'Fecha', 'Fecha de pago', 'Concepto Banco', 'Descripción', 'Partida',
                 'Subpartida', 'ID socio', 'Proveedor', 'Cantidad', 'Factura', 'Método de pago'],
  PRIMERA_COLUMNA_LIBRE: 14,   // N
  COLUMNAS: 40,
  SUBPARTIDAS: [['A', 'Alojamiento'], ['M', 'Manutención'], ['T', 'Transporte'], ['MT', 'Material']]
};

function esHojaDeActividad(h) {
  try { return h.getDeveloperMetadata().some(m => m.getKey() === ACT.META); }
  catch (e) { return false; }
}

/** [{ hoja, nombre, titulo, ingresos, gastos, subpartidas: [{ codigo, descripcion, presupuesto }] }] */
function hojasDeActividad(ss) {
  return (ss || SpreadsheetApp.getActiveSpreadsheet()).getSheets().filter(esHojaDeActividad).map(h => {
    const cab = h.getRange('B1:B3').getValues();
    const subs = h.getRange(ACT.PRIMERA_SUB, 1, ACT.FILAS_SUB, 3).getValues()
      .filter(f => String(f[0]).trim() !== '')
      .map(f => ({ codigo: String(f[0]).trim().toUpperCase(), descripcion: String(f[1] || '').trim(),
                   presupuesto: numeroDeTexto(f[2]) || 0 }));
    return { hoja: h, nombre: h.getName(), titulo: String(cab[0][0] || h.getName()).trim(),
      ingresos: String(cab[1][0] || '').trim().toUpperCase(), gastos: String(cab[2][0] || '').trim().toUpperCase(),
      subpartidas: subs };
  });
}


// ==================================================================
// CREAR
// ==================================================================

function abrirNuevaActividad() {
  const p = leerPartidas();
  const t = HtmlService.createTemplateFromFile('Actividad');
  t.partidas = JSON.stringify({
    ingresos: p.ingresos.map(x => ({ codigo: x.codigo, texto: `${x.codigo} — ${x.descripcion}`, seccion: x.seccion })),
    gastos: p.gastos.map(x => ({ codigo: x.codigo, texto: `${x.codigo} — ${x.descripcion}`, seccion: x.seccion }))
  });
  SpreadsheetApp.getUi().showModalDialog(t.evaluate().setWidth(480).setHeight(430), 'Nueva hoja de actividad');
}

/** Lo llama Actividad.html. datos: { titulo, ingresos, gastos, subpartidas }. */
function crearHojaDeActividad(datos) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const titulo = String(datos.titulo || '').replace(/[\[\]*?\/\\:]/g, ' ').replace(/\s+/g, ' ').trim();
  const ing = String(datos.ingresos || '').trim().toUpperCase();
  const gas = String(datos.gastos || '').trim().toUpperCase();
  if (!titulo) throw new Error('Falta el título.');
  if (!ing && !gas) throw new Error('Elige al menos una partida.');
  const p = leerPartidas(ss);
  if (ing && !p.ingresos.some(x => x.codigo === ing)) throw new Error(`${ing} no está en el Presupuesto.`);
  if (gas && !p.gastos.some(x => x.codigo === gas)) throw new Error(`${gas} no está en el Presupuesto.`);
  const usada = hojasDeActividad(ss).find(a => (ing && a.ingresos === ing) || (gas && a.gastos === gas));
  const nombre = (ACT.PREFIJO + titulo).slice(0, 90);
  if (ss.getSheetByName(nombre)) throw new Error(`Ya hay una hoja llamada «${nombre}».`);

  const ajustes = ss.getSheetByName(HOJAS.AJUSTES);
  const h = ss.insertSheet(nombre, ajustes ? ajustes.getIndex() - 1 : ss.getSheets().length);
  asegurarTamaño(h, 300, ACT.COLUMNAS);
  h.addDeveloperMetadata(ACT.META, '1');
  conFormulasEnIngles(ss, () => montarHojaDeActividad(h, titulo, ing, gas,
    datos.subpartidas && gas ? ACT.SUBPARTIDAS.map(s => [gas + s[0], s[1]]) : []));
  protegerHojaDeActividad(h);
  actualizarListaSubpartidas(ss);
  ss.setActiveSheet(h);
  registrar('INFO', `Hoja de actividad creada: ${nombre}`, `Ingresos ${ing || '—'} · Gastos ${gas || '—'}`);
  return { nombre: nombre,
    aviso: usada ? `Ojo: la hoja «${usada.nombre}» ya usa alguna de estas partidas; las dos mostrarán los mismos asientos.` : '' };
}

function montarHojaDeActividad(h, titulo, ing, gas, subpartidas) {
  const caja = HOJAS.CAJA, P = CAJA.PRIMERA_FILA;
  const cc = nombre => `${caja}!$${letraCaja(nombre)}$${P}:$${letraCaja(nombre)}`;
  const pres = HOJAS.PRESUPUESTO, PP = PRESUPUESTO.PRIMERA_FILA;
  const AZUL = '#6075BB', TURQUESA = '#18A2B5', GRIS = '#F3F3F3';

  // Cabecera.
  h.getRange('A1:A3').setValues([['Actividad'], ['Partida de ingresos'], ['Partida de gastos']]).setFontWeight('bold');
  h.getRange('B1').setValue(titulo).setFontSize(14).setFontWeight('bold');
  h.getRange('B2:B3').setNumberFormat('@').setValues([[ing], [gas]]);
  h.getRange('C2').setFormula(`=IF(B2="", "—", IFERROR(VLOOKUP(B2, ${pres}!$A$${PP}:$C, 3, FALSE), "⚠ No está en el Presupuesto"))`);
  h.getRange('C3').setFormula(`=IF(B3="", "—", IFERROR(VLOOKUP(B3, ${pres}!$E$${PP}:$G, 3, FALSE), "⚠ No está en el Presupuesto"))`);

  // Resumen.
  h.getRange('A5:D5').setValues([['Resumen', 'Presupuestado', 'Real', 'Diferencia']])
    .setFontWeight('bold').setBackground(AZUL).setFontColor('#FFFFFF');
  h.getRange('A6:A8').setValues([['Ingresos'], ['Gastos'], ['Balance']]).setFontWeight('bold');
  h.getRange('B6').setFormula(`=IF(B2="", 0, IFERROR(VLOOKUP(B2, ${pres}!$A$${PP}:$D, 4, FALSE), 0))`);
  h.getRange('B7').setFormula(`=IF(B3="", 0, IFERROR(VLOOKUP(B3, ${pres}!$E$${PP}:$H, 4, FALSE), 0))`);
  h.getRange('C6').setFormula(`=IF(B2="", 0, SUMIFS(${cc('Cantidad')}, ${cc('Partida')}, B2))`);
  h.getRange('C7').setFormula(`=IF(B3="", 0, -SUMIFS(${cc('Cantidad')}, ${cc('Partida')}, B3))`);
  h.getRange('B8').setFormula('=B6-B7');
  h.getRange('C8').setFormula('=C6-C7');
  h.getRange('D6:D8').setFormulas([['=C6-B6'], ['=C7-B7'], ['=C8-B8']]);
  h.getRange('A8:D8').setFontWeight('bold').setBorder(true, null, null, null, null, null);
  h.getRange('B6:D8').setNumberFormat(CAJA.FORMATO_EUROS);

  // Subpartidas.
  const S = ACT.PRIMERA_SUB, N = ACT.FILAS_SUB, U = S + N - 1;
  h.getRange(ACT.FILA_SUB_CAB, 1, 1, 5).setValues([['Subpartida', 'Descripción', 'Presupuestado', 'Real', 'Diferencia']])
    .setFontWeight('bold').setBackground(TURQUESA).setFontColor('#FFFFFF');
  h.getRange(S, 1, N, 1).setNumberFormat('@');
  if (subpartidas.length) h.getRange(S, 1, subpartidas.length, 2).setValues(subpartidas);
  const formulas = [];
  for (let f = S; f <= U; f++) {
    formulas.push([`=IF($A${f}="",, IF(LEFT($A${f})="G", -1, 1)*SUMIFS(${cc('Cantidad')}, ${cc('Subpartida')}, $A${f}))`,
                   `=IF($A${f}="",, D${f}-C${f})`]);
  }
  h.getRange(S, 4, N, 2).setFormulas(formulas);
  h.getRange(S, 1, N, 3).setBackground('#FFF6E5');
  const F = ACT.FILA_SIN_SUB;
  h.getRange(F, 1, 2, 1).setValues([['Ingresos sin subpartida'], ['Gastos sin subpartida']]).setFontStyle('italic');
  h.getRange(F, 3, 2, 3).setFormulas([
    [`=B6-SUMIF($A$${S}:$A$${U}, "I*", $C$${S}:$C$${U})`, `=C6-SUMIF($A$${S}:$A$${U}, "I*", $D$${S}:$D$${U})`, `=D${F}-C${F}`],
    [`=B7-SUMIF($A$${S}:$A$${U}, "G*", $C$${S}:$C$${U})`, `=C7-SUMIF($A$${S}:$A$${U}, "G*", $D$${S}:$D$${U})`, `=D${F + 1}-C${F + 1}`]
  ]);
  h.getRange(S, 3, N + 3, 3).setNumberFormat(CAJA.FORMATO_EUROS);
  h.getRange(S, 1, N, 1).setDataValidation(SpreadsheetApp.newDataValidation()
    .requireFormulaSatisfied(`=OR(AND($B$2<>"", LEFT(A${S}, LEN($B$2))=$B$2, LEN(A${S})>LEN($B$2)), `
      + `AND($B$3<>"", LEFT(A${S}, LEN($B$3))=$B$3, LEN(A${S})>LEN($B$3)))`)
    .setAllowInvalid(false)
    .setHelpText('El código de la partida seguido de letras: G21A, G21M, I21V…').build());

  // Movimientos.
  const M = ACT.PRIMERA_MOV, C = ACT.COLUMNAS_MOV;
  h.getRange(ACT.FILA_MOV_TITULO, 1).setValue('Movimientos de Caja con estas partidas (no se editan aquí). '
    + 'A partir de la columna N puedes añadir tus columnas: mejor fórmulas de la misma fila que datos tecleados.')
    .setFontStyle('italic').setFontColor('#666666');
  h.getRange(ACT.FILA_MOV_CAB, 1, 1, C.length + 1).setValues([C.concat(['Acumulado'])])
    .setFontWeight('bold').setBackground(AZUL).setFontColor('#FFFFFF').setWrap(true);
  const cond = `((${cc('Partida')}=$B$2)*($B$2<>"")+(${cc('Partida')}=$B$3)*($B$3<>""))`;
  h.getRange(M, 1).setFormula(`=IFERROR(FILTER({${C.map(cc).join(', ')}}, ${cond}), "Todavía no hay asientos con estas partidas.")`);
  h.getRange(M, C.length + 1).setFormula(`=IFERROR(SCAN(0, FILTER(${cc('Cantidad')}, ${cond}), LAMBDA(a, x, a + x)), )`);
  const filas = h.getMaxRows() - M + 1;
  h.getRange(M, 2, filas, 2).setNumberFormat(CAJA.FORMATO_FECHA);
  h.getRange(M, C.indexOf('Cantidad') + 1, filas, 1).setNumberFormat(CAJA.FORMATO_EUROS);
  h.getRange(M, C.length + 1, filas, 1).setNumberFormat(CAJA.FORMATO_EUROS);
  h.getRange(M, 1, filas, C.length + 1).setBackground(GRIS);
  h.getRange(ACT.FILA_MOV_CAB, ACT.PRIMERA_COLUMNA_LIBRE, 1, 3).setBackground('#FFF6E5');

  [115, 95, 95, 300, 220, 75, 90, 110, 160, 95, 200, 120, 100].forEach((w, i) => h.setColumnWidth(i + 1, w));
  h.setColumnWidth(1, 170);
  h.setFrozenRows(0);
}

/**
 * Todo protegido salvo el título, las subpartidas y las columnas libres.
 * Estricta: el script no vuelve a escribir en esta hoja después de crearla.
 */
function protegerHojaDeActividad(h) {
  const p = h.protect().setDescription(PROTECCION + 'hoja de actividad (lo copiado de Caja y Presupuesto)');
  p.setUnprotectedRanges([
    h.getRange(ACT.CELDA_TITULO),
    h.getRange(ACT.PRIMERA_SUB, 1, ACT.FILAS_SUB, 3),
    h.getRange(1, ACT.PRIMERA_COLUMNA_LIBRE, h.getMaxRows(), h.getMaxColumns() - ACT.PRIMERA_COLUMNA_LIBRE + 1)
  ]);
  const yo = Session.getEffectiveUser();
  p.addEditor(yo);
  const otros = p.getEditors().filter(e => e.getEmail() !== yo.getEmail());
  if (otros.length) p.removeEditors(otros);
  if (p.canDomainEdit()) p.setDomainEdit(false);
}


// ==================================================================
// SUBPARTIDAS
// ==================================================================

function alEditarActividad(e) {
  const r = e.range;
  const fin = ACT.PRIMERA_SUB + ACT.FILAS_SUB - 1;
  if (r.getColumn() <= 1 && r.getLastColumn() >= 1 && r.getLastRow() >= ACT.PRIMERA_SUB && r.getRow() <= fin) {
    actualizarListaSubpartidas(e.source);
  }
}

/** Reescribe la lista de subpartidas que ofrece Caja (en _Listas). */
function actualizarListaSubpartidas(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  const listas = ss.getSheetByName(HOJAS.LISTAS);
  if (!listas) return [];
  const codigos = [];
  hojasDeActividad(ss).forEach(a => a.subpartidas.forEach(s => {
    if (codigos.indexOf(s.codigo) < 0) codigos.push(s.codigo);
  }));
  codigos.sort();
  listas.getRange('B2:B').clearContent();
  if (codigos.length) listas.getRange(2, 2, codigos.length, 1).setValues(codigos.map(c => [c]));
  return codigos;
}

function actualizarListaSubpartidasAhora() {
  const c = actualizarListaSubpartidas();
  SpreadsheetApp.getActiveSpreadsheet().toast(
    c.length ? `${c.length} subpartidas: ${c.join(', ')}` : 'No hay subpartidas definidas.', 'Subpartidas', 6);
}
