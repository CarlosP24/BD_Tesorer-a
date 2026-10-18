/*******************************************************************
 * JMV — TESORERÍA · Importación de extractos bancarios
 *
 * Tesorería → Importar extracto bancario… abre un diálogo; se sube el
 * Excel tal cual lo da el banco (.xls, .xlsx o .csv) y:
 *
 *   1. Se convierte a filas (Drive lo convierte a Sheet temporal, que se
 *      borra en definitivo al acabar: lleva datos de familias).
 *   2. leerExtracto() (puro) encuentra la cabecera, lee cada movimiento
 *      y lo pone en orden cronológico comprobando la cadena de saldos.
 *   3. planificarImportacion() (puro) decide qué es nuevo, qué ya estaba
 *      (por su huella) y qué se había apuntado a mano antes de importar.
 *   4. En los ingresos nuevos se busca al socio (03_Socios.js).
 *   5. Se escribe en Caja, se ordena y se sincroniza con BD Socios.
 *
 * Importar dos veces el mismo extracto, o extractos que se solapan, no
 * duplica nada: cada movimiento se reconoce por su huella (fecha,
 * importe, saldo del banco tras él y concepto).
 *
 * Formato de referencia: el Excel de movimientos del Santander (hoja
 * "movimientos", cabecera "Fecha Operación | Fecha Valor | Concepto |
 * Importe | Divisa | Saldo…", el más reciente arriba). Las columnas se
 * buscan por su nombre, no por su posición.
 *******************************************************************/

/** Días de margen para reconocer un movimiento ya apuntado a mano. */
const DIAS_FUSION = 7;


// ==================================================================
// ENTRADA
// ==================================================================

function abrirImportarExtracto() {
  abrirDialogoDeSubida('extracto', 'Importar extracto bancario',
    'Sube el Excel de movimientos tal cual lo descargas del banco. Se puede importar un extracto '
    + 'que se solape con otro ya importado: lo repetido no se vuelve a meter.',
    '.xls,.xlsx,.csv', {});
}

/** Lo llama recibirArchivo() (Subir.html). Devuelve { titulo, lineas }. */
function importarExtracto(blob, opciones) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('Hay otra importación o sincronización en marcha. Prueba en un minuto.');
  try {
    return importarExtractoBloqueado(blob, opciones || {});
  } finally {
    lock.releaseLock();
  }
}

