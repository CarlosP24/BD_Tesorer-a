/*******************************************************************
 * JMV — TESORERÍA · Hoja Caja
 *
 * Lectura de Caja, ID de transacción, orden, división de asientos y
 * facturas.
 *
 * ID de transacción: AAAAMMDD-NN con la Fecha del asiento (20261015-01,
 * 20261015-02…). Se asigna una vez y NO cambia aunque luego se corrija
 * la fecha: es lo que llevan el nombre del archivo de la factura y la
 * Referencia del pago en BD Socios (TES-20261015-01), y cambiarlo
 * rompería esos dos enlaces.
 *
 * Orden: Caja va ordenada por Fecha de pago (vacía = la Fecha), porque
 * el saldo de cada fila es el acumulado de las anteriores, igual que en
 * el banco. Si una fila queda fuera de orden, su Fecha de pago se pinta
 * de naranja.
 *******************************************************************/

/** Prefijo de la Referencia de un pago de BD Socios que viene de aquí. */
const PREFIJO_REFERENCIA = 'TES-';


// ==================================================================
// LECTURA
// ==================================================================

/** Las filas con datos de Caja, como objetos (ver filaDeCaja()). */
function leerCaja(ss) {
  const h = (ss || SpreadsheetApp.getActiveSpreadsheet()).getSheetByName(HOJAS.CAJA);
  const ultima = ultimaFilaDeCaja(h);
  if (ultima < CAJA.PRIMERA_FILA) return [];
  const valores = h.getRange(CAJA.PRIMERA_FILA, 1, ultima - CAJA.PRIMERA_FILA + 1, CAJA.COLUMNAS.length).getValues();
  const filas = [];
  valores.forEach((v, i) => { if (!filaVacia(v)) filas.push(filaDeCaja(v, CAJA.PRIMERA_FILA + i)); });
  return filas;
}

/**
 * Última fila con datos. No vale getLastRow(): la fórmula del saldo
 * ocupa toda la columna, y para Sheets eso son filas "con contenido".
 */
function ultimaFilaDeCaja(h) {
  const P = CAJA.PRIMERA_FILA;
  const total = h.getMaxRows() - P + 1;
  if (total <= 0) return P - 1;
  const v = h.getRange(P, 1, total, CAJA.COLUMNAS.length).getValues();
  for (let i = v.length - 1; i >= 0; i--) if (!filaVacia(v[i])) return P + i;
  return P - 1;
}

function filaVacia(v) {
  const iSaldo = colCaja('Saldo') - 1;
  return v.every((x, j) => j === iSaldo || x === '' || x === null);
}

/** Una fila de Caja (array de valores) como objeto con nombre. */
function filaDeCaja(v, fila) {
  const g = nombre => v[colCaja(nombre) - 1];
  const texto = nombre => String(g(nombre) === null || g(nombre) === undefined ? '' : g(nombre)).trim();
  const fecha = nombre => g(nombre) instanceof Date ? g(nombre) : fechaDeTexto(g(nombre));
  const num = nombre => (g(nombre) === '' || g(nombre) === null) ? null : numeroDeTexto(g(nombre));
  const f = {
    fila: fila,
    id: texto('ID Transacción'),
    fecha: fecha('Fecha'),
    conceptoBanco: texto('Concepto Banco'),
    descripcion: texto('Descripción'),
    partida: [CAJA.TRASPASO, CAJA.EJERCICIO_ANTERIOR].find(x => x.toUpperCase() === texto('Partida').toUpperCase())
      || texto('Partida').toUpperCase(),
    subpartida: texto('Subpartida').toUpperCase(),
    idSocio: texto('ID socio').toUpperCase(),
    proveedor: texto('Proveedor'),
    cif: texto('CIF proveedor'),
    cantidad: num('Cantidad'),
    factura: texto('Factura'),
    metodo: texto('Método de pago'),
    cuentaAbono: texto('Cuenta de abono'),
    titular: texto('Titular'),
    fechaPago: fecha('Fecha de pago'),
    saldoExtracto: num('Saldo extracto'),
    bdSocios: texto('BD Socios'),
    huella: texto('Huella extracto')
  };
  f.fechaEfectiva = f.fechaPago || f.fecha;
  f.esEfectivo = f.metodo === CAJA.EFECTIVO;
  return f;
}

