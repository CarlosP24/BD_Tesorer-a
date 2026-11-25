/*******************************************************************
 * JMV — TESORERÍA · Hojas de actividad
 *
 * Tesorería → Actividades → Nueva hoja de actividad… crea una hoja
 * "Act · <título>" para un par de partidas (una de ingresos y otra de
 * gastos; puede faltar una de las dos). «Nueva hoja de financiación…»
 * crea la misma hoja ("Fin · <título>") para una actividad con fin
 * lucrativo, con partidas de la sección 3 (Financiación) y otras
 * subpartidas por defecto (ACT.TIPOS). Por defecto crea también sus
 * partidas en el Presupuesto: el primer número libre a la vez en I y G
 * de la sección 2 (actividad) o 3 (financiación), con el título como
 * descripción y sin importe (siguientePartidaLibre(), añadirPartida()).
 * También se puede elegir una partida que ya exista. La hoja tiene:
 *
 *   - Resumen: presupuestado (de Presupuesto), real (de Caja) y
 *     diferencia, de ingresos, gastos y balance.
 *   - Subpartidas: código, descripción y presupuesto se escriben aquí;
 *     el real sale de Caja. Por defecto, en una actividad, las de la
 *     partida de gastos con A (Alojamiento), M (Manutención),
 *     T (Transporte) y MT (Material): G21A, G21M…; en una de
 *     financiación, V (Ventas) en ingresos y MT (Material) y
 *     P (Promoción) en gastos: I31V, G31MT, G31P. Son las que luego se
 *     ofrecen en Caja.
 *   - Movimientos: los asientos de Caja de esas partidas, con FILTER.
 *
 * Todo lo copiado está protegido. Las columnas a partir de la N son
 * libres para cálculos de la actividad. Ojo: los movimientos se
 * recalculan, así que una columna libre debe ser una FÓRMULA de su fila
 * (=J28*2), no un dato tecleado: si entra un asiento anterior en Caja,
 * las filas bajan y un dato tecleado quedaría al lado de otro asiento.
 *
 * La hoja se reconoce por sus metadatos (ACT.META), no por su nombre:
 * se puede renombrar. El valor del metadato es el tipo ('financiacion';
 * '1' es una actividad, como las creadas antes de que hubiera tipos).
 *******************************************************************/

const ACT = {
  META: 'tesoreria.actividad',
  CELDA_TITULO: 'B1', CELDA_INGRESOS: 'B2', CELDA_GASTOS: 'B3',
  FILA_SUB_CAB: 10, PRIMERA_SUB: 11, FILAS_SUB: 12,
  FILA_SIN_SUB: 23,   // 23: ingresos sin subpartida; 24: gastos sin subpartida
  FILA_MOV_TITULO: 26, FILA_MOV_CAB: 27, PRIMERA_MOV: 28,
  COLUMNAS_MOV: ['ID Transacción', 'Fecha', 'Fecha de pago', 'Concepto Banco', 'Descripción', 'Partida',
                 'Subpartida', 'ID socio', 'Proveedor', 'Cantidad', 'Factura', 'Método de pago'],
  PRIMERA_COLUMNA_LIBRE: 14,   // N
  COLUMNAS: 40,
  // Por tipo de hoja. seccion: partidas existentes que se ofrecen ('' =
  // todas). seccionNueva: donde se crean sus partidas nuevas. Las
  // subpartidas son sufijos del código de la partida.
  NUEVA: '+nueva',   // valor del desplegable: crear la partida
  TIPOS: {
    actividad: {
      meta: '1', prefijo: 'Act · ', etiqueta: 'Actividad', dialogo: 'Nueva hoja de actividad',
      seccion: '', seccionNueva: 2, ejemplo: 'Convivencia de otoño',
      subpartidas: { ingresos: [], gastos: [['A', 'Alojamiento'], ['M', 'Manutención'], ['T', 'Transporte'], ['MT', 'Material']] },
      textoSubpartidas: 'Crear las subpartidas de gastos por defecto (Alojamiento, Manutención, Transporte y Material)'
    },
    financiacion: {
      meta: 'financiacion', prefijo: 'Fin · ', etiqueta: 'Actividad de financiación', dialogo: 'Nueva hoja de financiación',
      seccion: '3.', seccionNueva: 3, ejemplo: 'Lotería de Navidad',
      subpartidas: { ingresos: [['V', 'Ventas']], gastos: [['MT', 'Material'], ['P', 'Promoción']] },
      textoSubpartidas: 'Crear las subpartidas por defecto (Ventas en ingresos; Material y Promoción en gastos)'
    }
  }
};