function importarExtractoBloqueado(blob, opciones) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const aj = leerAjustes(ss);
  const h = ss.getSheetByName(HOJAS.CAJA);
  const lineas = [];

  const ext = leerExtracto(filasDeArchivo(blob));
  if (!ext.movimientos.length) throw new Error('El archivo no tiene movimientos.');

  // Otra cuenta: no se importa nada. Mezclar dos cuentas en un saldo no
  // tiene arreglo después.
  const nuestra = compactar(config('IBAN_CUENTA'));
  if (nuestra && ext.cuenta && compactar(ext.cuenta) !== nuestra) {
    throw new Error(`El extracto es de la cuenta ${ext.cuenta}, no de la de Config.js (${config('IBAN_CUENTA')}). `
      + 'No se ha importado nada.');
  }

  const caja = leerCaja(ss);
  const plan = planificarImportacion(ext.movimientos, caja, aj.inicio, aj.fin);
  planificarTraspasos(plan, caja);
  const primero = ext.movimientos[0].fecha, ultimo = ext.movimientos[ext.movimientos.length - 1].fecha;
  lineas.push(`Extracto${ext.cuenta ? ' de la cuenta …' + compactar(ext.cuenta).slice(-4) : ''}`
    + ` del ${fechaCorta(primero)} al ${fechaCorta(ultimo)}: ${ext.movimientos.length} movimientos.`);
  ext.avisos.forEach(a => lineas.push('⚠ ' + a));

  // Socios: solo si BD Socios está configurado. Si no, se importa igual.
  let ident = null;
  try {
    if (config('ID_BD_SOCIOS')) ident = prepararIdentificacion(aj);
  } catch (e) {
    lineas.push('⚠ No se ha podido leer BD Socios (' + e.message + '): los socios no se identifican esta vez.');
  }

  // Filas nuevas. Un traspaso son dos: la del banco y, justo debajo, la
  // pata de efectivo (salvo que ya estuviera apuntada a mano).
  const desde = ultimaFilaDeCaja(h) + 1;
  const ids = caja.map(f => f.id).filter(Boolean);
  const nuevas = [], notasSocio = [], notasConcepto = [];
  const cuenta = { codigo: 0, nombre: 0, tutor: 0, pistas: 0, sinSocio: 0 };
  const tras = { n: 0, patas: 0, emparejados: [], cuotasSinApuntar: 0 };
  const espejos = [];   // patas de efectivo de movimientos fusionados
  plan.nuevos.forEach(m => {
    const id = siguienteIdTransaccion(m.fecha, ids);
    if (m.traspaso) {
      tras.n++;
      nuevas.push(filaNuevaDeMovimiento(m, null, id, aj));
      notasSocio.push(['']);
      notasConcepto.push([[m.aviso, notaDeTraspaso(m, ident, caja)].filter(Boolean).join('\n\n')]);
      if (/^⚠/.test(notasConcepto[notasConcepto.length - 1][0])) tras.cuotasSinApuntar++;
      if (m.traspaso.espejo) {
        nuevas.push(filaDeEfectivoDelTraspaso(m, id, siguienteIdTransaccion(m.fecha, ids)));
        notasSocio.push(['']); notasConcepto.push(['']);
        tras.patas++;
      } else tras.emparejados.push(m.traspaso.pareja);
      return;
    }
    const r = ident && m.importe > 0 ? identificarMovimiento(m, ident) : null;
    if (r && r.ids.length) cuenta[r.por] = (cuenta[r.por] || 0) + 1;
    else if (m.importe > 0) { cuenta.sinSocio++; if (r && r.pista) cuenta.pistas++; }
    notasSocio.push([r ? r.nota : '']);
    notasConcepto.push([m.aviso || '']);
    nuevas.push(filaNuevaDeMovimiento(m, r, id, aj));
  });

  // Asientos apuntados a mano que resultan ser un movimiento del extracto:
  // se completan, no se duplican. Lo que escribió una persona se respeta.
  plan.fusiones.forEach(x => {
    const fila = x.fila, m = x.m;
    const poner = (nombre, valor) => {
      const c = celdaCaja(h, fila, nombre);
      if (String(c.getValue()).trim() === '') c.setValue(valor);
    };
    poner('Concepto Banco', m.concepto);
    poner('Método de pago', metodoDeConcepto(m.concepto, m.importe));
    poner('Fecha de pago', m.fecha);
    celdaCaja(h, fila, 'Saldo extracto').setValue(m.saldo === null ? '' : m.saldo);
    celdaCaja(h, fila, 'Huella extracto').setValue(m.huella);
    if (m.traspaso) {
      tras.n++;
      poner('Partida', CAJA.TRASPASO);
      poner('Descripción', m.traspaso.tipo === 'ingreso' ? 'Ingreso de efectivo en el banco' : 'Retirada de efectivo del banco');
      if (m.traspaso.espejo) {
        espejos.push(filaDeEfectivoDelTraspaso(m, x.id || 'fila ' + fila, siguienteIdTransaccion(m.fecha, ids)));
        tras.patas++;
      } else if (m.traspaso.pareja !== 'ya') tras.emparejados.push(m.traspaso.pareja);
    }
  });
  espejos.forEach(v => { nuevas.push(v); notasSocio.push(['']); notasConcepto.push(['']); });

  if (nuevas.length) {
    escribirFilasCaja(h, desde, nuevas);
    h.getRange(desde, colCaja('ID socio'), nuevas.length, 1).setNotes(notasSocio);
    h.getRange(desde, colCaja('Concepto Banco'), nuevas.length, 1).setNotes(notasConcepto);
  }

  lineas.push(`Nuevos en Caja: ${plan.nuevos.length} del banco`
    + (tras.patas ? ` y ${tras.patas} de efectivo (la otra pata de los traspasos)` : '') + '.');
  if (tras.n) {
    lineas.push(`Traspasos entre banco y efectivo: ${tras.n}.`
      + (tras.emparejados.length ? ` Emparejados con la pata de efectivo ya apuntada a mano: ${tras.emparejados.join(', ')}.` : ''));
  }
  if (tras.cuotasSinApuntar) {
    lineas.push(`⚠ ${tras.cuotasSinApuntar} ingresos de efectivo nombran a socios cuya cuota no está apuntada en Caja. `
      + 'Apúntala en Efectivo, con su ID de socio y la fecha en que se cobró: lo dice la nota de su Concepto Banco.');
  }
  if (plan.fusiones.length) lineas.push(`Ya apuntados a mano y completados con los datos del banco: `
    + plan.fusiones.map(x => x.id || 'fila ' + x.fila).join(', ') + '.');
  if (plan.duplicados.length) lineas.push(`Ya importados antes (no se repiten): ${plan.duplicados.length}.`);
  if (plan.fuera.length) lineas.push(`Fuera del ejercicio ${aj.ejercicio} (no se importan): ${plan.fuera.length}.`);
  const dudosos = plan.nuevos.filter(m => m.aviso).length;
  if (dudosos) lineas.push(`⚠ ${dudosos} movimientos nuevos se parecen a asientos apuntados a mano: `
    + 'lo dice la nota de su Concepto Banco. Borra el que sobre.');
  if (ident) {
    const id = cuenta.codigo + cuenta.nombre + cuenta.tutor;
    if (id) lineas.push(`Cuotas identificadas: ${id} (${cuenta.codigo} por número de socio, `
      + `${cuenta.nombre} por nombre, ${cuenta.tutor} por el nombre del tutor/a).`);
    if (cuenta.sinSocio) lineas.push(`Ingresos sin socio identificado: ${cuenta.sinSocio}`
      + (cuenta.pistas ? `; ${cuenta.pistas} llevan una nota en «ID socio» con quién podría ser.` : '.'));
  }

  // Saldo inicial del banco: se propone solo si está vacío. Si ya hay uno
  // y el extracto dice otra cosa, se avisa, pero no se cambia. Puede ser
  // un saldo que ya incluye cobros y pagos del ejercicio anterior que
  // llegan ahora: la diferencia tiene que ser lo marcado «Ejercicio anterior».
  const si = saldoInicialDesdeExtracto(ext, aj.inicio);
  const celdaInicial = h.getRange('B1');
  if (si) {
    const actual = celdaInicial.getValue();
    const anterior = redondear(caja.filter(f => f.partida === CAJA.EJERCICIO_ANTERIOR && !f.esEfectivo && f.cantidad !== null)
      .reduce((t, f) => t + f.cantidad, 0));
    if (actual === '' || actual === null) {
      celdaInicial.setValue(si.saldo);
      lineas.push(`Saldo inicial del banco puesto a ${euros(si.saldo)} (${si.como}).`);
    } else if (redondear(actual) !== redondear(si.saldo + anterior)) {
      const dif = redondear(actual - si.saldo - anterior);
      lineas.push(`⚠ El saldo inicial del banco en Caja (B1) es ${euros(actual)}; según el extracto el saldo real fue `
        + `${euros(si.saldo)} (${si.como})` + (anterior ? `, y lo marcado «${CAJA.EJERCICIO_ANTERIOR}» suma ${euros(anterior)}` : '')
        + `. Faltan por explicar ${euros(dif)}. Si son cobros o pagos del ejercicio anterior que ya incluiste en el saldo `
        + `inicial, ponles la partida «${CAJA.EJERCICIO_ANTERIOR}»: este aviso desaparecerá y las filas dejarán de salir en rojo.`);
    }
  }

  // Saldo del banco según el último movimiento del archivo.
  const ultimoMov = ext.movimientos[ext.movimientos.length - 1];
  if (ultimoMov.saldo !== null) {
    h.getRange('I2').setValue(ultimoMov.saldo)
      .setNote(`Saldo del banco el ${fechaCorta(ultimoMov.fecha)}, según el extracto importado el ${fechaCorta(new Date())}.`);
  }
  escribirAjuste(ss, AJUSTES.ULTIMO_EXTRACTO,
    `${fechaCorta(primero)} – ${fechaCorta(ultimo)} (importado el ${fechaCorta(new Date())})`);

  ordenarCaja(ss);
  SpreadsheetApp.flush();

  // ¿Cuadra el saldo calculado con el del banco, fila a fila?
  const descuadres = descuadresDeSaldo(leerCaja(ss), saldosIniciales(ss));
  if (descuadres.length) {
    lineas.push(`⚠ En ${descuadres.length} filas el saldo calculado no coincide con el del banco `
      + `(en rojo en Caja; la primera, ${descuadres[0].id}). Suele ser un asiento del banco que falta `
      + 'o sobra, o un saldo inicial equivocado.');
  } else if (nuevas.length || plan.fusiones.length) {
    lineas.push('✓ El saldo calculado coincide con el del banco en todas las filas importadas.');
  }

  // Copia del original.
  try {
    const carpeta = carpetaDelEjercicio('CARPETA_EXTRACTOS', ss);
    const ext2 = (String(blob.getName()).match(/\.[A-Za-z0-9]{2,5}$/) || [''])[0];
    carpeta.createFile(blob.copyBlob().setName(`Extracto ${fechaCompacta(primero)}-${fechaCompacta(ultimo)}`
      + ` (importado ${Utilities.formatDate(new Date(), 'Europe/Madrid', 'yyyy-MM-dd HH.mm')})${ext2}`));
  } catch (e) {
    lineas.push('⚠ No se ha guardado copia del extracto: ' + e.message);
  }

  registrar('INFO', `Extracto importado: ${nuevas.length} nuevos, ${plan.fusiones.length} completados, `
    + `${plan.duplicados.length} repetidos, ${plan.fuera.length} fuera del ejercicio`, lineas.join('\n'));

  // Sincronización con BD Socios (solo si hay algo que sincronizar y no
  // se ha pedido dejarla para después, p. ej. para marcar antes lo del
  // ejercicio anterior).
  if (ident && (cuenta.codigo + cuenta.nombre + cuenta.tutor) > 0 && opciones.sincronizar === false) {
    lineas.push('No se ha sincronizado con BD Socios, como pediste. Cuando hayas revisado Caja: '
      + 'Tesorería → Sincronizar cuotas con BD Socios.');
  } else if (ident && (cuenta.codigo + cuenta.nombre + cuenta.tutor) > 0) {
    try {
      const s = sincronizarConBdSocios(ss);
      s.lineas.forEach(l => lineas.push(l));
    } catch (e) {
      lineas.push('⚠ No se ha podido sincronizar con BD Socios: ' + e.message
        + ' Prueba con Tesorería → Sincronizar cuotas con BD Socios.');
    }
  }

  return { titulo: 'Extracto importado', lineas: lineas };
}