/**
 * Escribe filas enteras de Caja a partir de `desde`, saltándose la
 * columna Saldo: es parte de la fórmula de la cabecera, y escribir
 * cualquier cosa en ella (aunque sea vacío) la rompe con #REF!.
 */
function escribirFilasCaja(h, desde, matriz) {
  if (!matriz.length) return;
  const iSaldo = colCaja('Saldo');
  const n = CAJA.COLUMNAS.length;
  if (h.getMaxRows() < desde + matriz.length - 1) {
    h.insertRowsAfter(h.getMaxRows(), desde + matriz.length - 1 - h.getMaxRows() + 50);
  }
  h.getRange(desde, 1, matriz.length, iSaldo - 1).setValues(matriz.map(f => f.slice(0, iSaldo - 1)));
  h.getRange(desde, iSaldo + 1, matriz.length, n - iSaldo).setValues(matriz.map(f => f.slice(iSaldo)));
}

/** Una celda de Caja por nombre de columna. */
function celdaCaja(h, fila, nombre) { return h.getRange(fila, colCaja(nombre)); }

/** Fila actual de un asiento por su ID (las filas se mueven al ordenar). */
function filaDeId(h, id) {
  const ultima = ultimaFilaDeCaja(h);
  if (ultima < CAJA.PRIMERA_FILA) return -1;
  const ids = h.getRange(CAJA.PRIMERA_FILA, 1, ultima - CAJA.PRIMERA_FILA + 1, 1).getValues();
  const i = ids.findIndex(x => String(x[0]).trim() === id);
  return i < 0 ? -1 : CAJA.PRIMERA_FILA + i;
}


// ==================================================================
// ID DE TRANSACCIÓN (puro)
// ==================================================================

/** Siguiente ID libre para esa fecha. `ids` se amplía con el nuevo. */
function siguienteIdTransaccion(fecha, ids) {
  const pref = fechaCompacta(fecha) + '-';
  let max = 0;
  ids.forEach(id => {
    const t = String(id || '');
    if (t.indexOf(pref) === 0) {
      const n = parseInt(t.slice(pref.length), 10);
      if (n > max) max = n;
    }
  });
  const nuevo = pref + String(max + 1).padStart(2, '0');
  ids.push(nuevo);
  return nuevo;
}


// ==================================================================
// AL ESCRIBIR A MANO (desde onEdit)
// ==================================================================

function alEditarCaja(e) {
  const desde = Math.max(e.range.getRow(), CAJA.PRIMERA_FILA);
  const hasta = e.range.getLastRow();
  if (hasta < desde) return;
  completarFilas(e.range.getSheet(), desde, hasta);
}

/**
 * En las filas [desde, hasta] con Fecha: pone el ID si falta y, si la
 * Fecha de pago está vacía, la iguala a la Fecha («en principio se
 * asume igual»). Devuelve cuántos ID ha puesto.
 */
