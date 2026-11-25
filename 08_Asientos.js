/*******************************************************************
 * JMV — TESORERÍA · Ventana de asientos (Asientos.html)
 *
 * Una sola ventana, al estilo de la ficha de socio de BD Socios: a la
 * izquierda las secciones y sus listas, a la derecha el formulario. Cada
 * opción del menú la abre en su sección:
 *
 *   ⇄ Traspaso            ingresar efectivo en el banco o sacarlo
 *                         (apuntarTraspaso(), 01_Caja.js).
 *   Nuevo gasto por       se apunta ANTES de ordenarla en el banco, con
 *   transferencia         todos sus datos y, si ya está, la factura. Queda
 *                         con Fecha de pago = «Pendiente» (CAJA.PENDIENTE)
 *                         y un asunto que empieza por su ID. La ventana da
 *                         lo que hay que copiar en la app del banco. Cuando
 *                         llega el extracto, el importador la reconoce por
 *                         ese ID (planificarImportacion()) y le pone la
 *                         fecha del banco: ya está pagada.
 *   Pendientes            las transferencias que aún no han salido.
 *   Por completar         gastos del banco sin partida: sobre todo los de
 *                         tarjeta, que solo aparecen al importar.
 *   Facturas que faltan   todo gasto sin factura (salvo traspasos, cargos
 *                         del banco y lo del ejercicio anterior).
 *   Efectivo              cuotas cobradas en mano (una fila por socio, y
 *                         se sincroniza con BD Socios), otros ingresos y
 *                         gastos en efectivo.
 *
 * Como en BD Socios (§3.10 de su guía), al abrirse la ventana hace UNA
 * llamada que lo trae todo (datosDeAsientos()); después de guardar,
 * vuelve a pedirlo en segundo plano.
 *
 * Nada de esto usa conFormulasEnIngles(): cambiar el idioma de la hoja
 * recarga la página y la ventana perdería la conexión (CLAUDE.md §5).
 * Solo escribe valores.
 *
 * Lo que decide (validar, qué falta, qué se puede cambiar) es puro y
 * está probado en pruebasTesoreria().
 *******************************************************************/

const ASIENTOS = {
  ARCHIVO_HTML: 'Asientos',
  ANCHO: 1150, ALTO: 760,
  SECCIONES: ['traspaso', 'transferencia', 'pendientes', 'completar', 'facturas', 'efectivo'],
  // El concepto de una transferencia SEPA admite 140 caracteres.
  ASUNTO_MAX: 140,
  // Lo que la ventana puede cambiar de un asiento que ya existe (campo de
  // filaDeCaja() → columna). Lo que viene del banco (fecha, importe,
  // concepto, método) no se toca desde aquí.
  EDITABLES: { descripcion: 'Descripción', partida: 'Partida', subpartida: 'Subpartida',
               proveedor: 'Proveedor', cif: 'CIF proveedor', sinFactura: 'Factura' },
  // Y además, en una transferencia pendiente, que aún no ha llegado al banco:
  EDITABLES_PENDIENTE: { fecha: 'Fecha', importe: 'Cantidad', cuentaAbono: 'Cuenta de abono',
                         titular: 'Titular', asunto: 'Asunto transferencia' }
};


// ==================================================================
// ABRIR
// ==================================================================

function abrirNuevaTransferencia() { abrirAsientos('transferencia'); }
function abrirMovimientosPorCompletar() { abrirAsientos('completar'); }
function abrirFacturasQueFaltan() { abrirAsientos('facturas'); }
function abrirEfectivo() { abrirAsientos('efectivo'); }
function abrirTransferenciasPendientes() { abrirAsientos('pendientes'); }

/**
 * Abre la ventana en una sección. Si hay una fila de Caja seleccionada y
 * está en la lista de esa sección, se abre directamente en ella.
 */
function abrirAsientos(seccion) {
  let inicial = '';
  try {
    const h = SpreadsheetApp.getActiveSheet();
    const fila = h.getActiveRange().getRow();
    if (h.getName() === HOJAS.CAJA && fila >= CAJA.PRIMERA_FILA) {
      inicial = String(celdaCaja(h, fila, 'ID Transacción').getValue()).trim();
    }
  } catch (e) { inicial = ''; }
  const t = HtmlService.createTemplateFromFile(ASIENTOS.ARCHIVO_HTML);
  // Desde el menú Apps Script puede pasar un objeto de evento: solo vale el texto.
  t.seccion = ASIENTOS.SECCIONES.indexOf(seccion) >= 0 ? seccion : 'transferencia';
  t.inicial = /^\d{8}-\d{2,}$/.test(inicial) ? inicial : '';
  SpreadsheetApp.getUi().showModalDialog(
    t.evaluate().setWidth(ASIENTOS.ANCHO).setHeight(ASIENTOS.ALTO), 'Tesorería · asientos');
}