/** La fila de Caja para un movimiento nuevo. */
function filaNuevaDeMovimiento(m, ident, id, aj) {
  const v = new Array(CAJA.COLUMNAS.length).fill('');
  const poner = (nombre, valor) => { v[colCaja(nombre) - 1] = valor; };
  poner('ID Transacción', id);
  poner('Fecha', m.fecha);
  poner('Concepto Banco', m.concepto);
  poner('Cantidad', m.importe);
  poner('Método de pago', metodoDeConcepto(m.concepto, m.importe));
  poner('Fecha de pago', m.fecha);
  poner('Saldo extracto', m.saldo === null ? '' : m.saldo);
  poner('Huella extracto', m.huella);
  if (m.traspaso) {
    poner('Partida', CAJA.TRASPASO);
    poner('Descripción', m.traspaso.tipo === 'ingreso' ? 'Ingreso de efectivo en el banco' : 'Retirada de efectivo del banco');
  } else if (ident && ident.ids.length) {
    poner('ID socio', ident.ids.join(', '));
    poner('Descripción', 'Cuota ' + aj.curso);
    if (ident.partida) poner('Partida', ident.partida);
  }
  return v;
}

/**
 * La pata de efectivo de un traspaso del banco: el mismo importe con el
 * signo contrario. No es un movimiento del banco, así que no lleva
 * Concepto Banco, saldo del extracto ni huella.
 */