function completarFilas(h, desde, hasta) {
  const n = hasta - desde + 1;
  const cId = colCaja('ID Transacción'), cF = colCaja('Fecha'), cP = colCaja('Fecha de pago');
  const ids = h.getRange(desde, cId, n, 1).getValues();
  const fechas = h.getRange(desde, cF, n, 1).getValues();
  const pagos = h.getRange(desde, cP, n, 1).getValues();

  let todos = null, puestos = 0, cambiaPago = false;
  for (let i = 0; i < n; i++) {
    const f = fechas[i][0] instanceof Date ? fechas[i][0] : null;
    if (!f) continue;
    if (String(ids[i][0]).trim() === '') {
      if (!todos) {
        const ultima = Math.max(ultimaFilaDeCaja(h), hasta);
        todos = h.getRange(CAJA.PRIMERA_FILA, cId, ultima - CAJA.PRIMERA_FILA + 1, 1).getValues()
          .map(x => String(x[0]).trim()).filter(Boolean);
      }
      ids[i][0] = siguienteIdTransaccion(f, todos);
      puestos++;
    }
    if (!(pagos[i][0] instanceof Date) && String(pagos[i][0]).trim() === '') {
      pagos[i][0] = f; cambiaPago = true;
    }
  }
  if (puestos) h.getRange(desde, cId, n, 1).setValues(ids);
  if (cambiaPago) h.getRange(desde, cP, n, 1).setValues(pagos);
  return puestos;
}

function asignarIdsQueFaltan() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const h = ss.getSheetByName(HOJAS.CAJA);
  const ultima = ultimaFilaDeCaja(h);
  const puestos = ultima >= CAJA.PRIMERA_FILA ? completarFilas(h, CAJA.PRIMERA_FILA, ultima) : 0;

  const vistos = {}, repetidos = [];
  leerCaja(ss).forEach(f => {
    if (!f.id) return;
    if (vistos[f.id]) repetidos.push(f.id);
    vistos[f.id] = true;
  });
  const sinFecha = leerCaja(ss).filter(f => !f.id && !f.fecha).length;
  SpreadsheetApp.getUi().alert('ID de transacción',
    `${puestos} ID asignados.`
    + (sinFecha ? `\n\n${sinFecha} filas no tienen Fecha y por eso siguen sin ID.` : '')
    + (repetidos.length ? `\n\n⚠ ID repetidos: ${repetidos.join(', ')}. Borra el ID de una de las dos filas `
      + 'y vuelve a ejecutar esto: se le dará uno nuevo.' : ''),
    SpreadsheetApp.getUi().ButtonSet.OK);
}


// ==================================================================
// ORDENAR
// ==================================================================

/** Ordena Caja por Fecha de pago. Devuelve cuántas filas ha ordenado. */
function ordenarCaja(ss) {
  const h = ss.getSheetByName(HOJAS.CAJA);
  const P = CAJA.PRIMERA_FILA;
  const ultima = ultimaFilaDeCaja(h);
  if (ultima <= P) return Math.max(0, ultima - P + 1);
  completarFilas(h, P, ultima);

  // La ordenación de Sheets es estable: dentro del mismo día se conserva
  // el orden de la hoja, que en lo importado es el del banco. Se quita un
  // momento la fórmula del saldo para que la ordenación no la arrastre, y
  // se vuelve a poner desde el código (no copiando la que había: Sheets
  // la devuelve en el idioma de la hoja).
  const celda = h.getRange(CAJA.FILA_CABECERA, colCaja('Saldo'));
  celda.setValue('Saldo');
  try {
    h.getRange(P, 1, ultima - P + 1, CAJA.COLUMNAS.length)
      .sort({ column: colCaja('Fecha de pago'), ascending: true });
  } finally {
    conFormulasEnIngles(ss, () => celda.setFormula(formulaDeSaldo()));
  }
  return ultima - P + 1;
}

function ordenarCajaAhora() {
  const n = ordenarCaja(SpreadsheetApp.getActiveSpreadsheet());
  SpreadsheetApp.getActiveSpreadsheet().toast(`${n} filas ordenadas por fecha de pago.`, 'Caja', 5);
}


// ==================================================================
// DIVIDIR UN ASIENTO
//
// Un movimiento del banco puede ser varios asientos: una familia que
// paga la cuota de dos hijos de tramos distintos (dos partidas), una
// compra que es en parte material y en parte transporte… Las partes
// conservan la huella del extracto con un sufijo (#1, #2), así que el
// importador sigue reconociendo el movimiento y no lo vuelve a meter.
// ==================================================================