/** Todo lo que la ventana necesita, de una vez. Solo datos simples (sin Date). */
function datosDeAsientos() {
  const ss = libro();
  registrarPrograma(ss);
  const aj = leerAjustes(ss);
  return contextoDeVentana(leerCaja(ss), leerPartidas(ss), listaDeSubpartidas(hojasDeActividad(ss)),
    aj, saldosIniciales(ss), new Date(),
    { facturas: !!config('CARPETA_FACTURAS'), bdSocios: !!config('ID_BD_SOCIOS') });
}

/**
 * Los socios del curso, para apuntar cuotas cobradas en mano. Va aparte
 * porque abrir BD Socios tarda: la ventana lo pide solo al elegir
 * «Cuotas cobradas en mano».
 */
function sociosParaEfectivo() {
  const aj = leerAjustes();
  return prepararIdentificacion(aj).candidatos.map(c => ({
    id: c.id, nombre: `${c.nombre} ${c.apellidos}`.trim(), apellidos: c.apellidos, tramo: c.tramo,
    cuota: c.cuota, partida: aj.tramos[c.tramo] || '', pagada: c.pagada
  })).sort((a, b) => (a.apellidos + a.nombre).localeCompare(b.apellidos + b.nombre, 'es'));
}


// ==================================================================
// GUARDAR (los llama Asientos.html)
// ==================================================================

/**
 * Un gasto nuevo por transferencia, pendiente de ordenar en el banco.
 * datos: { fecha, importe, proveedor, cif, cuentaAbono, titular, partida,
 * subpartida, descripcion, asunto, sinFactura?, archivo? }. archivo: { nombre, tipo, base64 }.
 * sinFactura: textoSinFactura() si el gasto no lleva factura (entonces no se sube archivo).
 */
function guardarTransferencia(datos) {
  return conLockDeCaja(() => {
    const ss = libro();
    const h = ss.getSheetByName(HOJAS.CAJA);
    const filas = leerCaja(ss);
    const ctx = contextoDeValidacion(ss, filas);
    const plan = planDeTransferencia(datos, ctx);
    if (plan.errores.length) throw new Error(plan.errores.join(' '));

    const id = siguienteIdTransaccion(plan.valores['Fecha'], filas.map(f => f.id).filter(Boolean));
    plan.valores['ID Transacción'] = id;
    plan.valores['Asunto transferencia'] = asuntoDeTransferencia(id, plan.textoAsunto);
    const fila = ultimaFilaDeCaja(h) + 1;
    escribirFilasCaja(h, fila, [filaNuevaDeCaja(plan.valores)]);
    registrar('INFO', `Transferencia pendiente apuntada: ${id}`,
      `${euros(plan.valores['Cantidad'])} a ${plan.valores['Proveedor']} · ${plan.valores['Partida']}`);

    const lineas = plan.avisos.map(x => '⚠ ' + x).concat(plan.valores['Factura'] ? [] : facturaDeVentana(datos.archivo, id));
    return { asiento: asientoParaVentana(releerFila(h, id)), lineas: lineas };
  });
}

/**
 * Ingreso o gasto en efectivo. datos.tipo:
 *   'cuotas'  { fecha, cuotas: [{ idSocio, importe, partida }] } → una fila por socio
 *   'ingreso' { fecha, importe, partida, subpartida, descripcion }
 *   'gasto'   { fecha, importe, partida, subpartida, descripcion, proveedor, cif, sinFactura?, archivo? }
 */
function guardarEfectivo(datos) {
  return conLockDeCaja(() => {
    const ss = libro();
    const h = ss.getSheetByName(HOJAS.CAJA);
    const filas = leerCaja(ss);
    const ctx = contextoDeValidacion(ss, filas);
    const plan = planDeEfectivo(datos, ctx);
    if (plan.errores.length) throw new Error(plan.errores.join(' '));

    const ids = filas.map(f => f.id).filter(Boolean);
    const nuevos = plan.filas.map(v => {
      v['ID Transacción'] = siguienteIdTransaccion(v['Fecha'], ids);
      return v;
    });
    escribirFilasCaja(h, ultimaFilaDeCaja(h) + 1, nuevos.map(filaNuevaDeCaja));
    ordenarCaja(ss);
    const lista = nuevos.map(v => v['ID Transacción']);
    registrar('INFO', `Efectivo apuntado (${datos.tipo}): ${lista.join(', ')}`,
      nuevos.map(v => `${v['ID Transacción']} ${euros(v['Cantidad'])} ${v['ID socio'] || v['Partida']}`).join('\n'));

    const lineas = [nuevos.length === 1 ? `Apuntado: ${lista[0]} (${euros(nuevos[0]['Cantidad'])}).`
      : `Apuntados ${nuevos.length} asientos: ${lista.join(', ')}.`];
    plan.avisos.forEach(x => lineas.push('⚠ ' + x));
    if (datos.tipo === 'gasto' && !nuevos[0]['Factura']) facturaDeVentana(datos.archivo, lista[0]).forEach(l => lineas.push(l));
    if (datos.tipo === 'cuotas' && config('ID_BD_SOCIOS')) {
      try { sincronizarConBdSocios(ss).lineas.forEach(l => lineas.push(l)); }
      catch (e) { lineas.push('⚠ No se ha podido sincronizar con BD Socios: ' + e.message
        + ' Prueba luego con Tesorería → Sincronizar cuotas con BD Socios.'); }
    }
    return { ids: lista, lineas: lineas };
  });
}

