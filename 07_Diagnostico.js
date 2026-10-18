/*******************************************************************
 * JMV — TESORERÍA · Diagnóstico y pruebas
 *
 * diagnostico(): comprueba configuración, carpetas, BD Socios, la
 * estructura del libro y la calidad de Caja. No cambia nada.
 *
 * pruebasTesoreria(): casos con datos INVENTADOS de la lógica pura
 * (lectura de extractos, identificación de socios, plan de
 * sincronización, informes). Se ejecuta desde el menú y también en
 * Node (pruebas/ejecutar.js). Nunca pongas aquí nombres reales sacados
 * de un extracto: este archivo está en git.
 *******************************************************************/

function diagnostico() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const r = [];
  const ok = t => r.push('✔ ' + t), aviso = t => r.push('⚠ ' + t), error = t => r.push('✖ ' + t);

  // Archivos del proyecto.
  const funciones = { leerCaja: () => leerCaja, leerExtracto: () => leerExtracto, identificarSocio: () => identificarSocio,
    planificarSincronizacion: () => planificarSincronizacion, calcularInforme: () => calcularInforme,
    hojasDeActividad: () => hojasDeActividad, saldosALaFecha: () => saldosALaFecha };
  const faltan = Object.keys(funciones).filter(k => { try { return typeof funciones[k]() !== 'function'; } catch (e) { return true; } });
  if (faltan.length) error('Faltan funciones (¿falta algún archivo del proyecto?): ' + faltan.join(', '));

  // Config.js.
  let hayConfig = true;
  try { if (typeof CONFIG !== 'object') hayConfig = false; } catch (e) { hayConfig = false; }
  if (!hayConfig) error('No hay Config.js en el proyecto: cópialo de Config.ejemplo.js y haz clasp push.');
  ['ID_BD_SOCIOS', 'CARPETA_FACTURAS', 'CARPETA_EXTRACTOS', 'CARPETA_INFORMES'].forEach(k => {
    if (!config(k)) error(`Falta ${k} en Config.js.`);
  });
  ['NOMBRE_CENTRO', 'IBAN_CUENTA', 'TITULAR_CUENTA'].forEach(k => { if (!config(k)) aviso(`${k} está vacío en Config.js.`); });

  // Carpetas.
  ['CARPETA_FACTURAS', 'CARPETA_EXTRACTOS', 'CARPETA_INFORMES'].forEach(k => {
    if (!config(k)) return;
    try {
      const c = DriveApp.getFolderById(config(k));
      const acceso = c.getSharingAccess();
      if (acceso === DriveApp.Access.ANYONE || acceso === DriveApp.Access.ANYONE_WITH_LINK) {
        error(`La carpeta de ${k} («${c.getName()}») está compartida con cualquiera que tenga el enlace.`);
      } else ok(`${k}: «${c.getName()}».`);
    } catch (e) { error(`${k}: no se puede abrir la carpeta (${e.message}).`); }
  });
  try { Drive.Files.list({ pageSize: 1, supportsAllDrives: true, includeItemsFromAllDrives: true }); ok('Servicio avanzado de Drive activo.'); }
  catch (e) { error('El servicio avanzado de Drive no responde (hace falta para leer los .xls): ' + e.message); }

  // Estructura.
  Object.keys(HOJAS).forEach(k => { if (!ss.getSheetByName(HOJAS[k])) error(`Falta la hoja «${HOJAS[k]}»: Tesorería → Ejercicio → Crear estructura.`); });
  const caja = ss.getSheetByName(HOJAS.CAJA);
  if (caja) {
    const cab = caja.getRange(CAJA.FILA_CABECERA, 1, 1, CAJA.COLUMNAS.length).getValues()[0].map(x => String(x).trim());
    const mal = CAJA.COLUMNAS.filter((c, i) => cab[i] !== c);
    if (mal.length) error(`La cabecera de Caja no es la esperada (${mal.join(', ')}): no muevas ni insertes columnas en Caja. `
      + 'Tesorería → Ejercicio → Reparar.');
    ['SALDO_INICIAL_BANCO', 'SALDO_INICIAL_EFECTIVO'].forEach(n => {
      if (!ss.getNamedRanges().some(x => x.getName() === n)) error(`Falta el rango con nombre ${n}: Tesorería → Ejercicio → Reparar.`);
    });
  }

  let aj = null;
  try { aj = leerAjustes(ss); ok(`Ejercicio ${aj.ejercicio}: del ${fechaCorta(aj.inicio)} al ${fechaCorta(aj.fin)}; curso ${aj.curso || '¿?'}.`); }
  catch (e) { error(e.message); }

  let partidas = null;
  try {
    partidas = leerPartidas(ss);
    const todas = partidas.ingresos.map(p => ['I', p.codigo]).concat(partidas.gastos.map(p => ['G', p.codigo]));
    const malas = todas.filter(x => !PATRON_PARTIDA.test(x[1]) || x[1].charAt(0) !== x[0]).map(x => x[1]);
    if (malas.length) error('Códigos de partida no válidos en el Presupuesto: ' + malas.join(', '));
    const vistos = {}, rep = [];
    todas.forEach(x => { if (vistos[x[1]]) rep.push(x[1]); vistos[x[1]] = true; });
    if (rep.length) error('Partidas repetidas en el Presupuesto: ' + rep.join(', '));
    if (!malas.length && !rep.length) ok(`Presupuesto: ${partidas.ingresos.length} partidas de ingresos y ${partidas.gastos.length} de gastos.`);
    if (aj) Object.keys(aj.tramos).forEach(t => {
      if (!partidas.ingresos.some(p => p.codigo === aj.tramos[t])) error(`Ajustes: la partida de cuotas del tramo ${t} (${aj.tramos[t] || 'vacía'}) no está en el Presupuesto.`);
    });
  } catch (e) { error('Presupuesto: ' + e.message); }

  // BD Socios.
  if (config('ID_BD_SOCIOS') && aj) {
    try {
      const bd = abrirBdSocios();
      ['Socios', 'Familias', 'Inscripciones', 'Pagos'].forEach(t => tablaDeBdSocios(bd, t));
      const ins = tablaDeBdSocios(bd, 'Inscripciones').filas.filter(i => String(i.Curso_id).trim() === aj.curso);
      if (!ins.length) aviso(`BD Socios no tiene inscripciones del curso ${aj.curso}.`);
      else ok(`BD Socios: «${bd.getName()}», ${ins.length} inscripciones del curso ${aj.curso}.`);
      const sinPartida = {};
      ins.forEach(i => { const t = String(i.Tramo_cuota || '').trim(); if (t && !aj.tramos[t]) sinPartida[t] = true; });
      if (Object.keys(sinPartida).length) aviso('Tramos de cuota sin partida en Ajustes: ' + Object.keys(sinPartida).join(', '));
    } catch (e) { error('BD Socios: ' + e.message); }
  }

  // Calidad de Caja.
  if (caja && aj) {
    const filas = leerCaja(ss);
    const sinId = filas.filter(f => !f.id).length;
    if (sinId) aviso(`${sinId} filas de Caja sin ID (o sin Fecha): Tesorería → Caja → Asignar los ID que falten.`);
    const vistos = {}, rep = [];
    filas.forEach(f => { if (f.id && vistos[f.id]) rep.push(f.id); vistos[f.id] = true; });
    if (rep.length) error('ID de transacción repetidos en Caja: ' + rep.join(', '));
    let desorden = 0;
    for (let i = 1; i < filas.length; i++) {
      if (filas[i].fechaEfectiva && filas[i - 1].fechaEfectiva && filas[i].fechaEfectiva < filas[i - 1].fechaEfectiva) desorden++;
    }
    if (desorden) aviso(`Caja no está ordenada por fecha de pago (${desorden} saltos): Tesorería → Caja → Ordenar.`);
    const desc = descuadresDeSaldo(filas, saldosIniciales(ss));
    if (desc.length) aviso(`El saldo no coincide con el del banco en ${desc.length} filas (la primera, ${desc[0].id}).`);
    const fuera = filas.filter(f => f.fecha && (f.fechaEfectiva < aj.inicio || f.fechaEfectiva > aj.fin));
    if (fuera.length) aviso(`${fuera.length} asientos con fecha de pago fuera del ejercicio: ${fuera.slice(0, 5).map(f => f.id).join(', ')}.`);
    if (partidas) {
      const conocidas = {};
      partidas.ingresos.concat(partidas.gastos).forEach(p => { conocidas[p.codigo] = true; });
      conocidas[CAJA.TRASPASO] = true;
      conocidas[CAJA.EJERCICIO_ANTERIOR] = true;
      const raras = filas.filter(f => f.partida && !conocidas[f.partida]).map(f => f.partida);
      if (raras.length) error('Partidas en Caja que no están en el Presupuesto: ' + raras.filter((x, i) => raras.indexOf(x) === i).join(', '));
    }
    const sueltas = emparejarTraspasos(filas).sueltas;
    if (sueltas.length) aviso(`Traspasos sin su otra pata (banco ↔ efectivo, mismo importe con signo contrario): `
      + sueltas.slice(0, 8).map(f => f.id || 'fila ' + f.fila).join(', ') + (sueltas.length > 8 ? '…' : '')
      + '. Tesorería → Caja → Apuntar traspaso, o corrige la que esté mal.');
    const subMal = filas.filter(f => f.subpartida && f.subpartida.indexOf(f.partida) !== 0);
    if (subMal.length) aviso(`${subMal.length} asientos con una subpartida que no es de su partida (en rojo en Caja).`);
    const socioMal = filas.filter(f => f.idSocio && !idsDeCelda(f.idSocio));
    if (socioMal.length) aviso(`${socioMal.length} asientos con un ID de socio mal escrito (en rojo en Caja).`);
    const pendSocios = filas.filter(f => f.bdSocios.charAt(0) === '⚠').length;
    if (pendSocios) aviso(`${pendSocios} asientos con algo que resolver con BD Socios (en naranja en Caja).`);
    const sinPartida = filas.filter(f => f.cantidad !== null && !f.partida).length;
    if (sinPartida) aviso(`${sinPartida} asientos sin partida.`);
    ok(`Caja: ${filas.length} asientos.`);
  }

  const sinc = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'sincronizacionAutomatica');
  r.push((sinc ? '✔ ' : 'ℹ ') + 'Sincronización automática con BD Socios: ' + (sinc ? 'instalada.' : 'no instalada (opcional).'));

  const p = pruebasTesoreria();
  if (p.fallos.length) error(`Pruebas: fallan ${p.fallos.length} de ${p.total}. Tesorería → Diagnóstico → Ejecutar las pruebas.`);
  else ok(`Pruebas: los ${p.total} casos correctos.`);

  const errores = r.filter(x => x.charAt(0) === '✖').length;
  SpreadsheetApp.getUi().alert(errores ? `Diagnóstico: ${errores} errores` : 'Diagnóstico: todo en orden',
    r.join('\n'), SpreadsheetApp.getUi().ButtonSet.OK);
}