function dividirAsientoSeleccionado() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const h = ss.getActiveSheet();
  const fila = h.getActiveRange() ? h.getActiveRange().getRow() : 0;
  if (h.getName() !== HOJAS.CAJA || fila < CAJA.PRIMERA_FILA) {
    ui.alert('Selecciona antes una celda de la fila de Caja que quieres dividir.');
    return;
  }
  const n = CAJA.COLUMNAS.length;
  const v = h.getRange(fila, 1, 1, n).getValues()[0];
  const f = filaDeCaja(v, fila);
  if (f.cantidad === null || !f.fecha) { ui.alert('Esa fila no tiene Fecha y Cantidad.'); return; }

  const r = ui.prompt('Dividir el asiento ' + (f.id || ''),
    `Es de ${euros(f.cantidad)}. Escribe los importes de cada parte separados por punto y coma `
    + `(por ejemplo: 20; 30). Tienen que sumar ${euros(f.cantidad)}.`, ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const signo = f.cantidad < 0 ? -1 : 1;
  const partes = r.getResponseText().split(/;/).map(x => numeroDeTexto(x)).filter(x => x !== null)
    .map(x => signo * Math.abs(x));
  if (partes.length < 2) { ui.alert('Hacen falta al menos dos importes.'); return; }
  const suma = redondear(partes.reduce((a, b) => a + b, 0));
  if (suma !== redondear(f.cantidad)) {
    ui.alert(`Las partes suman ${euros(suma)} y el asiento es de ${euros(f.cantidad)}. No se ha cambiado nada.`);
    return;
  }

  if (!f.id) completarFilas(h, fila, fila);
  const original = h.getRange(fila, 1, 1, n).getValues()[0];
  const ultima = ultimaFilaDeCaja(h);
  const ids = h.getRange(CAJA.PRIMERA_FILA, 1, ultima - CAJA.PRIMERA_FILA + 1, 1).getValues()
    .map(x => String(x[0]).trim()).filter(Boolean);
  const base = String(original[colCaja('Huella extracto') - 1] || '').split('#')[0];
  const ix = nombre => colCaja(nombre) - 1;

  const nuevas = partes.map((importe, k) => {
    const x = original.slice();
    if (k > 0) {
      x[ix('ID Transacción')] = siguienteIdTransaccion(f.fecha, ids);
      x[ix('ID socio')] = '';
    }
    x[ix('Cantidad')] = importe;
    x[ix('Saldo')] = '';
    x[ix('BD Socios')] = '';
    // El saldo del banco es el de después del movimiento entero: va en
    // la última parte, que es donde el saldo calculado debe coincidir.
    if (k < partes.length - 1) x[ix('Saldo extracto')] = '';
    if (base) x[ix('Huella extracto')] = `${base}#${k + 1}`;
    return x;
  });

  h.insertRowsAfter(fila, partes.length - 1);
  escribirFilasCaja(h, fila, nuevas);
  registrar('INFO', `Asiento ${f.id} dividido en ${partes.length}`, partes.map(euros).join(' + '));
  ui.alert('Asiento dividido',
    `Ahora son ${partes.length} filas. Pon a cada una su partida`
    + (f.idSocio ? ', su ID de socio' : '') + ' y su descripción.'
    + (f.idSocio ? '\n\nDespués, Tesorería → Sincronizar cuotas con BD Socios.' : ''),
    ui.ButtonSet.OK);
}


// ==================================================================
// APUNTAR UN TRASPASO A MANO
//
// Las dos patas de una vez. Cuando luego llegue el extracto, la del
// banco se completa con sus datos (no se duplica) y ya tiene pareja, así
// que el importador no crea otra de efectivo.
// ==================================================================

function abrirApuntarTraspaso() {
  const hoy = new Date();
  const t = HtmlService.createTemplateFromFile('Traspaso');
  t.hoy = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
  SpreadsheetApp.getUi().showModalDialog(t.evaluate().setWidth(440).setHeight(400), 'Traspaso entre banco y efectivo');
}