/** Tipo de hoja ('actividad' o 'financiacion') a partir del valor del metadato. */
function tipoDeActividad(valorMeta) {
  return Object.keys(ACT.TIPOS).find(k => ACT.TIPOS[k].meta === String(valorMeta)) || 'actividad';
}

/** [[código, descripción]] de las subpartidas por defecto de una hoja nueva. Pura. */
function subpartidasPorDefecto(tipo, ing, gas) {
  const s = ACT.TIPOS[tipo].subpartidas;
  return (ing ? s.ingresos.map(x => [ing + x[0], x[1]]) : [])
    .concat(gas ? s.gastos.map(x => [gas + x[0], x[1]]) : []);
}

function esHojaDeActividad(h) {
  try { return h.getDeveloperMetadata().some(m => m.getKey() === ACT.META); }
  catch (e) { return false; }
}

/** [{ hoja, nombre, tipo, titulo, ingresos, gastos, subpartidas: [{ codigo, descripcion, presupuesto }] }] */
function hojasDeActividad(ss) {
  return (ss || libro()).getSheets().filter(esHojaDeActividad).map(h => {
    const meta = h.getDeveloperMetadata().find(m => m.getKey() === ACT.META);
    const cab = h.getRange('B1:B3').getValues();
    const subs = h.getRange(ACT.PRIMERA_SUB, 1, ACT.FILAS_SUB, 3).getValues()
      .filter(f => String(f[0]).trim() !== '')
      .map(f => ({ codigo: String(f[0]).trim().toUpperCase(), descripcion: String(f[1] || '').trim(),
                   presupuesto: numeroDeTexto(f[2]) || 0 }));
    return { hoja: h, nombre: h.getName(), tipo: tipoDeActividad(meta ? meta.getValue() : ''), titulo: String(cab[0][0] || h.getName()).trim(),
      ingresos: String(cab[1][0] || '').trim().toUpperCase(), gastos: String(cab[2][0] || '').trim().toUpperCase(),
      subpartidas: subs };
  });
}


// ==================================================================
// CREAR
// ==================================================================

function abrirNuevaActividad() { abrirDialogoDeActividad('actividad'); }
function abrirNuevaFinanciacion() { abrirDialogoDeActividad('financiacion'); }

function abrirDialogoDeActividad(tipo) {
  const T = ACT.TIPOS[tipo];
  const p = leerPartidas();
  const lista = xs => xs.filter(x => !T.seccion || x.seccion.indexOf(T.seccion) === 0)
    .map(x => ({ codigo: x.codigo, texto: `${x.codigo} — ${x.descripcion}`, seccion: x.seccion }));
  const num = siguientePartidaLibre(p, T.seccionNueva);
  const t = HtmlService.createTemplateFromFile('Actividad');
  t.partidas = JSON.stringify({ ingresos: lista(p.ingresos), gastos: lista(p.gastos), nueva: ACT.NUEVA,
    nuevaIngresos: `I${T.seccionNueva}${num}`, nuevaGastos: `G${T.seccionNueva}${num}` });
  t.tipo = tipo;
  t.ejemplo = T.ejemplo;
  t.textoSubpartidas = T.textoSubpartidas;
  SpreadsheetApp.getUi().showModalDialog(t.evaluate().setWidth(480).setHeight(470), T.dialogo);
}

/**
 * Lo llama Actividad.html. datos: { tipo, titulo, ingresos, gastos, subpartidas };
 * ingresos o gastos = ACT.NUEVA crea la partida en el Presupuesto, con el
 * título como descripción y sin importe.
 */