/**
 * Cambios en un asiento que ya existe (completar un movimiento del banco,
 * corregir una transferencia pendiente) y/o su factura.
 * datos: { id, cambios: { campo: { antes, despues } }, archivo? }.
 * Si algo de lo que se cambia ya no vale lo que la ventana vio al
 * abrirse, no se guarda nada.
 */
function guardarCambiosDeAsiento(datos) {
  return conLockDeCaja(() => {
    const ss = libro();
    const h = ss.getSheetByName(HOJAS.CAJA);
    const filas = leerCaja(ss);
    const f = filas.find(x => x.id === datos.id);
    if (!f) throw new Error(`El asiento ${datos.id} ya no está en Caja.`);
    const plan = planDeCambios(f, datos.cambios || {}, contextoDeValidacion(ss, filas));
    if (plan.conflictos.length) {
      throw new Error(`Mientras tanto ha cambiado en la hoja: ${plan.conflictos.join(', ')}. `
        + 'No se ha guardado nada. Pulsa «Recargar» y vuelve a hacerlo.');
    }
    if (plan.errores.length) throw new Error(plan.errores.join(' '));

    Object.keys(plan.escribir).forEach(col => celdaCaja(h, f.fila, col).setValue(plan.escribir[col]));
    const cambiadas = Object.keys(plan.escribir);
    if (cambiadas.length) registrar('INFO', `Asiento ${f.id} cambiado desde la ventana`,
      cambiadas.map(c => `${c}: ${plan.escribir[c] instanceof Date ? fechaCorta(plan.escribir[c]) : plan.escribir[c]}`).join(' · '));

    const lineas = (cambiadas.length ? ['Guardado.'] : []).concat(plan.avisos.map(x => '⚠ ' + x),
      plan.escribir['Factura'] ? [] : facturaDeVentana(datos.archivo, f.id));
    if (!lineas.length) lineas.push('No había nada que cambiar.');
    return { asiento: asientoParaVentana(releerFila(h, f.id)), lineas: lineas };
  });
}

/** Borra una transferencia pendiente que no se va a hacer. */
function anularTransferenciaPendiente(id) {
  return conLockDeCaja(() => {
    const ss = libro();
    const h = ss.getSheetByName(HOJAS.CAJA);
    const f = leerCaja(ss).find(x => x.id === id);
    if (!f) throw new Error(`El asiento ${id} ya no está en Caja.`);
    if (!f.pendiente || f.huella) throw new Error(`${id} ya no es una transferencia pendiente: no se borra.`);
    h.deleteRow(f.fila);
    registrar('INFO', `Transferencia pendiente ${id} anulada`,
      `${euros(f.cantidad)} a ${f.proveedor}` + (f.factura ? ` · su factura sigue en la carpeta: ${f.factura}` : ''));
    return { lineas: [`Borrado el asiento ${id}.`]
      .concat(f.factura ? ['Su factura sigue en la carpeta de facturas, con el nombre ' + id + '.'] : []) };
  });
}


// ==================================================================
// AYUDANTES CON SHEETS / DRIVE
// ==================================================================

function conLockDeCaja(fn) {
  const lock = bloqueo();
  if (!lock.tryLock(30000)) throw new Error('Hay otra importación o sincronización en marcha. Prueba en un minuto.');
  try { return fn(); }
  finally { lock.releaseLock(); }
}

function releerFila(h, id) {
  const fila = filaDeId(h, id);
  if (fila < 0) throw new Error(`El asiento ${id} ya no está en Caja.`);
  return filaDeCaja(h.getRange(fila, 1, 1, CAJA.COLUMNAS.length).getValues()[0], fila);
}

/** Lo que hace falta para validar lo que llega de la ventana. */
function contextoDeValidacion(ss, filas) {
  return ctxDeValidacion(filas, leerPartidas(ss), listaDeSubpartidas(hojasDeActividad(ss)), leerAjustes(ss), saldosIniciales(ss));
}

/** Sube la factura que trae la ventana, si trae. Devuelve líneas para el resultado. */
function facturaDeVentana(archivo, id) {
  if (!archivo || !archivo.base64) return [];
  try {
    const blob = Utilities.newBlob(Utilities.base64Decode(archivo.base64), archivo.tipo || 'application/octet-stream', archivo.nombre);
    return guardarFactura(blob, { id: id }).lineas;
  } catch (e) {
    return [`⚠ El asiento está guardado, pero la factura no: ${e.message} Vuelve a subirla desde «Facturas que faltan».`];
  }
}