/** Lo llama Traspaso.html. datos: { tipo: 'ingreso'|'retirada', fecha: 'aaaa-mm-dd', importe, descripcion }. */
function apuntarTraspaso(datos) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const h = ss.getSheetByName(HOJAS.CAJA);
  const fecha = fechaDeTexto(datos.fecha);
  const importe = redondear(Math.abs(numeroDeTexto(datos.importe) || 0));
  if (!fecha) throw new Error('Falta la fecha.');
  if (!importe) throw new Error('Falta el importe.');
  const aj = leerAjustes(ss);
  if (fecha < aj.inicio || fecha > aj.fin) throw new Error(`La fecha está fuera del ejercicio ${aj.ejercicio}.`);

  const ingreso = datos.tipo === 'ingreso';
  const texto = String(datos.descripcion || '').trim()
    || (ingreso ? 'Ingreso de efectivo en el banco' : 'Retirada de efectivo del banco');
  const ultima = ultimaFilaDeCaja(h);
  const ids = ultima >= CAJA.PRIMERA_FILA
    ? h.getRange(CAJA.PRIMERA_FILA, 1, ultima - CAJA.PRIMERA_FILA + 1, 1).getValues().map(x => String(x[0]).trim()).filter(Boolean)
    : [];
  const fila = (id, cantidad, metodo, descripcion) => {
    const v = new Array(CAJA.COLUMNAS.length).fill('');
    const poner = (nombre, valor) => { v[colCaja(nombre) - 1] = valor; };
    poner('ID Transacción', id); poner('Fecha', fecha); poner('Descripción', descripcion);
    poner('Partida', CAJA.TRASPASO); poner('Cantidad', cantidad);
    poner('Método de pago', metodo); poner('Fecha de pago', fecha);
    return v;
  };
  const idBanco = siguienteIdTransaccion(fecha, ids);
  const idEfectivo = siguienteIdTransaccion(fecha, ids);
  escribirFilasCaja(h, ultima + 1, [
    fila(idBanco, ingreso ? importe : -importe, ingreso ? 'Ingreso en cajero' : 'Retirada en cajero', texto),
    fila(idEfectivo, ingreso ? -importe : importe, CAJA.EFECTIVO, `${texto} (${idBanco})`)
  ]);
  ordenarCaja(ss);
  registrar('INFO', `Traspaso apuntado: ${idBanco} y ${idEfectivo}`, `${ingreso ? 'Ingreso en el banco' : 'Retirada del banco'} de ${euros(importe)}`);
  return `Apuntado: ${idBanco} (banco, ${euros(ingreso ? importe : -importe)}) y ${idEfectivo} (efectivo, ${euros(ingreso ? -importe : importe)}).`;
}


// ==================================================================
// CORREGIR LO QUE ES (O NO ES) UN TRASPASO
//
// El extracto no distingue un ingreso de efectivo de tesorería de el de
// una familia que ingresa su cuota en el cajero (ver «TRASPASOS» en
// 02_Extractos.js): estas dos acciones arreglan una fila mal
// clasificada en cualquiera de los dos sentidos.
// ==================================================================

/** La fila de Caja seleccionada como objeto, o null (y avisa). */
function filaSeleccionadaDeCaja() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const h = ss.getActiveSheet();
  const fila = h.getActiveRange() ? h.getActiveRange().getRow() : 0;
  if (h.getName() !== HOJAS.CAJA || fila < CAJA.PRIMERA_FILA) {
    SpreadsheetApp.getUi().alert('Selecciona antes una celda de la fila de Caja.');
    return null;
  }
  return { ss: ss, h: h, f: filaDeCaja(h.getRange(fila, 1, 1, CAJA.COLUMNAS.length).getValues()[0], fila) };
}