function filaDeEfectivoDelTraspaso(m, idBanco, id) {
  const v = new Array(CAJA.COLUMNAS.length).fill('');
  const poner = (nombre, valor) => { v[colCaja(nombre) - 1] = valor; };
  poner('ID Transacción', id);
  poner('Fecha', m.fecha);
  poner('Descripción', (m.traspaso.tipo === 'ingreso' ? 'Efectivo ingresado en el banco' : 'Efectivo retirado del banco')
    + ` (${idBanco})`);
  poner('Partida', CAJA.TRASPASO);
  poner('Cantidad', redondear(-m.importe));
  poner('Método de pago', CAJA.EFECTIVO);
  poner('Fecha de pago', m.fecha);
  return v;
}

/**
 * Un ingreso de efectivo de la asociación cuyo concepto nombra a socios:
 * esas cuotas se cobraron en mano y tendrían que estar ya en Efectivo
 * con su ID de socio. Si no lo están, se avisa (con ⚠ delante).
 */
function notaDeTraspaso(m, ident, caja) {
  if (!ident || m.traspaso.tipo !== 'ingreso') return '';
  const r = identificarSocio(partirConcepto(m.concepto).concepto, m.importe, ident);
  if (!r.ids.length) return '';
  const apuntados = {};
  caja.forEach(f => (idsDeCelda(f.idSocio) || []).forEach(x => { apuntados[x.idSocio] = true; }));
  const faltan = r.ids.filter(id => !apuntados[id]);
  if (!faltan.length) return `Traspaso. El concepto nombra a ${r.ids.join(', ')}, con la cuota ya apuntada en Caja.`;
  return `⚠ Traspaso de efectivo cuyo concepto nombra a ${faltan.join(', ')}, sin cuota apuntada en Caja. `
    + 'Si se cobró en mano, apúntala en Efectivo con su ID de socio y la fecha del cobro. '
    + 'Si no era efectivo de la caja, sino un cobro directo, quita la partida Traspaso de esta fila, borra la de efectivo de debajo '
    + 'y pon el ID de socio aquí.';
}