function crearHojaDeActividad(datos) {
  const ss = libro();
  const tipo = ACT.TIPOS[datos.tipo] ? datos.tipo : 'actividad';
  const T = ACT.TIPOS[tipo];
  const titulo = String(datos.titulo || '').replace(/[\[\]*?\/\\:]/g, ' ').replace(/\s+/g, ' ').trim();
  const nuevaI = datos.ingresos === ACT.NUEVA, nuevaG = datos.gastos === ACT.NUEVA;
  if (!titulo) throw new Error('Falta el título.');
  if (!datos.ingresos && !datos.gastos) throw new Error('Elige al menos una partida.');
  const p = leerPartidas(ss);
  // El número se calcula ahora, no al abrir el diálogo: alguien puede
  // haber añadido partidas mientras tanto.
  const num = siguientePartidaLibre(p, T.seccionNueva);
  const ing = nuevaI ? `I${T.seccionNueva}${num}` : String(datos.ingresos || '').trim().toUpperCase();
  const gas = nuevaG ? `G${T.seccionNueva}${num}` : String(datos.gastos || '').trim().toUpperCase();
  const comprobar = (codigo, lista) => {
    if (!codigo) return;
    const x = lista.find(y => y.codigo === codigo);
    if (!x) throw new Error(`${codigo} no está en el Presupuesto.`);
    if (T.seccion && x.seccion.indexOf(T.seccion) !== 0) throw new Error(`${codigo} no es de la sección «${SECCIONES.find(n => n.indexOf(T.seccion) === 0)}».`);
  };
  if (!nuevaI) comprobar(ing, p.ingresos);
  if (!nuevaG) comprobar(gas, p.gastos);
  const usada = hojasDeActividad(ss).find(a => (ing && !nuevaI && a.ingresos === ing) || (gas && !nuevaG && a.gastos === gas));
  const nombre = (T.prefijo + titulo).slice(0, 90);
  if (ss.getSheetByName(nombre)) throw new Error(`Ya hay una hoja llamada «${nombre}».`);

  const creadas = [];
  if (nuevaI) { añadirPartida(ss, ing, titulo); creadas.push(ing); }
  if (nuevaG) { añadirPartida(ss, gas, titulo); creadas.push(gas); }
  if (creadas.length) SpreadsheetApp.flush();

  const ajustes = ss.getSheetByName(HOJAS.AJUSTES);
  const h = ss.insertSheet(nombre, ajustes ? ajustes.getIndex() - 1 : ss.getSheets().length);
  asegurarTamaño(h, 300, ACT.COLUMNAS);
  h.addDeveloperMetadata(ACT.META, T.meta);
  conFormulasEnIngles(ss, () => montarHojaDeActividad(h, titulo, ing, gas,
    datos.subpartidas ? subpartidasPorDefecto(tipo, ing, gas) : [], T.etiqueta));
  protegerHojaDeActividad(h);
  actualizarListaSubpartidas(ss);
  ss.setActiveSheet(h);
  registrar('INFO', `Hoja de ${tipo === 'financiacion' ? 'financiación' : 'actividad'} creada: ${nombre}`,
    `Ingresos ${ing || '—'} · Gastos ${gas || '—'}` + (creadas.length ? ` · Partidas nuevas: ${creadas.join(', ')}` : ''));
  return { nombre: nombre, partidasNuevas: creadas,
    aviso: usada ? `Ojo: la hoja «${usada.nombre}» ya usa alguna de estas partidas; las dos mostrarán los mismos asientos.` : '' };
}