// ==================================================================
// LÓGICA (pura)
// ==================================================================

/** Lo que recibe la ventana. `config`: { facturas, bdSocios } (si están configuradas en Ajustes). */
function contextoDeVentana(filas, partidas, subpartidas, aj, iniciales, hoy, conf) {
  const sociosEnCaja = {};
  filas.forEach(f => (idsDeCelda(f.idSocio) || []).forEach(x => {
    (sociosEnCaja[x.idSocio] = sociosEnCaja[x.idSocio] || []).push(f.id || 'fila ' + f.fila);
  }));
  const clase = f => clasificarAsiento(f);
  return {
    hoy: isoDeFecha(hoy), ejercicio: aj.ejercicio, inicio: isoDeFecha(aj.inicio), fin: isoDeFecha(aj.fin), curso: aj.curso,
    saldos: saldosALaFecha(filas, iniciales, new Date(2999, 0, 1)),
    partidas: {
      ingresos: partidas.ingresos.map(p => ({ codigo: p.codigo, descripcion: p.descripcion })),
      gastos: partidas.gastos.map(p => ({ codigo: p.codigo, descripcion: p.descripcion }))
    },
    subpartidas: subpartidas,
    proveedores: proveedoresConocidos(filas),
    ids: filas.map(f => f.id).filter(Boolean),
    asientos: filas.filter(f => { const c = clase(f); return c.pendiente || c.completar || c.factura; }).map(asientoParaVentana),
    traspasosSueltos: emparejarTraspasos(filas).sueltas.map(asientoParaVentana),
    sociosEnCaja: sociosEnCaja,
    // Para apuntar cuotas en mano sin base de socios: la partida de cada tramo.
    tramos: Object.keys(aj.tramos || {}).map(t => ({ tramo: t, partida: aj.tramos[t] })),
    asuntoMax: ASIENTOS.ASUNTO_MAX, separador: CAJA.SEPARADOR_OPCION,
    ejercicioAnterior: CAJA.EJERCICIO_ANTERIOR,
    // Motivos para marcar un gasto que no lleva factura: { valor (lo que va en la celda), motivo }.
    sinFactura: CAJA.MOTIVOS_SIN_FACTURA.map(m => ({ valor: textoSinFactura(m), motivo: m })),
    config: conf || {}
  };
}

/**
 * En qué listas de la ventana está un asiento:
 *   pendiente  transferencia ordenada que aún no ha salido;
 *   completar  gasto del banco sin partida (tarjeta, domiciliación…);
 *   factura    gasto que debería tener factura y no la tiene.
 */
function clasificarAsiento(f) {
  const gasto = f.cantidad !== null && f.cantidad < 0;
  const cuenta = f.partida !== CAJA.TRASPASO && f.partida !== CAJA.EJERCICIO_ANTERIOR;
  return {
    pendiente: !!f.pendiente,
    completar: gasto && !f.esEfectivo && !f.pendiente && !f.partida,
    factura: gasto && cuenta && !f.factura && f.metodo !== 'Cargo bancario'
  };
}

function asientoParaVentana(f) {
  const c = clasificarAsiento(f);
  return {
    id: f.id, fila: f.fila, fecha: isoDeFecha(f.fecha), fechaPago: isoDeFecha(f.fechaPago), pendiente: c.pendiente,
    concepto: f.conceptoBanco, descripcion: f.descripcion, partida: f.partida, subpartida: f.subpartida,
    idSocio: f.idSocio, proveedor: f.proveedor, cif: f.cif, cantidad: f.cantidad,
    factura: noRequiereFactura(f.factura) ? '' : f.factura, sinFactura: noRequiereFactura(f.factura) ? f.factura : '',
    metodo: f.metodo, cuentaAbono: f.cuentaAbono, titular: f.titular, asunto: f.asunto,
    delBanco: !!f.huella, efectivo: !!f.esEfectivo, completar: c.completar, faltaFactura: c.factura
  };
}

/** Lo que la ventana enseña de un campo editable (para detectar cambios hechos en la hoja). */
function valorParaVentana(f, campo) {
  if (campo === 'fecha') return isoDeFecha(f.fecha);
  if (campo === 'importe') return f.cantidad;
  if (campo === 'sinFactura') return noRequiereFactura(f.factura) ? f.factura : '';
  return f[campo] === undefined || f[campo] === null ? '' : f[campo];
}

function mismoValor(a, b) {
  const n = x => (x === null || x === undefined) ? '' : (typeof x === 'number' ? String(redondear(x)) : String(x).trim());
  return n(a) === n(b);
}