/** Banco y efectivo al empezar el ejercicio (cabecera de Caja). */
function saldosIniciales(ss) {
  const h = ss.getSheetByName(HOJAS.CAJA);
  const v = h.getRange('B1:C1').getValues()[0];
  return { banco: numeroDeTexto(v[0]) || 0, efectivo: numeroDeTexto(v[1]) || 0 };
}


// ==================================================================
// DEL ARCHIVO A FILAS
// ==================================================================

function filasDeArchivo(blob) {
  const nombre = String(blob.getName() || '').toLowerCase();
  if (/\.(csv|txt)$/.test(nombre)) {
    let texto = blob.getDataAsString('UTF-8');
    if (texto.indexOf('�') !== -1) texto = blob.getDataAsString('ISO-8859-1');
    const primera = texto.split(/\r?\n/)[0];
    const sep = (primera.match(/;/g) || []).length > (primera.match(/,/g) || []).length ? ';' : ',';
    return Utilities.parseCsv(texto, sep);
  }

  // Lo que manda es el contenido, no la extensión: el Santander da un
  // .xlsx con nombre .xls. Los bytes de Apps Script van con signo.
  const b = blob.getBytes();
  let mime = null;
  if (b[0] === 0x50 && b[1] === 0x4B) mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  else if (b[0] === -48 && b[1] === -49) mime = 'application/vnd.ms-excel';   // D0 CF: .xls de verdad
  else if (b[0] === 0x3C) mime = 'text/html';   // hay bancos que dan una tabla HTML llamada .xls
  if (!mime) throw new Error('No reconozco el formato del archivo. Descárgalo del banco como Excel o CSV.');

  const recurso = { name: 'Tesorería · extracto temporal', mimeType: 'application/vnd.google-apps.spreadsheet' };
  const carpeta = config('CARPETA_EXTRACTOS');
  if (carpeta) recurso.parents = [carpeta];
  const tmp = Drive.Files.create(recurso, blob.copyBlob().setContentType(mime), { supportsAllDrives: true });
  try {
    return SpreadsheetApp.openById(tmp.id).getSheets()[0].getDataRange().getValues();
  } finally {
    // En definitivo, no a la papelera: es una copia de datos bancarios
    // en un sitio que nadie vigila.
    try { Drive.Files.remove(tmp.id, { supportsAllDrives: true }); }
    catch (e) { registrar('ERROR', 'No se ha podido borrar el extracto temporal', tmp.id + ': ' + e.message); }
  }
}


// ==================================================================
// LECTURA DEL EXTRACTO (puro)
// ==================================================================

/**
 * filas (array de arrays) → { cuenta, titular, desde, hasta, movimientos, avisos }
 * Movimientos en orden cronológico: { fecha, fechaValor, concepto, importe, saldo }.
 */