function ejecutarPruebas() {
  const p = pruebasTesoreria();
  SpreadsheetApp.getUi().alert('Pruebas',
    p.fallos.length ? `Fallan ${p.fallos.length} de ${p.total}:\n\n` + p.fallos.join('\n\n') : `Los ${p.total} casos correctos.`,
    SpreadsheetApp.getUi().ButtonSet.OK);
}


// ==================================================================
// PRUEBAS (puras, datos inventados)
// ==================================================================

function pruebasTesoreria() {
  const casos = [];
  const caso = (nombre, obtenido, esperado) => casos.push({ nombre: nombre, obtenido: obtenido, esperado: esperado });
  const D = (d, m, a) => new Date(a, m - 1, d);

  // --- IDs ---
  caso('ID siguiente del día', siguienteIdTransaccion(D(15, 10, 2026), ['20261015-01', '20261015-02', '20261014-05']), '20261015-03');
  caso('ID primero del día', siguienteIdTransaccion(D(1, 9, 2026), ['20261015-01']), '20260901-01');
  caso('Número español', numeroDeTexto('-1.234,56 €'), -1234.56);
  caso('Fecha dd/mm/aaaa', fechaCompacta(fechaDeTexto('07/10/2026')), '20261007');

  // --- Extracto ---
  const filas = [
    [], ['', '', 'Titular', 'Saldo disponible'], ['', '', 'ASOCIACION DE PRUEBA', '1.084,50 EUR'], [],
    ['', '', 'Cuenta'], ['', '', 'ES00 1234 5678 90 1234567890'],
    ['Movimientos Fecha desde 25/08/2026 Fecha Hasta 10/09/2026'],
    ['Fecha Operación', 'Fecha Valor', 'Concepto', 'Importe', 'Divisa', 'Saldo', 'Divisa', 'Código'],
    ['05/09/2026', '05/09/2026', 'Ingreso Anonimo En Cajero Automatico 0049 El 05/09/2026. Concepto: 2026 2027 Cuota Jmv000007. Ordenante: Juventudes Marianas Vicencianas Espa&#xfffd;a.', 30, 'EUR', 1084.5, 'EUR', '043'],
    ['02/09/2026', '02/09/2026', 'Pago Con Tarjeta En Papeleria Central', -15.5, 'EUR', 1054.5, 'EUR', '012'],
    ['02/09/2026', '01/09/2026', 'Transferencia Inmediata De Ana Ruiz Gil, Concepto Lucia Gomez Cuota26', 20, 'EUR', 1070, 'EUR', '071'],
    ['28/08/2026', '28/08/2026', 'Transferencia De Pedro Prueba, Concepto Abanicos', 50, 'EUR', 1050, 'EUR', '071']
  ];
  const ext = leerExtracto(filas);
  caso('Extracto: movimientos', ext.movimientos.length, 4);
  caso('Extracto: orden cronológico', ext.movimientos.map(m => m.importe), [50, 20, -15.5, 30]);
  caso('Extracto: cadena de saldos', ext.avisos, []);
  caso('Extracto: cuenta', compactar(ext.cuenta), 'ES0012345678901234567890');
  caso('Extracto: titular', ext.titular, 'ASOCIACION DE PRUEBA');
  caso('Extracto: entidades', ext.movimientos[3].concepto.indexOf('&#') < 0, true);
  caso('Saldo inicial desde el extracto', saldoInicialDesdeExtracto(ext, D(1, 9, 2026)).saldo, 1050);
  caso('Método: tarjeta', metodoDeConcepto('Pago Con Tarjeta En Papeleria'), 'Tarjeta');
  caso('Método: cajero', metodoDeConcepto(ext.movimientos[3].concepto), 'Ingreso en cajero');
  caso('Método: transferencia', metodoDeConcepto('Transferencia Inmediata De X, Concepto Y'), 'Transferencia');
  caso('Método: retirada de cajero', metodoDeConcepto('Reintegro Efectivo Cajero 0049 El 03/10/2026', -50), 'Retirada en cajero');
  caso('Número "1.000"', numeroDeTexto('1.000'), 1000);
  caso('Número "70,5"', numeroDeTexto('70,5'), 70.5);

  const filaCaja = o => Object.assign({ fila: 0, id: '', fecha: null, partida: '', subpartida: '', idSocio: '',
    cantidad: null, factura: '', metodo: '', fechaPago: null, saldoExtracto: null, bdSocios: '', huella: '',
    descripcion: '', proveedor: '' }, o, { fechaEfectiva: o.fechaPago || o.fecha, esEfectivo: o.metodo === CAJA.EFECTIVO });
  const yaImportado = ext.movimientos[1];
  const plan = planificarImportacion(ext.movimientos.map(m => Object.assign({}, m)), [
    filaCaja({ fila: 4, id: '20260901-01', fecha: D(1, 9, 2026), cantidad: -15.5, metodo: 'Tarjeta' }),
    filaCaja({ fila: 5, id: '20260902-01', fecha: D(2, 9, 2026), cantidad: 20, huella: huellaDeMovimiento(yaImportado) + '#1' })
  ], D(1, 9, 2026), D(31, 8, 2027, 23));
  caso('Importar: fuera del ejercicio', plan.fuera.length, 1);
  caso('Importar: ya importado (aunque esté dividido)', plan.duplicados.length, 1);
  caso('Importar: apuntado a mano antes', plan.fusiones.map(x => x.id), ['20260901-01']);
  caso('Importar: nuevos', plan.nuevos.map(m => m.importe), [30]);
  // Dos ingresos de 20 el mismo día con un cargo de -20 entre medias:
  // misma fecha, importe y saldo. Son dos movimientos distintos.
  const gemelos = [
    { fecha: D(5, 10, 2026), importe: 20, saldo: 120, concepto: 'Transferencia De A, Concepto Uno' },
    { fecha: D(5, 10, 2026), importe: -20, saldo: 100, concepto: 'Traspaso: Pagos' },
    { fecha: D(5, 10, 2026), importe: 20, saldo: 120, concepto: 'Transferencia De A, Concepto Dos' }];
  caso('Importar: mismo día, importe y saldo', planificarImportacion(gemelos, [], D(1, 9, 2026), D(31, 8, 2027)).nuevos.length, 3);

  // --- Identificación ---
  const cand = (id, nombre, apellidos, familia, tutores, tramo, cuota) =>
    ({ id: 'JMV-00000' + id, nombre: nombre, apellidos: apellidos, familia: familia, tutores: tutores, tramo: tramo, cuota: cuota });
  const ctx = { curso: '2026-2027', titular: 'Juventudes Marianas Vicencianas España', candidatos: [
    cand(1, 'Lucía', 'Gómez Ruiz', 'FAM-1', ['Ana Ruiz Gil'], '10-15', 20),
    cand(2, 'Pablo', 'Gómez Ruiz', 'FAM-1', ['Ana Ruiz Gil'], '16-30', 30),
    cand(3, 'Juan Pedro', 'Serrano Vidal', 'FAM-2', ['Rosa Vidal Mora'], '10-15', 20),
    cand(4, 'Pedro Antonio', 'Serrano Vidal', 'FAM-2', ['Rosa Vidal Mora'], '10-15', 20),
    cand(5, 'María Isabel', 'Robles Pardo', 'FAM-3', ['Carmen Pardo Soler'], '10-15', 20),
    cand(6, 'Hugo', 'Fernández Castillo', 'FAM-4', ['Diana Castillo Rey'], '10-15', 20),
    cand(7, 'Sofía', 'Navarro Gil', 'FAM-5', ['Marta Gil Prieto'], '16-30', 30),
    cand(8, 'Andrés', 'Molina Yáñez', '', [], '16-30', 30),
    cand(9, 'Clara Inés', 'Ortega Luna', 'FAM-6', ['Clara María Luna Vega'], '16-30', 30)
  ] };
  const id = (texto, importe) => identificarSocio(texto, importe, ctx).ids;
  const T = 'Transferencia Inmediata De ';
  caso('Socio: nombre y un apellido', id(T + 'Ana Ruiz Gil, Concepto Lucia Gomez Cuota26', 20), ['JMV-000001']);
  caso('Socio: hermanos, nombre compuesto', id(T + 'Rosa Vidal Mora, Concepto Serrano Vidal Juan Pedro Cuota 26', 20), ['JMV-000003']);
  caso('Socio: hermanos, ambiguo', id(T + 'Rosa Vidal Mora, Concepto Serrano Vidal Pedro', 20), []);
  caso('Socio: todo pegado', id(T + 'Carmen Pardo Soler, Concepto Mariaisabelroblespardo', 20), ['JMV-000005']);
  caso('Socio: apellidos pegados', id(T + 'Diana Castillo Rey, Concepto Hugo Fernandezcastillo', 20), ['JMV-000006']);
  caso('Socio: "cuota" pegada al nombre', id(T + 'Diana Castillo Rey, Concepto Fernandez Castillo Hugocuota 2026', 20), ['JMV-000006']);
  caso('Socio: separado con puntos y guiones bajos', id(T + 'Diana Castillo Rey, Concepto Fernandez_castillo.hugo.cuota26', 20), ['JMV-000006']);
  caso('Socio: número de socio', id('Ingreso Anonimo En Cajero 0049 El 07/10/2026. Concepto: 2026 2027 Cuota Jmv000007. Ordenante: Marta Gil Prieto.', 30), ['JMV-000007']);
  caso('Socio: número contra nombre de otro', id(T + 'Ana Ruiz Gil, Concepto Cuota JMV-000007 Lucia Gomez', 20), []);
  caso('Socio: "JMV 2026" no es un número de socio', idsDeSocioEnTexto('Cuota JMV 2026-2027'), []);
  caso('Socio: número corto', idsDeSocioEnTexto('cuota jmv130'), ['JMV-000130']);
  caso('Socio: adulto que paga lo suyo', id('Transferencia De Andres Molina Yañez, .', 30), ['JMV-000008']);
  caso('Socio: por tutor, un hijo', id('Transferencia De Carmen Pardo Soler, .', 20), ['JMV-000005']);
  caso('Socio: por tutor, dos hijos y su suma', id('Transferencia De Ana Ruiz Gil, .', 50), ['JMV-000001', 'JMV-000002']);
  caso('Socio: por tutor, importe que no cuadra', id('Transferencia De Ana Ruiz Gil, .', 20), []);
  caso('Socio: tutora con el nombre de su hija', id('Transferencia De Clara Maria Luna Vega, .', 30), ['JMV-000009']);
  caso('Socio: ingreso de la propia asociación', id('Transferencia De Juventudes Marianas Vicencianas, Concepto Cuota Sofia Navarro', 30), ['JMV-000007']);
  caso('Socio: dos en el mismo concepto', id(T + 'Ana Ruiz Gil, Concepto Gomez Ruiz Lucia y Pablo', 50), ['JMV-000001', 'JMV-000002']);
  caso('Socio: "Mari" no es "María"', id(T + 'Pedro Prueba Uno, Concepto Pago de Mari Robles Pardo', 20), []);
  caso('Socio: solo apellidos deja pista', identificarSocio(T + 'Pedro Prueba Uno, Concepto Pago de Mari Robles Pardo', 20, ctx).pista.indexOf('JMV-000005') >= 0, true);
  caso('Socio: Daniel no es Daniela', identificarSocio(T + 'X Y, Concepto Daniel Gomez Ruiz', 20,
    { curso: '2026-2027', titular: '', candidatos: [cand(1, 'Daniela', 'Gómez Ruiz', 'F', [], '10-15', 20)] }).ids, []);

  // --- Traspasos entre banco y efectivo ---
  const ingresoCentro = { fecha: D(7, 10, 2026), importe: 50, saldo: 600,
    concepto: 'Ingreso Anonimo En Cajero 0049 El 07/10/2026. Concepto: Navarro Sofia Cuota26. Ordenante: Juventudes Marianas Vicencianas Espa�a.' };
  const ingresoFamilia = { fecha: D(7, 10, 2026), importe: 20, saldo: 620,
    concepto: 'Ingreso Anonimo En Cajero 0049 El 07/10/2026. Concepto: Cuota Jmv000001. Ordenante: Ana Ruiz Gil.' };
  const retirada = { fecha: D(9, 10, 2026), importe: -100, saldo: 520, concepto: 'Reintegro Efectivo Cajero 0049 El 09/10/2026' };
  caso('Traspaso: retirada de cajero', tipoDeTraspaso(retirada), 'retirada');
  // Una familia que ingresa en el cajero sin identificarse sale con la
  // asociación como ordenante: sin traspaso declarado por tesorería, es un cobro.
  const sinDeclarar = planificarTraspasos(planificarImportacion([ingresoCentro, ingresoFamilia].map(m => Object.assign({}, m)),
    [], D(1, 9, 2026), D(31, 8, 2027)), []);
  caso('Traspaso: ingreso en cajero no declarado es un cobro', sinDeclarar.nuevos.map(m => m.traspaso), [null, null]);
  const marcadoAMano = [filaCaja({ fila: 9, id: '20261007-01', fecha: D(7, 10, 2026), cantidad: 50, partida: CAJA.TRASPASO,
    metodo: 'Ingreso en cajero' })];
  const declarado = planificarTraspasos(planificarImportacion([Object.assign({}, ingresoCentro)], marcadoAMano,
    D(1, 9, 2026), D(31, 8, 2027)), marcadoAMano);
  caso('Traspaso: fila del banco marcada a mano, se crea la de efectivo', declarado.fusiones.map(x => x.m.traspaso.espejo), [true]);

  // La pata de efectivo de la retirada no estaba: se crea. La del ingreso
  // ya se había apuntado a mano: se empareja.
  const cajaT = [
    filaCaja({ fila: 4, id: '20261006-01', fecha: D(6, 10, 2026), cantidad: -50, partida: CAJA.TRASPASO, metodo: CAJA.EFECTIVO }),
    filaCaja({ fila: 5, id: '20261001-01', fecha: D(1, 10, 2026), cantidad: 30, metodo: CAJA.EFECTIVO, idSocio: 'JMV-000007' })
  ];
  const planT = planificarTraspasos(planificarImportacion([ingresoCentro, ingresoFamilia, retirada].map(m => Object.assign({}, m)),
    cajaT, D(1, 9, 2026), D(31, 8, 2027)), cajaT);
  caso('Traspaso: plan del importador', planT.nuevos.map(m => m.traspaso && [m.traspaso.tipo, m.traspaso.espejo, m.traspaso.pareja || '']),
    [['ingreso', false, '20261006-01'], null, ['retirada', true, '']]);
  const espejo = filaDeEfectivoDelTraspaso(planT.nuevos[2], '20261009-01', '20261009-02');
  caso('Traspaso: la pata de efectivo', [espejo[colCaja('Cantidad') - 1], espejo[colCaja('Método de pago') - 1], espejo[colCaja('Partida') - 1]],
    [100, CAJA.EFECTIVO, CAJA.TRASPASO]);
  caso('Traspaso: el concepto nombra una cuota ya apuntada en efectivo', notaDeTraspaso(planT.nuevos[0], ctx, cajaT).charAt(0) !== '⚠', true);
  caso('Traspaso: el concepto nombra una cuota sin apuntar', notaDeTraspaso(planT.nuevos[0], ctx, cajaT.slice(0, 1)).charAt(0), '⚠');
  const emp = emparejarTraspasos([
    filaCaja({ fila: 1, id: 'b1', fecha: D(7, 10, 2026), cantidad: 50, partida: CAJA.TRASPASO, metodo: 'Ingreso en cajero' }),
    filaCaja({ fila: 2, id: 'e1', fecha: D(6, 10, 2026), cantidad: -50, partida: CAJA.TRASPASO, metodo: CAJA.EFECTIVO }),
    filaCaja({ fila: 3, id: 'b2', fecha: D(9, 10, 2026), cantidad: -100, partida: CAJA.TRASPASO, metodo: 'Retirada en cajero' })]);
  caso('Traspaso: patas sueltas', emp.sueltas.map(f => f.id), ['b2']);
  caso('Traspaso: nunca lleva ID de socio', !!pagosDeseados(filaCaja({ id: 'x', cantidad: 50, partida: CAJA.TRASPASO,
    idSocio: 'JMV-000001' }), {}, '2026-2027').error, true);

  // --- Sincronización ---
  const aj = { curso: '2026-2027', inicio: D(1, 9, 2026), fin: new Date(2027, 7, 31, 23, 59, 59),
               tramos: { '10-15': 'I11', '16-30': 'I12', '31+': 'I13' } };
  const ins = [
    { ID_INSCRIPCION: 'JMV-000001@2026-2027', Importe_cuota: 20, Tramo_cuota: '10-15' },
    { ID_INSCRIPCION: 'JMV-000002@2026-2027', Importe_cuota: 30, Tramo_cuota: '16-30' },
    { ID_INSCRIPCION: 'JMV-000003@2026-2027', Importe_cuota: 20, Tramo_cuota: '10-15' }
  ];
  const pagos = [
    { _fila: 2, ID_PAGO: 'PAG-000001', ID_INSCRIPCION: 'JMV-000001@2026-2027', ID_SOCIO: 'JMV-000001', Importe: '',
      Medio: 'Transferencia', Referencia: '', Conciliado: 'No', Notas: 'Formulario.' },
    { _fila: 3, ID_PAGO: 'PAG-000002', ID_INSCRIPCION: 'JMV-000003@2026-2027', ID_SOCIO: 'JMV-000003', Importe: 30,
      Medio: 'Transferencia', Referencia: 'TES-20260910-01', Conciliado: 'Sí', Notas: SOCIOS.MARCA_CREADO + ' Creado.' }
  ];
  const caja = [
    filaCaja({ fila: 4, id: '20260905-01', fecha: D(5, 9, 2026), cantidad: 20, metodo: 'Transferencia', idSocio: 'JMV-000001' }),
    filaCaja({ fila: 5, id: '20260910-01', fecha: D(10, 9, 2026), cantidad: 30, metodo: 'Transferencia', idSocio: 'JMV-000002' }),
    filaCaja({ fila: 6, id: '20260911-01', fecha: D(11, 9, 2026), cantidad: 20, metodo: 'Transferencia', idSocio: 'JMV-000009' }),
    filaCaja({ fila: 7, id: '20260912-01', fecha: D(12, 9, 2026), cantidad: 40, metodo: 'Transferencia', idSocio: 'JMV-000001, JMV-000002' })
  ];
  const s = planificarSincronizacion(caja, pagos, ins, aj, D(18, 10, 2026));
  caso('Sincronizar: concilia el pago de Tally', s.cambiar.filter(c => c.ID_PAGO === 'PAG-000001')
    .map(c => [c.cambios.Importe, c.cambios.Referencia, c.cambios.Conciliado]), [[20, 'TES-20260905-01', 'Sí']]);
  caso('Sincronizar: borra lo creado si cambia el socio', s.borrar.map(b => b.ID_PAGO), ['PAG-000002']);
  caso('Sincronizar: crea el pago nuevo', s.crear.map(c => [c.registro.ID_INSCRIPCION, c.registro.Importe]), [['JMV-000002@2026-2027', 30]]);
  caso('Sincronizar: sin inscripción y suma que no cuadra', Object.keys(s.errores).sort(), ['6', '7']);
  caso('Sincronizar: partida por tramo', s.partidas, { 4: 'I11', 5: 'I12' });
  caso('Sincronizar: inscripciones a recalcular', s.afectadas.slice().sort(),
    ['JMV-000001@2026-2027', 'JMV-000002@2026-2027', 'JMV-000003@2026-2027']);

  // La segunda pasada, con BD Socios ya al día, no hace nada.
  const despues = [
    Object.assign({}, pagos[0], { Importe: 20, Referencia: 'TES-20260905-01', Conciliado: 'Sí' }),
    { _fila: 4, ID_PAGO: 'PAG-000003', ID_INSCRIPCION: 'JMV-000002@2026-2027', ID_SOCIO: 'JMV-000002', Importe: 30,
      Medio: 'Transferencia', Referencia: 'TES-20260910-01', Conciliado: 'Sí', Fecha: D(10, 9, 2026), Notas: SOCIOS.MARCA_CREADO + ' Creado.' }
  ];
  const s2 = planificarSincronizacion(caja.slice(0, 2), despues, ins, aj, D(18, 10, 2026));
  caso('Sincronizar: segunda pasada sin cambios', [s2.cambiar.length, s2.crear.length, s2.borrar.length], [0, 0, 0]);
  // Si se borra el ID de socio, se desconcilia el de Tally.
  const s3 = planificarSincronizacion([filaCaja({ fila: 4, id: '20260905-01', fecha: D(5, 9, 2026), cantidad: 20, metodo: 'Transferencia' })],
    despues.slice(0, 1), ins, aj, D(18, 10, 2026));
  caso('Sincronizar: quitar el socio desconcilia', s3.cambiar.map(c => [c.cambios.Referencia, c.cambios.Conciliado]), [['', 'No']]);
  caso('Cuota: regla de BD Socios', [estadoDeCuota(20, 20, ''), estadoDeCuota(10, 20, ''), estadoDeCuota(0, 20, ''),
    estadoDeCuota(0, 20, 'Exención total')], ['Sí', 'Parcial', 'No', 'Exenta']);

  // --- Informes ---
  const partidas = {
    ingresos: [{ codigo: 'I11', descripcion: 'Cuotas', seccion: SECCIONES[0], importe: 100 },
               { codigo: 'I21', descripcion: 'Actividades', seccion: SECCIONES[1], importe: 200 }],
    gastos: [{ codigo: 'G21', descripcion: 'Actividades', seccion: SECCIONES[1], importe: 150 }]
  };
  const mov = [
    filaCaja({ id: 'a', fecha: D(5, 9, 2026), cantidad: 20, partida: 'I11', idSocio: 'JMV-000001', metodo: 'Transferencia' }),
    filaCaja({ id: 'b', fecha: D(6, 9, 2026), cantidad: -60, partida: 'G21', subpartida: 'G21T', metodo: 'Tarjeta', descripcion: 'Autobús' }),
    filaCaja({ id: 'c', fecha: D(7, 9, 2026), cantidad: 80, partida: 'I21', metodo: CAJA.EFECTIVO }),
    filaCaja({ id: 'd', fecha: D(8, 9, 2026), cantidad: -80, partida: CAJA.TRASPASO, metodo: CAJA.EFECTIVO }),
    filaCaja({ id: 'e', fecha: D(8, 9, 2026), cantidad: 80, partida: CAJA.TRASPASO, metodo: 'Ingreso en cajero' }),
    filaCaja({ id: 'f', fecha: D(9, 9, 2026), cantidad: 5, metodo: 'Transferencia' }),
    filaCaja({ id: 'g', fecha: D(1, 12, 2026), cantidad: -10, partida: 'G21', metodo: 'Tarjeta', factura: 'http://x' })
  ];
  const inf = calcularInforme(mov, partidas, { banco: 1000, efectivo: 10 }, D(30, 11, 2026));
  caso('Informe: saldos finales', inf.saldos.final, { banco: 1045, efectivo: 10, total: 1055 });
  caso('Informe: cuadra', inf.cuadre.diferencia, 0);
  caso('Informe: real por partida', inf.ingresos.map(p => p.real).concat(inf.gastos.map(p => p.real)), [20, 80, 60]);
  caso('Informe: sin partida', inf.sinPartida, { n: 1, importe: 5 });
  caso('Informe: pagos sin factura', inf.gastosSinFactura.map(m => m.id), ['b']);
  caso('Informe: nunca el concepto del banco', inf.movimientos[0].concepto, 'Cuota de socio');
  const act = calcularInformeActividad(mov, { titulo: 'Convivencia', nombre: 'Act · Convivencia', ingresos: 'I21', gastos: 'G21',
    subpartidas: [{ codigo: 'G21T', descripcion: 'Transporte', presupuesto: 50 }] }, partidas, D(31, 12, 2026));
  caso('Actividad: resumen', act.resumen, { presI: 200, realI: 80, presG: 150, realG: 70, presB: 50, realB: 10 });
  caso('Actividad: subpartida', act.subpartidas.map(x => [x.codigo, x.real, x.diferencia]), [['G21T', 60, 10]]);
  caso('Actividad: sin subpartida', act.sinSubpartida, { ingresos: 80, gastos: 10 });
  caso('Saldos a una fecha', saldosALaFecha(mov, { banco: 1000, efectivo: 10 }, D(31, 8, 2027)), { banco: 1035, efectivo: 10 });
  caso('Descuadre con el banco', descuadresDeSaldo([
    filaCaja({ id: 'x', fecha: D(2, 9, 2026), cantidad: 20, saldoExtracto: 1020 }),
    filaCaja({ id: 'y', fecha: D(3, 9, 2026), cantidad: 10, saldoExtracto: 1031 })], { banco: 1000, efectivo: 0 }).map(x => x.id), ['y']);

  // --- Ejercicio anterior: ya está en el saldo inicial ---
  // Banco real a 1/9: 1.000. Llega el 5/9 un cobro de 50 del curso pasado,
  // que tesorería ya sumó al saldo inicial (B1 = 1.050).
  const EA = CAJA.EJERCICIO_ANTERIOR;
  const filasEA = [
    filaCaja({ fila: 4, id: 'a', fecha: D(3, 9, 2026), cantidad: 20, partida: 'I11', metodo: 'Transferencia', saldoExtracto: 1020 }),
    filaCaja({ fila: 5, id: 'b', fecha: D(5, 9, 2026), cantidad: 50, partida: EA, metodo: 'Transferencia', saldoExtracto: 1070,
      idSocio: 'JMV-000001' }),
    filaCaja({ fila: 6, id: 'c', fecha: D(6, 9, 2026), cantidad: -10, partida: 'G21', metodo: 'Tarjeta', saldoExtracto: 1060, factura: 'x' })
  ];
  caso('Ejercicio anterior: cuadra con el banco antes y después de llegar', descuadresDeSaldo(filasEA, { banco: 1050, efectivo: 0 }), []);
  caso('Ejercicio anterior: sin marcar, descuadra', descuadresDeSaldo(filasEA.map(f => Object.assign({}, f, { partida: '' })),
    { banco: 1050, efectivo: 0 }).length > 0, true);
  const infEA = calcularInforme(filasEA, partidas, { banco: 1050, efectivo: 0 }, D(30, 9, 2026));
  caso('Ejercicio anterior: el informe no lo ve', [infEA.saldos.final.banco, infEA.cuadre.diferencia, infEA.movimientos.length, infEA.sinPartida.n],
    [1060, 0, 2, 0]);
  caso('Ejercicio anterior: no mueve el saldo de cierre', saldosALaFecha(filasEA, { banco: 1050, efectivo: 0 }, D(31, 8, 2027)),
    { banco: 1060, efectivo: 0 });
  caso('Ejercicio anterior: no va a BD Socios (sin error)', pagosDeseados(filasEA[1], {}, '2026-2027'), { asignaciones: [] });
  const sEA = planificarSincronizacion([filasEA[1]], [Object.assign({}, despues[0], { Referencia: 'TES-b' })], ins, aj, D(18, 10, 2026));
  caso('Ejercicio anterior: deshace lo que la importación había enlazado', sEA.cambiar.map(c => c.cambios.Conciliado), ['No']);

  const fallos = casos.filter(c => JSON.stringify(c.obtenido) !== JSON.stringify(c.esperado))
    .map(c => `${c.nombre}: esperaba ${JSON.stringify(c.esperado)}, sale ${JSON.stringify(c.obtenido)}`);
  return { total: casos.length, fallos: fallos };
}