function montarHojaDeActividad(h, titulo, ing, gas, subpartidas, etiqueta) {
  const caja = HOJAS.CAJA, P = CAJA.PRIMERA_FILA;
  const cc = nombre => `${caja}!$${letraCaja(nombre)}$${P}:$${letraCaja(nombre)}`;
  const pres = HOJAS.PRESUPUESTO, PP = PRESUPUESTO.PRIMERA_FILA;
  const AZUL = '#6075BB', TURQUESA = '#18A2B5', GRIS = '#F3F3F3';

  // Cabecera.
  h.getRange('A1:A3').setValues([[etiqueta || 'Actividad'], ['Partida de ingresos'], ['Partida de gastos']]).setFontWeight('bold');
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
 * Todo protegido (con aviso) salvo el título, las subpartidas y las
 * columnas libres.
 */
function protegerHojaDeActividad(h) {
  const p = h.protect().setDescription(PROTECCION + 'hoja de actividad (lo copiado de Caja y Presupuesto)');
  p.setUnprotectedRanges([
    h.getRange(ACT.CELDA_TITULO),
    h.getRange(ACT.PRIMERA_SUB, 1, ACT.FILAS_SUB, 3),
    h.getRange(1, ACT.PRIMERA_COLUMNA_LIBRE, h.getMaxRows(), h.getMaxColumns() - ACT.PRIMERA_COLUMNA_LIBRE + 1)
  ]);
  // De aviso, no estricta: otra persona de tesorería tiene que poder
  // trabajar con la hoja (ver «PROTECCIONES» en 00_Estructura.js).
  p.setWarningOnly(true);
}


// ==================================================================
// SUBPARTIDAS
// ==================================================================

function alEditarActividad(e) {
  const r = e.range;
  const fin = ACT.PRIMERA_SUB + ACT.FILAS_SUB - 1;
  // Código o descripción de una subpartida, o el título (sale en la lista).
  const subs = r.getColumn() <= 2 && r.getLastColumn() >= 1 && r.getLastRow() >= ACT.PRIMERA_SUB && r.getRow() <= fin;
  const titulo = r.getRow() <= 1 && r.getColumn() <= 2 && r.getLastColumn() >= 2;
  if (subs || titulo) actualizarListaSubpartidas(e.source);
}

/**
 * Reescribe la lista de subpartidas que ofrece Caja (en _Listas): primero
 * «G21A · Alojamiento (Convivencia de otoño)», para buscar por el nombre,
 * y después los códigos solos, que es lo que queda en la celda (ver
 * CAJA.SEPARADOR_OPCION).
 */
function actualizarListaSubpartidas(ss) {
  ss = ss || libro();
  const listas = ss.getSheetByName(HOJAS.LISTAS);
  if (!listas) return [];
  const subs = listaDeSubpartidas(hojasDeActividad(ss));
  const opciones = opcionesDeSubpartidas(subs);
  listas.getRange('B2:B').clearContent();
  if (opciones.length) {
    if (listas.getMaxRows() < opciones.length + 1) listas.insertRowsAfter(listas.getMaxRows(), opciones.length + 1 - listas.getMaxRows());
    listas.getRange(2, 2, opciones.length, 1).setValues(opciones.map(c => [c]));
  }
  return subs.map(s => s.codigo);
}

/** [{ codigo, descripcion, actividad }] sin repetir, por código. Pura. */
function listaDeSubpartidas(actividades) {
  const vistas = {}, subs = [];
  actividades.forEach(a => a.subpartidas.forEach(s => {
    if (vistas[s.codigo]) return;
    vistas[s.codigo] = true;
    subs.push({ codigo: s.codigo, descripcion: s.descripcion, actividad: a.titulo });
  }));
  return subs.sort((x, y) => x.codigo < y.codigo ? -1 : x.codigo > y.codigo ? 1 : 0);
}

/** Lo que ofrece el desplegable de Subpartida: con nombre y, al final, los códigos. Pura. */
function opcionesDeSubpartidas(subs) {
  const S = CAJA.SEPARADOR_OPCION;
  const nombre = s => [s.descripcion, s.actividad ? `(${s.actividad})` : ''].filter(Boolean).join(' ');
  return subs.map(s => nombre(s) ? s.codigo + S + nombre(s) : s.codigo)
    .concat(subs.filter(s => nombre(s)).map(s => s.codigo));
}

function actualizarListaSubpartidasAhora() {
  const c = actualizarListaSubpartidas(libro());
  libro().toast(
    c.length ? `${c.length} subpartidas: ${c.join(', ')}` : 'No hay subpartidas definidas.', 'Subpartidas', 6);
}