function leerExtracto(filas) {
  const norm = x => x instanceof Date ? '' : normalizarTexto(x);
  let ic = -1;
  const col = {};
  for (let i = 0; i < Math.min(filas.length, 40) && ic < 0; i++) {
    const n = filas[i].map(norm);
    const iImp = n.findIndex(x => /^IMPORTE( EUR| EUROS)?$/.test(x));
    const iCon = n.findIndex(x => /^(CONCEPTO|DESCRIPCION|MOVIMIENTO)/.test(x));
    const iFec = n.findIndex(x => /^FECHA/.test(x));
    if (iImp < 0 || iCon < 0 || iFec < 0) continue;
    ic = i;
    col.fecha = n.findIndex(x => /^FECHA (DE )?(OPERACION|OPER|CONTABLE)/.test(x));
    if (col.fecha < 0) col.fecha = iFec;
    col.valor = n.findIndex(x => /^FECHA (DE )?VALOR/.test(x));
    col.concepto = iCon;
    col.importe = iImp;
    col.saldo = n.findIndex(x => /^SALDO/.test(x));
  }
  if (ic < 0) throw new Error('No encuentro la fila de cabecera del extracto (con «Fecha», «Concepto» e «Importe»). '
    + '¿Es el Excel de movimientos de la cuenta?');

  // Lo de encima de la cabecera: titular, cuenta y fechas del extracto.
  const ext = { cuenta: '', titular: '', desde: null, hasta: null, movimientos: [], avisos: [] };
  for (let i = 0; i < ic; i++) {
    filas[i].forEach((x, j) => {
      const t = String(x instanceof Date ? '' : x).trim();
      const c = compactar(t);
      if (!ext.cuenta && /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(c)) ext.cuenta = t;
      if (norm(x) === 'TITULAR' && filas[i + 1]) ext.titular = String(filas[i + 1][j] || '').trim();
      const r = t.match(/desde\s+(\d{1,2}\/\d{1,2}\/\d{4}).*?hasta\s+(\d{1,2}\/\d{1,2}\/\d{4})/i);
      if (r) { ext.desde = fechaDeTexto(r[1]); ext.hasta = fechaDeTexto(r[2]); }
    });
  }

  let movs = [];
  filas.slice(ic + 1).forEach(f => {
    const fecha = fechaDeTexto(f[col.fecha]);
    const importe = numeroDeTexto(f[col.importe]);
    if (!fecha || importe === null) return;   // totales, líneas en blanco…
    movs.push({
      fecha: fecha,
      fechaValor: col.valor >= 0 ? fechaDeTexto(f[col.valor]) : null,
      concepto: decodificarEntidades(f[col.concepto]),
      importe: redondear(importe),
      saldo: col.saldo >= 0 && numeroDeTexto(f[col.saldo]) !== null ? redondear(numeroDeTexto(f[col.saldo])) : null
    });
  });

  // Orden cronológico. El banco pone lo más reciente arriba; dentro del
  // mismo día manda la cadena de saldos (saldo = anterior + importe).
  if (movs.length > 1) {
    const alReves = movs.slice().reverse();
    const a = eslabonesRotos(movs), b = eslabonesRotos(alReves);
    if (b < a || (b === a && movs[0].fecha > movs[movs.length - 1].fecha)) movs = alReves;
    const rotos = Math.min(a, b);
    if (rotos && movs[0].saldo !== null) {
      ext.avisos.push(`La cadena de saldos del extracto no cuadra en ${rotos} puntos: puede faltar algún `
        + 'movimiento en el archivo, o venir desordenado dentro de un mismo día.');
    }
  }
  ext.movimientos = movs;
  return ext;
}

function eslabonesRotos(movs) {
  let n = 0;
  for (let i = 1; i < movs.length; i++) {
    if (movs[i].saldo === null || movs[i - 1].saldo === null) continue;
    if (redondear(movs[i - 1].saldo + movs[i].importe) !== movs[i].saldo) n++;
  }
  return n;
}

/** "Espa&#xfffd;a" → "Espa�a". El Excel del banco lleva entidades HTML. */
function decodificarEntidades(t) {
  return String(t === null || t === undefined ? '' : t)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ').trim();
}