function deshacerTraspasoSeleccionado() {
  const sel = filaSeleccionadaDeCaja();
  if (!sel) return;
  const ss = sel.ss, h = sel.h, f = sel.f, ui = SpreadsheetApp.getUi();
  if (f.partida !== CAJA.TRASPASO) { ui.alert('Esa fila no tiene la partida Traspaso.'); return; }

  // Se queda la fila del banco; si se ha seleccionado la de efectivo, se busca su pareja.
  const par = emparejarTraspasos(leerCaja(ss)).pares.find(p => p[0].fila === f.fila || p[1].fila === f.fila);
  const banco = f.esEfectivo ? (par ? par[0] : null) : f;
  if (!banco) { ui.alert('Es una fila de efectivo sin su fila del banco. Si sobra, bórrala a mano.'); return; }
  const efectivo = par ? par[1] : null;
  const r = ui.alert('No es un traspaso',
    `${banco.id} (${euros(banco.cantidad)}) dejará de ser un traspaso` + (efectivo
      ? ` y se borrará su fila de efectivo ${efectivo.id} (${euros(efectivo.cantidad)})`
        + (efectivo.descripcion.indexOf(`(${banco.id})`) < 0 ? ', que se apuntó a mano' : '') : '')
    + '. ¿Sigo?', ui.ButtonSet.YES_NO);
  if (r !== ui.Button.YES) return;

  celdaCaja(h, banco.fila, 'Partida').setValue('');
  if (/^(Ingreso|Retirada) de efectivo/.test(banco.descripcion)) celdaCaja(h, banco.fila, 'Descripción').setValue('');
  celdaCaja(h, banco.fila, 'Concepto Banco').clearNote();

  // Si es un ingreso, seguramente es una cuota: se busca al socio.
  let texto = '';
  if (banco.cantidad > 0 && config('ID_BD_SOCIOS')) {
    try {
      const aj = leerAjustes(ss);
      const id = identificarMovimiento({ concepto: banco.conceptoBanco, importe: banco.cantidad }, prepararIdentificacion(aj));
      if (id.ids.length) {
        celdaCaja(h, banco.fila, 'ID socio').setValue(id.ids.join(', '));
        celdaCaja(h, banco.fila, 'Descripción').setValue('Cuota ' + aj.curso);
        if (id.partida) celdaCaja(h, banco.fila, 'Partida').setValue(id.partida);
        texto = `Socio identificado: ${id.ids.join(', ')}.`;
      } else texto = 'No se reconoce al socio: escribe su ID en «ID socio».';
      celdaCaja(h, banco.fila, 'ID socio').setNote(id.nota || '');
    } catch (e) { texto = 'No se ha podido leer BD Socios (' + e.message + '): escribe el ID de socio a mano.'; }
  }
  // Lo último, para que borrar no mueva la fila que se estaba editando.
  if (efectivo) h.deleteRow(efectivo.fila);
  registrar('INFO', `${banco.id} ya no es un traspaso`, efectivo ? `Borrada la fila de efectivo ${efectivo.id}` : '');
  ui.alert('Hecho', [texto, 'Después: Tesorería → Sincronizar cuotas con BD Socios.'].filter(Boolean).join('\n\n'), ui.ButtonSet.OK);
}