/** Proveedores ya usados en Caja, con sus últimos CIF, cuenta y titular. */
function proveedoresConocidos(filas) {
  const por = {};
  filas.forEach(f => {
    if (!f.proveedor) return;
    const k = normalizarTexto(f.proveedor);
    const p = por[k] || (por[k] = { nombre: '', cif: '', cuentaAbono: '', titular: '' });
    p.nombre = f.proveedor;
    if (f.cif) p.cif = f.cif;
    if (f.cuentaAbono) p.cuentaAbono = f.cuentaAbono;
    if (f.titular) p.titular = f.titular;
  });
  return Object.keys(por).map(k => por[k]).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

/** Lo que hace falta para validar: partidas, subpartidas, fechas del ejercicio, saldo de efectivo. */
function ctxDeValidacion(filas, partidas, subpartidas, aj, iniciales) {
  const p = {};
  partidas.ingresos.forEach(x => { p[x.codigo] = { lado: 'I', descripcion: x.descripcion }; });
  partidas.gastos.forEach(x => { p[x.codigo] = { lado: 'G', descripcion: x.descripcion }; });
  const s = {};
  subpartidas.forEach(x => { s[x.codigo] = true; });
  const enCaja = {};
  filas.forEach(f => (idsDeCelda(f.idSocio) || []).forEach(x => { enCaja[x.idSocio] = (enCaja[x.idSocio] || []).concat([f.id]); }));
  return { partidas: p, subpartidas: s, inicio: aj.inicio, fin: aj.fin, curso: aj.curso,
    saldos: saldosALaFecha(filas, iniciales, new Date(2999, 0, 1)), sociosEnCaja: enCaja };
}

/**
 * Normaliza un campo que llega de la ventana. Devuelve { valor, error, aviso }.
 * extra: { partida, signo, id } según haga falta.
 */
function normalizarCampo(campo, valor, ctx, extra) {
  const t = String(valor === null || valor === undefined ? '' : valor).trim();
  extra = extra || {};
  switch (campo) {
    case 'descripcion': case 'proveedor': case 'titular':
      return { valor: t.replace(/\s+/g, ' ').slice(0, 250) };
    case 'partida': {
      const k = String(codigoDeOpcion(t)).trim().toUpperCase();
      if (!k) return { valor: '' };
      if (k === CAJA.EJERCICIO_ANTERIOR.toUpperCase()) return { valor: CAJA.EJERCICIO_ANTERIOR };
      if (!ctx.partidas[k]) return { valor: k, error: `La partida ${k} no está en el Presupuesto.` };
      const lado = ctx.partidas[k].lado;
      if (extra.signo && ((extra.signo < 0 && lado === 'I') || (extra.signo > 0 && lado === 'G'))) {
        return { valor: k, aviso: `${k} es una partida de ${lado === 'I' ? 'ingresos' : 'gastos'} y el asiento es un `
          + `${extra.signo < 0 ? 'gasto' : 'ingreso'}: solo está bien si es una devolución.` };
      }
      return { valor: k };
    }
    case 'subpartida': {
      const k = String(codigoDeOpcion(t)).trim().toUpperCase();
      if (!k) return { valor: '' };
      if (!ctx.subpartidas[k]) return { valor: k, error: `La subpartida ${k} no está en ninguna hoja de actividad.` };
      if (!extra.partida || k.indexOf(extra.partida) !== 0) return { valor: k, error: `La subpartida ${k} no es de la partida ${extra.partida || '(ninguna)'}.` };
      return { valor: k };
    }
    case 'cif': {
      const k = compactar(t);
      return { valor: k, aviso: documentoFiscalValido(k) === false ? `El CIF/NIF ${k} no parece correcto (la letra o el dígito de control no cuadran).` : '' };
    }
    case 'cuentaAbono': {
      if (!t) return { valor: '' };
      if (!ibanValido(t)) return { valor: t, error: `El IBAN ${t} no es válido: revisa que esté completo y sin erratas.` };
      return { valor: formatoIban(t) };
    }
    case 'asunto':
      return { valor: asuntoDeTransferencia(extra.id, t) };
    case 'sinFactura': {
      if (!t) return { valor: '' };
      if (!noRequiereFactura(t)) return { valor: t, error: `«${t}» no es un motivo para no llevar factura.` };
      const motivo = CAJA.MOTIVOS_SIN_FACTURA.find(m => normalizarTexto(t) === normalizarTexto(textoSinFactura(m)));
      return { valor: motivo ? textoSinFactura(motivo) : t.replace(/\s+/g, ' ').slice(0, 250) };
    }
    case 'fecha': {
      const d = fechaDeTexto(t);
      if (!d) return { valor: null, error: 'Falta la fecha.' };
      if (d < ctx.inicio || d > ctx.fin) return { valor: d, error: `La fecha ${fechaCorta(d)} está fuera del ejercicio.` };
      return { valor: d };
    }
    case 'importe': {
      const n = redondear(Math.abs(numeroDeTexto(t) || 0));
      if (!n) return { valor: null, error: 'Falta el importe.' };
      return { valor: (extra.signo || 1) < 0 ? -n : n };
    }
  }
  return { valor: t, error: `Campo desconocido: ${campo}.` };
}

/** Un gasto por transferencia, pendiente. { errores, avisos, valores: {columna: valor}, textoAsunto }. */
function planDeTransferencia(d, ctx) {
  const r = { errores: [], avisos: [], valores: {}, textoAsunto: '' };
  const campo = (nombre, extra) => {
    const n = normalizarCampo(nombre, d[nombre], ctx, extra);
    if (n.error) r.errores.push(n.error);
    if (n.aviso) r.avisos.push(n.aviso);
    return n.valor;
  };
  const partida = campo('partida', { signo: -1 });
  const v = {
    'Fecha': campo('fecha'),
    'Cantidad': campo('importe', { signo: -1 }),
    'Proveedor': campo('proveedor'),
    'CIF proveedor': campo('cif'),
    'Cuenta de abono': campo('cuentaAbono'),
    'Titular': campo('titular'),
    'Partida': partida,
    'Subpartida': campo('subpartida', { partida: partida }),
    'Descripción': campo('descripcion'),
    'Método de pago': 'Transferencia',
    'Fecha de pago': CAJA.PENDIENTE,
    'Factura': campo('sinFactura')
  };
  if (!v['Proveedor']) r.errores.push('Falta el proveedor (a quién se paga).');
  if (!v['Cuenta de abono']) r.errores.push('Falta el IBAN de destino.');
  if (!partida) r.errores.push('Falta la partida.');
  if (partida === CAJA.EJERCICIO_ANTERIOR) r.errores.push(`Un gasto nuevo no puede ser «${CAJA.EJERCICIO_ANTERIOR}».`);
  if (!v['Descripción']) r.errores.push('Falta la descripción (es lo que sale en los informes).');
  if (!v['Titular']) v['Titular'] = v['Proveedor'];
  r.textoAsunto = textoParaBanco(d.asunto) || textoParaBanco(v['Descripción']);
  r.valores = v;
  return r;
}

/** Ingreso o gasto en efectivo (ver guardarEfectivo()). { errores, avisos, filas: [{columna: valor}] }. */
function planDeEfectivo(d, ctx) {
  const r = { errores: [], avisos: [], filas: [] };
  const fecha = normalizarCampo('fecha', d.fecha, ctx);
  if (fecha.error) r.errores.push(fecha.error);
  const base = { 'Fecha': fecha.valor, 'Método de pago': CAJA.EFECTIVO, 'Fecha de pago': fecha.valor };

  if (d.tipo === 'cuotas') {
    const cuotas = d.cuotas || [];
    if (!cuotas.length) r.errores.push('Añade al menos un socio.');
    const vistos = {};
    cuotas.forEach(c => {
      // Sin base de socios: quién ha pagado y la partida de su tramo, sin ID.
      if (!c.idSocio) {
        const nombre = normalizarCampo('titular', c.nombre, ctx).valor;
        const imp = normalizarCampo('importe', c.importe, ctx, { signo: 1 });
        const partida = normalizarCampo('partida', c.partida, ctx, { signo: 1 });
        if (!nombre) { r.errores.push('Falta el nombre de quien paga una de las cuotas.'); return; }
        if (imp.error) { r.errores.push(`${nombre}: ${imp.error.toLowerCase()}`); return; }
        if (!partida.valor || partida.error) { r.errores.push(`${nombre}: ${partida.error || 'falta la partida (el tramo de cuota).'}`); return; }
        r.filas.push(Object.assign({}, base, { 'Descripción': 'Cuota ' + ctx.curso, 'Titular': nombre,
          'Partida': partida.valor, 'Cantidad': imp.valor }));
        return;
      }
      const ids = idsDeCelda(c.idSocio);
      if (!ids || ids.length !== 1) { r.errores.push(`«${c.idSocio}» no es un ID de socio (JMV-000000).`); return; }
      const id = ids[0].idSocio;
      if (vistos[id]) { r.errores.push(`${id} está dos veces.`); return; }
      vistos[id] = true;
      const imp = normalizarCampo('importe', c.importe, ctx, { signo: 1 });
      if (imp.error) { r.errores.push(`${id}: ${imp.error.toLowerCase()}`); return; }
      const partida = normalizarCampo('partida', c.partida, ctx, { signo: 1 });
      if (partida.error) r.avisos.push(`${id}: ${partida.error} Se deja sin partida: la pondrá la sincronización.`);
      if (ctx.sociosEnCaja[id]) r.avisos.push(`${id} ya tenía un asiento en Caja (${ctx.sociosEnCaja[id].join(', ')}): `
        + 'si es la misma cuota, borra uno de los dos.');
      r.filas.push(Object.assign({}, base, { 'Descripción': 'Cuota ' + ctx.curso, 'ID socio': id,
        'Partida': partida.error ? '' : partida.valor, 'Cantidad': imp.valor }));
    });
  } else if (d.tipo === 'ingreso' || d.tipo === 'gasto') {
    const signo = d.tipo === 'gasto' ? -1 : 1;
    const n = (nombre, extra) => {
      const x = normalizarCampo(nombre, d[nombre], ctx, extra);
      if (x.error) r.errores.push(x.error);
      if (x.aviso) r.avisos.push(x.aviso);
      return x.valor;
    };
    const partida = n('partida', { signo: signo });
    const v = Object.assign({}, base, {
      'Cantidad': n('importe', { signo: signo }), 'Partida': partida,
      'Subpartida': n('subpartida', { partida: partida }), 'Descripción': n('descripcion')
    });
    if (signo < 0) { v['Proveedor'] = n('proveedor'); v['CIF proveedor'] = n('cif'); v['Factura'] = n('sinFactura'); }
    if (!partida) r.errores.push('Falta la partida.');
    if (partida === CAJA.EJERCICIO_ANTERIOR) r.errores.push(`Un asiento nuevo no puede ser «${CAJA.EJERCICIO_ANTERIOR}».`);
    if (!v['Descripción']) r.errores.push('Falta la descripción.');
    r.filas.push(v);
  } else {
    r.errores.push('Tipo de asiento desconocido.');
  }

  const total = redondear(r.filas.reduce((s, v) => s + (v['Cantidad'] || 0), 0));
  if (!r.errores.length && redondear(ctx.saldos.efectivo + total) < 0) {
    r.avisos.push(`El efectivo queda en ${euros(ctx.saldos.efectivo + total)}: ¿falta apuntar algún ingreso o traspaso?`);
  }
  return r;
}

/**
 * Cambios desde la ventana en un asiento que ya existe.
 * f: filaDeCaja() de ahora. cambios: { campo: { antes, despues } }.
 * { escribir: {columna: valor}, errores, avisos, conflictos: [columna] }.
 */
function planDeCambios(f, cambios, ctx) {
  const permitidos = Object.assign({}, ASIENTOS.EDITABLES, f.pendiente ? ASIENTOS.EDITABLES_PENDIENTE : {});
  const r = { escribir: {}, errores: [], avisos: [], conflictos: [] };
  const campos = Object.keys(cambios);
  campos.forEach(c => {
    if (!permitidos[c]) r.errores.push(`«${c}» no se puede cambiar desde aquí.`);
    else if (!mismoValor(valorParaVentana(f, c), cambios[c].antes)) r.conflictos.push(permitidos[c]);
  });
  if (r.errores.length || r.conflictos.length) return r;

  const signo = f.cantidad < 0 ? -1 : 1;
  const partida = 'partida' in cambios ? normalizarCampo('partida', cambios.partida.despues, ctx, { signo: signo }).valor : f.partida;
  campos.forEach(c => {
    const n = normalizarCampo(c, cambios[c].despues, ctx, { partida: partida, signo: signo, id: f.id });
    if (n.error) { r.errores.push(n.error); return; }
    if (c === 'cuentaAbono' && !n.valor) { r.errores.push('Una transferencia necesita el IBAN de destino.'); return; }
    // «No requiere» nunca pisa el enlace a una factura de verdad.
    if (c === 'sinFactura' && n.valor && f.factura && !noRequiereFactura(f.factura)) {
      r.errores.push(`${f.id} ya tiene su factura: no se marca como «${CAJA.SIN_FACTURA}».`); return;
    }
    if (c === 'sinFactura' && n.valor && f.cantidad !== null && f.cantidad > 0) {
      r.errores.push('Solo los gastos llevan factura: un ingreso no se marca.'); return;
    }
    if (n.aviso) r.avisos.push(n.aviso);
    if (!mismoValor(c === 'fecha' ? isoDeFecha(n.valor) : n.valor, valorParaVentana(f, c))) r.escribir[permitidos[c]] = n.valor;
  });
  // Si cambia la partida, una subpartida de la anterior ya no vale.
  if ('partida' in cambios && !('subpartida' in cambios) && f.subpartida && (!partida || f.subpartida.indexOf(partida) !== 0)) {
    r.escribir['Subpartida'] = '';
    r.avisos.push(`Se ha quitado la subpartida ${f.subpartida}, que era de otra partida.`);
  }
  return r;
}

/** Fila de Caja (array) a partir de {columna: valor}. */
function filaNuevaDeCaja(valores) {
  const v = new Array(CAJA.COLUMNAS.length).fill('');
  Object.keys(valores).forEach(k => { v[colCaja(k) - 1] = valores[k] === null || valores[k] === undefined ? '' : valores[k]; });
  return v;
}

/** Texto que acepta el concepto de una transferencia: sin tildes, ñ ni símbolos raros. */
function textoParaBanco(t) {
  return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[ºª]/g, '')
    .replace(/[^A-Za-z0-9 /\-?:().,'+]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Asunto de la transferencia: el ID del asiento y el texto, como mucho ASUNTO_MAX caracteres. */
function asuntoDeTransferencia(id, texto) {
  let t = textoParaBanco(texto);
  if (id && t.indexOf(id) === 0) t = t.slice(id.length).trim();
  return ((id || '') + (t ? ' ' + t : '')).slice(0, ASIENTOS.ASUNTO_MAX).trim();
}

/** IBAN con sus dígitos de control bien (ISO 13616, módulo 97). */
function ibanValido(t) {
  const c = compactar(t);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(c)) return false;
  if (c.slice(0, 2) === 'ES' && c.length !== 24) return false;
  let resto = 0;
  for (const ch of c.slice(4) + c.slice(0, 4)) {
    const v = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
    for (const d of v) resto = (resto * 10 + Number(d)) % 97;
  }
  return resto === 1;
}

/** «ES0012345678…» → «ES00 1234 5678 …». */
function formatoIban(t) { return compactar(t).replace(/(.{4})(?=.)/g, '$1 '); }

/**
 * DNI, NIE o CIF español con su letra o dígito de control: true o false.
 * null si no tiene ninguno de esos formatos (un proveedor extranjero…):
 * entonces no se comprueba.
 */
function documentoFiscalValido(t) {
  const c = compactar(t);
  if (!c) return null;
  const LETRAS = 'TRWAGMYFPDXBNJZSQVHLCKE';
  let m = c.match(/^(\d{8})([A-Z])$/);
  if (m) return LETRAS.charAt(parseInt(m[1], 10) % 23) === m[2];
  m = c.match(/^([XYZ])(\d{7})([A-Z])$/);
  if (m) return LETRAS.charAt(parseInt('XYZ'.indexOf(m[1]) + m[2], 10) % 23) === m[3];
  m = c.match(/^([ABCDEFGHJNPQRSUVW])(\d{7})([0-9A-J])$/);
  if (!m) return null;
  let suma = 0;
  m[2].split('').map(Number).forEach((x, i) => {
    if (i % 2 === 1) suma += x;
    else { const y = x * 2; suma += Math.floor(y / 10) + y % 10; }
  });
  const digito = (10 - suma % 10) % 10, letra = 'JABCDEFGHI'.charAt(digito);
  if ('NPQRSW'.indexOf(m[1]) >= 0) return m[3] === letra;
  if ('ABEH'.indexOf(m[1]) >= 0) return m[3] === String(digito);
  return m[3] === String(digito) || m[3] === letra;
}

/** Date → «2026-10-15» (lo que entiende <input type=date>), o ''. */
function isoDeFecha(d) {
  if (!(d instanceof Date) || isNaN(d)) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}


// ==================================================================
// PANEL LATERAL (Panel.html)
//
// Se abre a la derecha de la hoja, se queda abierto mientras se trabaja y
// tiene un botón grande para cada tarea, el traspaso el primero: más a mano
// que el menú para quien no está acostumbrado a Sheets.
// ==================================================================

function abrirPanel() {
  SpreadsheetApp.getUi().showSidebar(HtmlService.createHtmlOutputFromFile('Panel').setTitle('Tesorería'));
}

/** Lo que enseña el panel. Solo datos simples. */
function estadoDelPanel() {
  const ss = libro();
  if (!ss.getSheetByName(HOJAS.AJUSTES) || !ss.getSheetByName(HOJAS.CAJA)) return { libro: false };
  registrarPrograma(ss);
  const aj = leerAjustes(ss);
  return Object.assign({ libro: true, centro: config('NOMBRE_CENTRO'), ultimoExtracto: aj.ultimoExtracto,
    bdSocios: !!config('ID_BD_SOCIOS'),
    reparar: (parseInt(mapaDeAjustes()[AJUSTES.VERSION], 10) || 0) < VERSION_ESTRUCTURA },
    resumenDelLibro(leerCaja(ss), saldosIniciales(ss), aj));
}

/** Saldos y cuántos asientos hay en cada lista de la ventana. Pura (la usa también la consola). */
function resumenDelLibro(filas, iniciales, aj) {
  const r = { ejercicio: aj.ejercicio, saldos: saldosALaFecha(filas, iniciales, new Date(2999, 0, 1)),
    pendientes: 0, completar: 0, facturas: 0, sinPartida: 0, asientos: filas.length };
  filas.forEach(f => {
    const c = clasificarAsiento(f);
    if (c.pendiente) r.pendientes++;
    if (c.completar) r.completar++;
    if (c.factura) r.facturas++;
    if (f.cantidad !== null && !f.partida) r.sinPartida++;
  });
  return r;
}