/** Solo letras y cifras, en mayúsculas: para comparar IBAN. */
function compactar(t) { return String(t || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

/**
 * Identifica un movimiento del banco. Fecha, importe y saldo NO bastan:
 * dos ingresos iguales el mismo día con un cargo entre medias que
 * devuelve el saldo al mismo punto dan las tres cosas iguales (pasó en
 * un extracto real). Por eso va también el concepto.
 */
function huellaDeMovimiento(m) {
  return [fechaCompacta(m.fecha), m.importe.toFixed(2), m.saldo === null ? '' : m.saldo.toFixed(2),
          normalizarTexto(m.concepto).replace(/ /g, '').slice(0, 60)].join('|');
}

/** Método de pago a partir del texto del banco (y del signo, para el cajero). */
function metodoDeConcepto(concepto, importe) {
  const t = normalizarTexto(concepto);
  if (/\bBIZUM\b/.test(t)) return 'Bizum';
  if (/REINTEGRO|RETIRADA|DISPOSICION|EXTRACCION/.test(t) || (/\bCAJERO\b/.test(t) && importe < 0)) return 'Retirada en cajero';
  if (/\bCAJERO\b|INGRESO EN EFECTIVO|INGRESO ANONIMO/.test(t)) return 'Ingreso en cajero';
  if (/TARJETA|COMPRA\b|PAGO CON TARJ|\bTPV\b/.test(t)) return 'Tarjeta';
  if (/\bRECIBO\b|ADEUDO|DOMICILI/.test(t)) return 'Domiciliación';
  if (/COMISION|MANTENIMIENTO|LIQUIDACION|INTERESES|CUOTA DE SERVICIO|GASTOS/.test(t)) return 'Cargo bancario';
  if (/TRANSFERENCIA|TRASPASO|\bTRANSF\b/.test(t)) return 'Transferencia';
  return 'Otro';
}

/**
 * Qué hacer con cada movimiento:
 * { nuevos, fusiones: [{ fila, id, m }], duplicados, fuera }
 * Cada movimiento sale con su `huella` y, si se parece a más de un
 * asiento apuntado a mano, con un `aviso`.
 */
function planificarImportacion(movs, caja, inicio, fin) {
  const huellas = {};
  caja.forEach(f => { if (f.huella) huellas[f.huella.split('#')[0]] = true; });
  // Candidatos a ser el mismo movimiento apuntado a mano antes de importar:
  // del banco (no efectivo) y sin huella todavía.
  const aMano = caja.filter(f => !f.huella && f.cantidad !== null && !f.esEfectivo && f.fechaEfectiva);
  const usadas = {};
  const plan = { nuevos: [], fusiones: [], duplicados: [], fuera: [] };

  movs.forEach(m => {
    if (m.fecha < inicio || m.fecha > fin) { plan.fuera.push(m); return; }
    m.huella = huellaDeMovimiento(m);
    if (huellas[m.huella]) { plan.duplicados.push(m); return; }
    huellas[m.huella] = true;
    const parecidos = aMano.filter(f => !usadas[f.fila] && redondear(f.cantidad) === m.importe
      && Math.abs(diasEntre(f.fechaEfectiva, m.fecha)) <= DIAS_FUSION);
    if (parecidos.length === 1) {
      usadas[parecidos[0].fila] = true;
      plan.fusiones.push({ fila: parecidos[0].fila, id: parecidos[0].id, m: m });
      return;
    }
    if (parecidos.length > 1) {
      m.aviso = 'Puede ser el mismo movimiento que '
        + parecidos.map(f => f.id || 'la fila ' + f.fila).join(' o ')
        + ', apuntados a mano. Si es así, borra la fila que sobre.';
    }
    plan.nuevos.push(m);
  });
  return plan;
}

function diasEntre(a, b) { return Math.round((b.getTime() - a.getTime()) / 86400000); }


// ==================================================================
// TRASPASOS ENTRE BANCO Y EFECTIVO (puro)
//
// Un traspaso son dos filas con la partida «Traspaso» y el mismo
// importe con signo contrario: una del banco (Ingreso o Retirada en
// cajero) y otra de efectivo. No es ingreso ni gasto.
//
// Las cuotas cobradas en mano se apuntan PRIMERO en Efectivo, con su ID
// de socio (decisión de tesorería). Cuando tesorería ingresa ese dinero
// en el banco, el ingreso es un traspaso y no un cobro.
//
// Pero el extracto NO permite distinguirlo: una familia que ingresa en
// el cajero sin identificarse aparece con la propia asociación como
// ordenante, exactamente igual que tesorería (pasó en el primer
// extracto: dos cuotas de familias salieron como traspasos). Así que:
//   - una RETIRADA de cajero es siempre traspaso;
//   - un INGRESO en cajero es un cobro, salvo que tesorería haya
//     declarado el traspaso: su pata de efectivo ya apuntada (Caja →
//     Apuntar traspaso) o la fila del banco marcada a mano Traspaso.
// ==================================================================

/** 'retirada', 'ingreso' (candidato) o '' para un movimiento del extracto. */
function tipoDeTraspaso(m) {
  const metodo = metodoDeConcepto(m.concepto, m.importe);
  if (metodo === 'Retirada en cajero' && m.importe < 0) return 'retirada';
  if (metodo === 'Ingreso en cajero' && m.importe > 0) return 'ingreso';
  return '';
}

/**
 * Empareja las patas de los traspasos de Caja: cada una del banco con
 * una de efectivo de importe contrario, la más cercana en fecha (como
 * mucho DIAS_FUSION días). { pares: [[banco, efectivo]], sueltas: [fila] }
 */
function emparejarTraspasos(filas) {
  const t = filas.filter(f => f.partida === CAJA.TRASPASO && f.cantidad !== null && f.fechaEfectiva);
  const efectivo = t.filter(f => f.esEfectivo);
  const usadas = {}, pares = [], sueltas = [];
  t.filter(f => !f.esEfectivo).forEach(b => {
    const cand = efectivo.filter(e => !usadas[e.fila] && redondear(e.cantidad) === redondear(-b.cantidad)
        && Math.abs(diasEntre(b.fechaEfectiva, e.fechaEfectiva)) <= DIAS_FUSION)
      .sort((x, y) => Math.abs(diasEntre(b.fechaEfectiva, x.fechaEfectiva)) - Math.abs(diasEntre(b.fechaEfectiva, y.fechaEfectiva)));
    if (cand.length) { usadas[cand[0].fila] = true; pares.push([b, cand[0]]); }
    else sueltas.push(b);
  });
  efectivo.forEach(e => { if (!usadas[e.fila]) sueltas.push(e); });
  return { pares: pares, sueltas: sueltas };
}

/**
 * Marca en el plan de importación los movimientos que son traspasos:
 * m.traspaso = { tipo, espejo, pareja }. `espejo` = hay que crear la pata
 * de efectivo; si ya estaba apuntada a mano, `pareja` dice cuál es.
 */
function planificarTraspasos(plan, caja) {
  const emp = emparejarTraspasos(caja);
  const conPareja = {};
  emp.pares.forEach(p => { conPareja[p[0].fila] = true; });
  const libres = emp.sueltas.filter(f => f.esEfectivo);
  const porFila = {};
  caja.forEach(f => { porFila[f.fila] = f; });

  const decidir = (m, filaFusion) => {
    const tipo = tipoDeTraspaso(m);
    if (!tipo) return null;
    let declarado = tipo === 'retirada';
    if (filaFusion) {
      const f = porFila[filaFusion];
      // Lo apuntado a mano con otra partida se respeta: alguien decidió
      // que no era un traspaso.
      if (f.partida && f.partida !== CAJA.TRASPASO) return null;
      if (f.partida === CAJA.TRASPASO) declarado = true;
      if (conPareja[filaFusion]) return { tipo: tipo, espejo: false, pareja: 'ya' };
    }
    const i = libres.findIndex(e => redondear(e.cantidad) === redondear(-m.importe)
      && Math.abs(diasEntre(e.fechaEfectiva, m.fecha)) <= DIAS_FUSION);
    if (i >= 0) {
      const e = libres.splice(i, 1)[0];
      return { tipo: tipo, espejo: false, pareja: e.id || 'fila ' + e.fila };
    }
    // Un ingreso en cajero que tesorería no ha declarado es un cobro (de
    // una familia que ingresa en cajero): ver la cabecera de esta sección.
    return declarado ? { tipo: tipo, espejo: true } : null;
  };
  plan.nuevos.forEach(m => { m.traspaso = decidir(m, 0); });
  plan.fusiones.forEach(x => { x.m.traspaso = decidir(x.m, x.fila); });
  return plan;
}

/**
 * Saldo del banco al empezar el ejercicio, si el extracto permite
 * saberlo: { saldo, como } o null.
 */
function saldoInicialDesdeExtracto(ext, inicio) {
  const conSaldo = ext.movimientos.filter(m => m.saldo !== null);
  const antes = conSaldo.filter(m => m.fecha < inicio);
  if (antes.length) {
    const m = antes[antes.length - 1];
    return { saldo: m.saldo, como: `saldo tras el último movimiento anterior, del ${fechaCorta(m.fecha)}` };
  }
  const dentro = conSaldo.filter(m => m.fecha >= inicio);
  if (dentro.length && ext.desde && ext.desde <= inicio) {
    return { saldo: redondear(dentro[0].saldo - dentro[0].importe), como: 'saldo antes del primer movimiento del ejercicio' };
  }
  return null;
}

/**
 * Saldo de cada fila (en el orden de Caja) comparado con el del banco.
 * Devuelve las filas donde no coinciden: [{ id, fila, fecha, calculado, banco }].
 *
 * Lo de «Ejercicio anterior» ya está en el saldo inicial y no mueve el
 * de Caja; el banco, en cambio, no lo tiene hasta que llega. Por eso,
 * para comparar, al saldo de Caja se le resta lo de «Ejercicio anterior»
 * que todavía no ha llegado. Hay que pasar TODAS las filas de Caja.
 */
function descuadresDeSaldo(filas, iniciales) {
  const anterior = f => f.partida === CAJA.EJERCICIO_ANTERIOR && !f.esEfectivo && f.cantidad !== null;
  let pendiente = redondear(filas.filter(anterior).reduce((t, f) => t + f.cantidad, 0));
  let banco = iniciales.banco, efectivo = iniciales.efectivo;
  const mal = [];
  filas.forEach(f => {
    if (f.cantidad === null) return;
    if (anterior(f)) pendiente = redondear(pendiente - f.cantidad);
    else if (f.partida === CAJA.EJERCICIO_ANTERIOR) { /* efectivo: no se compara con nada */ }
    else if (f.esEfectivo) efectivo = redondear(efectivo + f.cantidad);
    else banco = redondear(banco + f.cantidad);
    const propio = f.esEfectivo ? efectivo : redondear(banco - pendiente);
    if (f.saldoExtracto !== null && redondear(f.saldoExtracto) !== propio) {
      mal.push({ id: f.id, fila: f.fila, fecha: f.fechaEfectiva, calculado: propio, banco: f.saldoExtracto });
    }
  });
  return mal;
}