function convertirEnTraspasoSeleccionado() {
  const sel = filaSeleccionadaDeCaja();
  if (!sel) return;
  const ss = sel.ss, h = sel.h, f = sel.f, ui = SpreadsheetApp.getUi();
  if (f.esEfectivo) { ui.alert('Selecciona la fila del BANCO: la de efectivo se crea sola.'); return; }
  if (f.partida === CAJA.TRASPASO) { ui.alert('Esa fila ya es un traspaso.'); return; }
  if (!f.cantidad || !f.fechaEfectiva) { ui.alert('Esa fila no tiene Cantidad o Fecha.'); return; }
  const ingreso = f.cantidad > 0;
  const r = ui.alert('Convertir en traspaso',
    `${f.id} (${euros(f.cantidad)}) pasará a ser ${ingreso ? 'un ingreso de efectivo en el banco' : 'una retirada de efectivo'}: `
    + 'sin partida de ingreso o gasto' + (f.idSocio ? ` y sin socio (se quita ${f.idSocio})` : '')
    + '. Si no hay ya una fila de efectivo que le corresponda, se crea. ¿Sigo?', ui.ButtonSet.YES_NO);
  if (r !== ui.Button.YES) return;

  const texto = ingreso ? 'Ingreso de efectivo en el banco' : 'Retirada de efectivo del banco';
  celdaCaja(h, f.fila, 'Partida').setValue(CAJA.TRASPASO);
  celdaCaja(h, f.fila, 'Subpartida').setValue('');
  celdaCaja(h, f.fila, 'ID socio').setValue('').clearNote();
  celdaCaja(h, f.fila, 'Descripción').setValue(texto);
  celdaCaja(h, f.fila, 'Método de pago').setValue(ingreso ? 'Ingreso en cajero' : 'Retirada en cajero');

  const sueltas = emparejarTraspasos(leerCaja(ss)).sueltas;
  let creada = '';
  if (sueltas.some(x => x.fila === f.fila)) {
    const ultima = ultimaFilaDeCaja(h);
    const ids = h.getRange(CAJA.PRIMERA_FILA, 1, ultima - CAJA.PRIMERA_FILA + 1, 1).getValues()
      .map(x => String(x[0]).trim()).filter(Boolean);
    creada = siguienteIdTransaccion(f.fechaEfectiva, ids);
    escribirFilasCaja(h, ultima + 1, [filaDeEfectivoDelTraspaso(
      { fecha: f.fechaEfectiva, importe: f.cantidad, traspaso: { tipo: ingreso ? 'ingreso' : 'retirada' } }, f.id, creada)]);
    ordenarCaja(ss);
  }
  registrar('INFO', `${f.id} convertido en traspaso`, creada ? `Fila de efectivo ${creada}` : 'Emparejado con una fila de efectivo ya apuntada');
  ui.alert('Hecho', (creada ? `Creada la fila de efectivo ${creada}.` : 'Ya había una fila de efectivo que le corresponde: quedan emparejadas.')
    + (f.idSocio ? '\n\nDespués: Tesorería → Sincronizar cuotas con BD Socios (para deshacer el pago apuntado).' : ''), ui.ButtonSet.OK);
}


// ==================================================================
// FACTURAS
//
// Cada factura se guarda en CARPETA_FACTURAS/<ejercicio>/ con el ID del
// asiento como nombre (20261015-01.pdf), como pide la guía de la unidad
// compartida. En Caja se guarda el enlace como texto: así lo copian tal
// cual las hojas de actividad y se puede pulsar en las dos.
// ==================================================================

function abrirAdjuntarFactura() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const h = ss.getActiveSheet();
  const fila = h.getActiveRange() ? h.getActiveRange().getRow() : 0;
  if (h.getName() !== HOJAS.CAJA || fila < CAJA.PRIMERA_FILA) {
    SpreadsheetApp.getUi().alert('Selecciona antes una celda de la fila de Caja a la que pertenece la factura.');
    return;
  }
  completarFilas(h, fila, fila);
  const id = String(celdaCaja(h, fila, 'ID Transacción').getValue()).trim();
  if (!id) { SpreadsheetApp.getUi().alert('Esa fila no tiene Fecha, y sin ella no hay ID con el que nombrar la factura.'); return; }
  abrirDialogoDeSubida('factura', `Factura del asiento ${id}`,
    'PDF o foto de la factura. Se guardará en la carpeta de facturas del ejercicio con el nombre ' + id + '.',
    '.pdf,image/*', { id: id });
}

/** Lo llama recibirArchivo() (Subir.html). */
function guardarFactura(blob, contexto) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const h = ss.getSheetByName(HOJAS.CAJA);
  const id = contexto.id;
  const fila = filaDeId(h, id);
  if (fila < 0) throw new Error(`El asiento ${id} ya no está en Caja.`);

  const carpeta = carpetaDelEjercicio('CARPETA_FACTURAS', ss);
  const ext = (String(blob.getName()).match(/\.[A-Za-z0-9]{2,5}$/) || [''])[0].toLowerCase();
  let nombre = id + ext, k = 2;
  while (carpeta.getFilesByName(nombre).hasNext()) nombre = `${id} (${k++})${ext}`;
  const archivo = carpeta.createFile(blob.setName(nombre));

  const celda = celdaCaja(h, fila, 'Factura');
  const anterior = String(celda.getValue()).trim();
  celda.setValue(archivo.getUrl());
  registrar('INFO', `Factura de ${id}`, `${nombre} · ${archivo.getUrl()}`);
  return { titulo: 'Factura guardada', lineas: [
    `Guardada como ${nombre} en la carpeta ${carpeta.getName()} de facturas.`,
    anterior ? 'El asiento ya tenía un enlace a otra factura: ahora apunta a esta. La anterior sigue en la carpeta.' : ''
  ].filter(Boolean) };
}

/**
 * Para facturas subidas a mano a la carpeta: todo archivo cuyo nombre
 * empiece por un ID de Caja se enlaza en su asiento, si no tenía ya
 * factura.
 */
function vincularFacturasDeLaCarpeta() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const h = ss.getSheetByName(HOJAS.CAJA);
  const carpeta = carpetaDelEjercicio('CARPETA_FACTURAS', ss);
  const porId = {}, sueltos = [];
  const it = carpeta.getFiles();
  while (it.hasNext()) {
    const a = it.next();
    const m = a.getName().match(/^(\d{8}-\d{2,})/);
    if (!m) { sueltos.push(a.getName()); continue; }
    if (!porId[m[1]]) porId[m[1]] = a.getUrl();
  }
  let puestas = 0;
  const sinAsiento = [];
  const filas = leerCaja(ss);
  const ids = {};
  filas.forEach(f => { ids[f.id] = f; });
  Object.keys(porId).forEach(id => {
    const f = ids[id];
    if (!f) { sinAsiento.push(id); return; }
    if (f.factura) return;
    celdaCaja(h, f.fila, 'Factura').setValue(porId[id]);
    puestas++;
  });
  ui.alert('Facturas',
    `${puestas} facturas enlazadas en Caja.`
    + (sinAsiento.length ? `\n\n⚠ Archivos con un ID que no está en Caja: ${sinAsiento.join(', ')}.` : '')
    + (sueltos.length ? `\n\n⚠ Archivos cuyo nombre no empieza por un ID (no se pueden enlazar): ${sueltos.slice(0, 15).join(', ')}`
      + (sueltos.length > 15 ? '…' : '') : ''),
    ui.ButtonSet.OK);
}


// ==================================================================
// DIÁLOGO DE SUBIDA (común a extractos y facturas)
// ==================================================================

function abrirDialogoDeSubida(modo, titulo, ayuda, acepta, contexto) {
  const t = HtmlService.createTemplateFromFile('Subir');
  t.modo = modo;
  t.ayuda = ayuda;
  t.acepta = acepta;
  t.contexto = JSON.stringify(contexto || {});
  SpreadsheetApp.getUi().showModalDialog(t.evaluate().setWidth(520).setHeight(500), titulo);
}

/** Punto de entrada del diálogo Subir.html. Devuelve { titulo, lineas }. */
function recibirArchivo(datos) {
  const blob = Utilities.newBlob(Utilities.base64Decode(datos.base64), datos.tipo || 'application/octet-stream', datos.nombre);
  const contexto = JSON.parse(datos.contexto || '{}');
  if (datos.modo === 'extracto') return importarExtracto(blob, { sincronizar: datos.sincronizar !== false });
  if (datos.modo === 'factura') return guardarFactura(blob, contexto);
  throw new Error('Modo de subida desconocido: ' + datos.modo);
}
