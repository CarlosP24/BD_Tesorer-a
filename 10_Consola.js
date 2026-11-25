/*******************************************************************
 * JMV — TESORERÍA · Consola nacional
 *
 * Una hoja de cálculo de la administración, con este mismo programa
 * vinculado (la prepara crearConsolaNacional(), que se ejecuta una vez
 * desde su editor de Apps Script)
 * con todos los centros. Solo se reconoce por sus metadatos
 * (CONSOLA.META), y solo en ella sale el submenú «Consola nacional».
 * Trabaja con la cuenta de quien la usa, que tiene que poder abrir las
 * unidades compartidas de los centros.
 *
 *   Centros                una fila por centro o área: dónde está todo y cómo va.
 *                          El despliegue es progresivo: solo cuentan los que
 *                          tienen «Sí» en Activo (esCentroActivo()).
 *   Informe nacional       las cuentas de todos, por partida común.
 *   Ajustes de la consola  el ejercicio con el que trabaja.
 *
 * Desde el menú:
 *   - Buscar los centros: recorre las unidades compartidas; un centro es
 *     una unidad con una carpeta «Tesorería» en la raíz. Encuentra su libro
 *     del ejercicio («Ejercicio 26-27»).
 *   - Actualizar el estado: abre cada libro y apunta saldos, lo que falta y
 *     su diagnóstico. También cada noche, si se instala.
 *   - Crear los libros que falten: el del ejercicio siguiente a partir del
 *     anterior (con sus saldos) o, si no hay, uno nuevo vacío.
 *   - Reparar todos: pone al día la estructura de los libros cuando sube
 *     VERSION_ESTRUCTURA (el código lo sube desplegar.js).
 *   - Informe nacional: resumenNacional() de cada centro, en columnas, a
 *     una fecha de corte; la fecha decide el ejercicio (libroDelEjercicio()).
 *
 * Cada recorrido para antes del límite de 6 minutos de Apps Script,
 * guarda por dónde va y la siguiente vez sigue desde ahí (a mano, o la
 * noche siguiente).
 *
 * Despliegue: «Lista de programas para desplegar» da los ID de los
 * scripts de los libros activos, la plantilla y la consola, para
 * `node despliegue/desplegar.js` (DESPLIEGUE.md).
 *******************************************************************/

const CONSOLA = {
  META: 'tesoreria.consola',
  CENTROS: 'Centros',
  INFORME: 'Informe nacional',
  AJUSTES: 'Ajustes de la consola',
  ANIO: 'Año en que empieza el ejercicio',
  PLANTILLA: 'Libro plantilla',
  COLUMNAS: ['Centro', 'Activo', 'Código', 'Unidad compartida', 'Carpeta Tesorería', 'BD Socios', 'Libro', 'Ejercicio', 'Programa',
    'Estructura', 'Banco', 'Efectivo', 'Último extracto', 'Pendientes', 'Por completar', 'Sin factura',
    'Sin partida', 'Errores', 'Avisos', 'Actualizado'],
  ANCHOS: { 'Centro': 200, 'Activo': 60, 'Programa': 130, 'Unidad compartida': 130, 'Carpeta Tesorería': 130, 'BD Socios': 130, 'Libro': 130,
    'Último extracto': 220, 'Errores': 320, 'Avisos': 120, 'Actualizado': 130 },
  // Margen antes de los 6 minutos de Apps Script.
  TIEMPO_MAX: 4.5 * 60 * 1000
};


// ==================================================================
// CREAR Y RECONOCER LA CONSOLA
// ==================================================================

/**
 * Convierte en la consola la hoja de cálculo a la que está vinculado este
 * script (una hoja vacía en la unidad compartida de la administración, con
 * `clasp create --parentId`, DESPLIEGUE.md). Se
 * ejecuta UNA vez desde su editor de Apps Script (Ejecutar →
 * crearConsolaNacional) con la cuenta de la administración. Sin hoja
 * vinculada, crea una nueva en «Mi unidad».
 */
function crearConsolaNacional() {
  const ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.create('Consola nacional de Tesorería');
  montarConsola(ss);
  console.log('Consola lista: ' + ss.getUrl());
  return ss.getUrl();
}

function montarConsola(ss) {
  if (!esLibroDeConsola(ss)) ss.addDeveloperMetadata(CONSOLA.META, '1');
  const h = ss.getSheetByName(CONSOLA.CENTROS) || ss.insertSheet(CONSOLA.CENTROS, 0);
  h.getRange(1, 1, 1, CONSOLA.COLUMNAS.length).setValues([CONSOLA.COLUMNAS])
    .setFontWeight('bold').setBackground('#6075BB').setFontColor('#FFFFFF').setWrap(true);
  h.setFrozenRows(1);
  h.setFrozenColumns(1);
  CONSOLA.COLUMNAS.forEach((c, i) => h.setColumnWidth(i + 1, CONSOLA.ANCHOS[c] || 95));
  h.getRange(2, colConsola('Código'), Math.max(h.getMaxRows() - 1, 1), 1).setNumberFormat('@');
  ['Banco', 'Efectivo'].forEach(c => h.getRange(2, colConsola(c), Math.max(h.getMaxRows() - 1, 1), 1).setNumberFormat(CAJA.FORMATO_EUROS));
  h.getRange(2, colConsola('Actualizado'), Math.max(h.getMaxRows() - 1, 1), 1).setNumberFormat('dd/MM/yyyy HH:mm');
  h.getRange(2, colConsola('Activo'), Math.max(h.getMaxRows() - 1, 1), 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['Sí', 'No'], true).setAllowInvalid(false).build());
  h.getRange(1, colConsola('Activo')).setNote('Sí: el centro o área usa ya el libro de cuentas (piloto). Solo los activos '
    + 'entran en el estado, la creación de libros, la reparación y el informe nacional. Los que se encuentran nuevos entran como No.');
  h.getRange(1, colConsola('Código')).setNote('Código del centro en JMV España. Lo escribes tú: se lleva a la hoja Ajustes '
    + 'de cada libro al crearlo o repararlo desde aquí.');

  const a = ss.getSheetByName(CONSOLA.AJUSTES) || ss.insertSheet(CONSOLA.AJUSTES);
  if (a.getLastRow() < 1) a.getRange(1, 1, 1, 3).setValues([['Ajuste', 'Valor', 'Para qué sirve']]).setFontWeight('bold');
  const hay = a.getRange(1, 1, a.getLastRow(), 1).getValues().map(f => String(f[0]).trim());
  [[CONSOLA.ANIO, anioPropuesto('', new Date()), 'Ejercicio con el que trabaja la consola: 2026 es el «Ejercicio 26-27». '
      + 'Cámbialo en septiembre, antes de «Crear los libros que falten».'],
   [CONSOLA.PLANTILLA, '', 'Enlace del libro plantilla (con su script, DESPLIEGUE.md): se copia para los centros que no tienen '
      + 'libro del ejercicio anterior. El despliegue lo mantiene al día como a los demás.']]
    .filter(x => hay.indexOf(x[0]) < 0).forEach(x => a.appendRow(x));
  a.setColumnWidth(1, 260); a.setColumnWidth(2, 260); a.setColumnWidth(3, 520);
  ss.getSheets().forEach(x => {
    if ([CONSOLA.CENTROS, CONSOLA.AJUSTES, CONSOLA.INFORME].indexOf(x.getName()) < 0 && x.getLastRow() === 0
        && ss.getSheets().length > 1) ss.deleteSheet(x);
  });
}

function esLibroDeConsola(ss) {
  try { return !!ss && ss.getDeveloperMetadata().some(m => m.getKey() === CONSOLA.META); }
  catch (e) { return false; }
}

function colConsola(nombre) {
  const i = CONSOLA.COLUMNAS.indexOf(nombre);
  if (i < 0) throw new Error(`La consola no tiene la columna «${nombre}».`);
  return i + 1;
}

/** Un valor de «Ajustes de la consola», o ''. */
function ajusteDeConsola(ss, etiqueta) {
  const h = ss.getSheetByName(CONSOLA.AJUSTES);
  const v = h ? h.getDataRange().getValues().find(f => String(f[0]).trim() === etiqueta) : null;
  return v ? v[1] : '';
}

/** El año de inicio del ejercicio con el que trabaja la consola. */
function anioDeConsola(ss) {
  const anio = parseInt(ajusteDeConsola(ss, CONSOLA.ANIO), 10);
  return anio > 2000 && anio < 2100 ? anio : anioPropuesto('', new Date());
}

/** Las filas de Centros como objetos { _fila, Centro, Código, … }. */
function leerCentros(ss) {
  const h = ss.getSheetByName(CONSOLA.CENTROS);
  if (!h || h.getLastRow() < 2) return [];
  return h.getRange(2, 1, h.getLastRow() - 1, CONSOLA.COLUMNAS.length).getValues()
    .map((f, i) => { const o = { _fila: i + 2 }; CONSOLA.COLUMNAS.forEach((c, j) => { o[c] = f[j]; }); return o; })
    .filter(o => String(o['Unidad compartida'] || o['Libro'] || o['Centro']).trim() !== '');
}

/** Escribe en la fila de un centro las columnas de `valores` (las demás no se tocan). */
function escribirCentro(ss, fila, valores) {
  const h = ss.getSheetByName(CONSOLA.CENTROS);
  Object.keys(valores).forEach(c => h.getRange(fila, colConsola(c)).setValue(valores[c] === undefined ? '' : valores[c]));
}

/** La consola con la que se trabaja: la abierta, o la que tenga guardada un disparador. */
function consolaActiva() {
  const ss = libro();
  if (!esLibroDeConsola(ss)) throw new Error('Esto solo funciona en la consola nacional.');
  return ss;
}


// ==================================================================
// RECORRER LOS CENTROS (con límite de tiempo)
// ==================================================================

/**
 * Llama a fn(centro) para cada centro, desde donde se quedó la última vez
 * esa tarea, y escribe en su fila lo que devuelva. Para antes del límite de
 * tiempo y guarda por dónde va. Un error en un centro se apunta en su fila
 * y se sigue con el siguiente. { hechos, errores, quedan }.
 */
function recorrerCentros(ss, tarea, fn) {
  const props = PropertiesService.getUserProperties();
  const clave = `consola:${ss.getId()}:${tarea}`;
  const centros = leerCentros(ss).filter(esCentroActivo);
  let i = Math.min(parseInt(props.getProperty(clave), 10) || 0, centros.length);
  const inicio = Date.now();
  const r = { hechos: 0, errores: 0, quedan: 0 };
  for (; i < centros.length; i++) {
    if (Date.now() - inicio > CONSOLA.TIEMPO_MAX) break;
    const c = centros[i];
    try {
      const valores = fn(c);
      if (valores) escribirCentro(ss, c._fila, valores);
      r.hechos++;
    } catch (e) {
      escribirCentro(ss, c._fila, { 'Errores': '✖ ' + e.message, 'Actualizado': new Date() });
      r.errores++;
    }
    SpreadsheetApp.flush();
  }
  r.quedan = centros.length - i;
  if (r.quedan) props.setProperty(clave, String(i));
  else props.deleteProperty(clave);
  return r;
}

/** Despliegue progresivo: solo los centros con «Sí» en Activo. */
function esCentroActivo(c) { return /^s[ií]/i.test(String(c['Activo'] || '').trim()); }

function resumenDeRecorrido(r, que) {
  return `${que}: ${r.hechos} centros` + (r.errores ? `, ${r.errores} con error (columna Errores)` : '') + '.'
    + (r.quedan ? `\n\nQuedan ${r.quedan}: no ha dado tiempo. Vuelve a pulsar la misma opción y seguirá por donde iba.` : '');
}

/**
 * El libro del ejercicio `anio` de un centro, partiendo del que apunta la
 * consola: si es de un ejercicio posterior (la consola ya ha pasado al
 * siguiente), sigue su «Ejercicio anterior» en Ajustes. Así el informe de
 * cierre se puede sacar en septiembre, con los libros nuevos ya creados.
 */
function libroDelEjercicio(ss, anio) {
  for (let saltos = 0; saltos < 5; saltos++) {
    const aj = leerAjustes(ss);
    const suyo = aj.inicio ? aj.inicio.getFullYear() : NaN;
    if (suyo === anio) return ss;
    if (!(suyo > anio)) throw new Error(`Su libro es del ejercicio ${aj.ejercicio}, no del ${anio}-${anio + 1}.`);
    const anterior = idDeDrive(aj.anterior);
    if (!anterior) throw new Error(`Su libro del ${aj.ejercicio} no dice cuál es el del ejercicio anterior (Ajustes).`);
    ss = SpreadsheetApp.openById(anterior);
  }
  throw new Error(`No se encuentra su libro del ejercicio ${anio}-${anio + 1}.`);
}

/** Abre el libro de un centro, o falla con un mensaje claro. */
function libroDeCentro(c) {
  const id = idDeDrive(c['Libro']);
  if (!id) throw new Error('No tiene libro del ejercicio. «Crear los libros que falten» lo crea.');
  return SpreadsheetApp.openById(id);
}


// ==================================================================
// BUSCAR LOS CENTROS
// ==================================================================

function consolaBuscarCentros() {
  const ss = consolaActiva();
  const r = buscarCentros(ss);
  SpreadsheetApp.getUi().alert('Centros',
    `Unidades compartidas revisadas esta vez: ${r.revisadas} de ${r.unidades}. Centros y áreas con carpeta Tesorería: `
    + `${r.centros}, ${r.nuevos} nuevos en la lista (con «No» en Activo: pon «Sí» en los del piloto).\n\n`
    + `Libros del ejercicio encontrados: ${r.libros}.`
    + (r.quedan ? `\n\nQuedan ${r.quedan} unidades: no ha dado tiempo. Vuelve a pulsar la misma opción y seguirá por donde iba.` : '')
    + (r.sinTesoreria.length ? `\n\nSin carpeta Tesorería (no se cuentan como centro): ${r.sinTesoreria.slice(0, 15).join(', ')}`
      + (r.sinTesoreria.length > 15 ? '…' : '') : ''),
    SpreadsheetApp.getUi().ButtonSet.OK);
}

/**
 * Recorre las unidades compartidas que puede ver quien la ejecuta y apunta
 * en Centros las que tienen una carpeta «Tesorería» en la raíz, con su libro
 * del ejercicio. No borra filas ni pisa lo escrito a mano (Código, o un
 * enlace corregido). No busca la BD Socios (abrir hojas de cálculo en cada
 * unidad es lento y casi ningún centro la tiene): la trae «Actualizar el
 * estado» de la hoja Ajustes de cada libro. Con muchas unidades, para antes
 * del límite de tiempo y la siguiente vez sigue por donde iba.
 */
function buscarCentros(ss) {
  const anio = anioDeConsola(ss);
  const nombreLibro = nombreDeEjercicio(anio);
  const porUnidad = {};
  leerCentros(ss).forEach(c => { if (c['Unidad compartida']) porUnidad[idDeDrive(c['Unidad compartida'])] = c; });
  const props = PropertiesService.getUserProperties();
  const clave = `consola:${ss.getId()}:buscar`;
  const unidades = listarUnidades();
  let i = Math.min(parseInt(props.getProperty(clave), 10) || 0, unidades.length);
  const r = { unidades: unidades.length, revisadas: 0, centros: 0, nuevos: 0, libros: 0, sinTesoreria: [], quedan: 0 };
  const h = ss.getSheetByName(CONSOLA.CENTROS);
  let siguiente = Math.max(h.getLastRow(), 1) + 1;
  const inicio = Date.now();

  for (; i < unidades.length; i++) {
    if (Date.now() - inicio > CONSOLA.TIEMPO_MAX) break;
    if (i % 10 === 0) ss.toast(`Unidad ${i + 1} de ${unidades.length}…`, 'Buscando centros', 20);
    const u = unidades[i];
    r.revisadas++;
    const tes = carpetaDeTesoreria(u.id);
    if (!tes) { r.sinTesoreria.push(u.name); continue; }
    r.centros++;
    let c = porUnidad[u.id];
    const valores = {};
    if (!c) {
      c = { _fila: siguiente++ };
      porUnidad[u.id] = c;
      r.nuevos++;
      valores['Centro'] = u.name;
      valores['Activo'] = 'No';
      valores['Unidad compartida'] = u.id;
    }
    if (!c['Carpeta Tesorería']) valores['Carpeta Tesorería'] = `https://drive.google.com/drive/folders/${tes.id}`;
    const libroId = buscarEnCarpeta(tes.id, nombreLibro);
    if (libroId) {
      valores['Libro'] = `https://docs.google.com/spreadsheets/d/${libroId}/edit`;
      valores['Ejercicio'] = `${anio}-${anio + 1}`;
      r.libros++;
    }
    escribirCentro(ss, c._fila, valores);
  }
  r.quedan = unidades.length - i;
  if (r.quedan) props.setProperty(clave, String(i));
  else props.deleteProperty(clave);
  return r;
}

/** Las unidades compartidas visibles para quien ejecuta: [{ id, name }]. */
function listarUnidades() {
  const todas = [];
  let token;
  do {
    const p = Drive.Drives.list({ pageSize: 100, pageToken: token, fields: 'nextPageToken,drives(id,name)' });
    (p.drives || []).forEach(d => todas.push(d));
    token = p.nextPageToken;
  } while (token);
  return todas.sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

/** La carpeta «Tesorería» en la raíz de una unidad compartida, o null. */
function carpetaDeTesoreria(idUnidad) {
  const r = Drive.Files.list({ q: `'${idUnidad}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    corpora: 'drive', driveId: idUnidad, includeItemsFromAllDrives: true, supportsAllDrives: true,
    pageSize: 100, fields: 'files(id,name)' });
  return (r.files || []).find(f => normalizarTexto(f.name) === 'TESORERIA') || null;
}

/** El ID de la hoja de cálculo de esa carpeta que se llama así (sin mayúsculas ni tildes), o ''. */
function buscarEnCarpeta(idCarpeta, nombre) {
  const r = Drive.Files.list({ q: `'${idCarpeta}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
    includeItemsFromAllDrives: true, supportsAllDrives: true, pageSize: 100, fields: 'files(id,name)' });
  const f = (r.files || []).find(x => normalizarTexto(x.name) === normalizarTexto(nombre));
  return f ? f.id : '';
}


// ==================================================================
// ESTADO, CREAR Y REPARAR
// ==================================================================

function consolaActualizarEstado() {
  const ss = consolaActiva();
  SpreadsheetApp.getActiveSpreadsheet().toast('Abriendo los libros de los centros…', 'Consola', 10);
  SpreadsheetApp.getUi().alert('Estado de los centros', resumenDeRecorrido(recorrerCentros(ss, 'estado', estadoDeCentro),
    'Actualizados'), SpreadsheetApp.getUi().ButtonSet.OK);
}

/** Lo que se ve de un centro en la consola, leído de su libro. */
function estadoDeCentro(c) {
  const ss = libroDeCentro(c);
  return conLibro(ss, () => {
    const aj = leerAjustes(ss);
    const r = resumenDelLibro(leerCaja(ss), saldosIniciales(ss), aj);
    const diag = diagnosticoDelLibro(ss, {});
    const errores = diag.filter(x => x.charAt(0) === '✖').map(x => x.slice(2));
    return { 'Ejercicio': aj.ejercicio, 'Estructura': parseInt(mapaDeAjustes()[AJUSTES.VERSION], 10) || 0,
      'Programa': String(mapaDeAjustes()[AJUSTES.PROGRAMA] || '').trim(),
      'BD Socios': config('ID_BD_SOCIOS') ? `https://docs.google.com/spreadsheets/d/${config('ID_BD_SOCIOS')}/edit` : '',
      'Banco': r.saldos.banco, 'Efectivo': r.saldos.efectivo, 'Último extracto': aj.ultimoExtracto,
      'Pendientes': r.pendientes, 'Por completar': r.completar, 'Sin factura': r.facturas, 'Sin partida': r.sinPartida,
      'Errores': errores.length ? `✖ ${errores.length}: ${errores[0]}` : '✔',
      'Avisos': diag.filter(x => x.charAt(0) === '⚠').length, 'Actualizado': new Date() };
  });
}

function consolaCrearLibros() {
  const ss = consolaActiva();
  const ui = SpreadsheetApp.getUi();
  const anio = anioDeConsola(ss);
  const faltan = leerCentros(ss).filter(esCentroActivo)
    .filter(c => !c['Libro'] || String(c['Ejercicio']).trim() !== `${anio}-${anio + 1}`);
  if (!faltan.length) { ui.alert(`Todos los centros activos tienen ya su libro del ejercicio ${anio}-${anio + 1}. `
    + 'Para añadir uno al piloto, pon «Sí» en su columna Activo.'); return; }
  const r0 = ui.alert('Crear los libros que faltan',
    `Se creará el libro «${nombreDeEjercicio(anio)}» de ${faltan.length} centros activos (${faltan.map(c => c['Centro']).join(', ')}), `
    + 'en su carpeta Tesorería:\n\n'
    + '• si tienen el del ejercicio anterior, como su continuación (mismas partidas y configuración, con sus saldos finales '
    + 'como iniciales);\n• si no, uno nuevo vacío.\n\n¿Sigo?', ui.ButtonSet.YES_NO);
  if (r0 !== ui.Button.YES) return;
  const r = recorrerCentros(ss, 'crear-' + anio, c => crearLibroDeCentro(c, anio));
  ui.alert('Libros del ejercicio', resumenDeRecorrido(r, 'Revisados'), ui.ButtonSet.OK);
}

/** Crea (si falta) el libro del ejercicio `anio` de un centro. */
function crearLibroDeCentro(c, anio) {
  if (c['Libro'] && String(c['Ejercicio']).trim() === `${anio}-${anio + 1}`) return null;
  const carpeta = idDeDrive(c['Carpeta Tesorería']);
  if (!carpeta) throw new Error('No se sabe cuál es su carpeta Tesorería: «Buscar los centros».');
  const existente = buscarEnCarpeta(carpeta, nombreDeEjercicio(anio));
  // Una hoja con ese nombre que no es un libro de cuentas (hecha a mano, sin
  // la estructura ni el programa) no se adopta: hay que apartarla.
  if (existente && !SpreadsheetApp.openById(existente).getSheetByName(HOJAS.AJUSTES)) {
    throw new Error(`En su carpeta Tesorería hay una hoja «${nombreDeEjercicio(anio)}» que no es un libro de cuentas. `
      + 'Cámbiale el nombre (por ejemplo, añadiendo «(antiguo)»), vacía aquí Libro y Ejercicio y vuelve a crear los libros.');
  }
  let id = existente, como = 'ya existía';
  if (!id) {
    const anterior = buscarEnCarpeta(carpeta, nombreDeEjercicio(anio - 1));
    if (anterior) {
      id = ejercicioSiguiente(SpreadsheetApp.openById(anterior)).id;
      como = 'continuación del anterior';
    } else {
      // Un libro sin script no sirve: se copia la plantilla, que lleva el suyo.
      const plantilla = idDeDrive(ajusteDeConsola(consolaActiva(), CONSOLA.PLANTILLA));
      if (!plantilla) throw new Error(`No tiene libro del ejercicio anterior y falta «${CONSOLA.PLANTILLA}» en Ajustes de la consola.`);
      const copia = DriveApp.getFileById(plantilla).makeCopy(nombreDeEjercicio(anio), DriveApp.getFolderById(carpeta));
      const nuevo = SpreadsheetApp.openById(copia.getId());
      conLibro(nuevo, () => prepararEjercicioNuevo(nuevo, { anio: anio, anterior: '', saldos: { banco: '', efectivo: '' }, otroCentro: true }));
      repararLibro(nuevo);
      id = nuevo.getId();
      como = 'nuevo, desde la plantilla';
    }
  }
  const ss = SpreadsheetApp.openById(id);
  llevarDatosDeConsola(ss, c);
  return { 'Libro': ss.getUrl(), 'Ejercicio': `${anio}-${anio + 1}`, 'Errores': `Libro ${como}.`, 'Actualizado': new Date() };
}

/** Lo que manda la consola en Ajustes del libro: el código, y lo que el libro aún no tenga. */
function llevarDatosDeConsola(ss, c) {
  conLibro(ss, () => {
    const poner = (clave, valor, siempre) => {
      if (!valor) return;
      if (siempre || !config(clave)) escribirAjuste(ss, CONFIG_EN_AJUSTES[clave][0], valor, CONFIG_EN_AJUSTES[clave][1]);
    };
    poner('CODIGO_CENTRO', String(c['Código'] || '').trim(), true);
    poner('NOMBRE_CENTRO', String(c['Centro'] || '').trim(), false);
    poner('ID_BD_SOCIOS', String(c['BD Socios'] || '').trim(), false);
  });
}

/**
 * La lista de programas (scripts de los libros activos del ejercicio, la
 * plantilla y la propia consola) para `node despliegue/desplegar.js`
 * (DESPLIEGUE.md). Se copia en despliegue/proyectos.txt.
 */
function consolaListaDeProgramas() {
  const ss = consolaActiva();
  const lineas = programasParaDesplegar(ss);
  const html = HtmlService.createHtmlOutput('<div style="font-family:Arial,sans-serif;font-size:13px">'
    + '<p>Copia esto en <code>despliegue/proyectos.txt</code> y ejecuta <code>node despliegue/desplegar.js</code>. '
    + 'Antes, «Actualizar el estado»: el programa de cada libro se recoge ahí.</p>'
    + '<textarea style="width:100%;height:330px;font-family:monospace;font-size:12px" readonly onclick="this.select()">'
    + lineas.join('\n').replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</textarea></div>').setWidth(720).setHeight(440);
  SpreadsheetApp.getUi().showModalDialog(html, 'Programas para desplegar');
}

/** Líneas «ID  # quién», y comentarios para los libros que aún no han apuntado su programa. */
function programasParaDesplegar(ss) {
  const anio = anioDeConsola(ss);
  const lineas = [`# Programas del ejercicio ${anio}-${anio + 1} · ${fechaCorta(new Date())}`,
    `${ScriptApp.getScriptId()}  # Consola nacional`];
  const plantilla = idDeDrive(ajusteDeConsola(ss, CONSOLA.PLANTILLA));
  if (plantilla) {
    try {
      const p = SpreadsheetApp.openById(plantilla);
      const id = conLibro(p, () => String(mapaDeAjustes()[AJUSTES.PROGRAMA] || '').trim());
      lineas.push(id ? `${id}  # Libro plantilla` : '# Libro plantilla: ábrelo una vez para que apunte su programa');
    } catch (e) { lineas.push('# Libro plantilla: no se puede abrir (' + e.message + ')'); }
  }
  leerCentros(ss).filter(esCentroActivo).forEach(c => {
    const quien = `${c['Centro']} · ${c['Ejercicio'] || '¿ejercicio?'}`;
    if (String(c['Ejercicio']).trim() !== `${anio}-${anio + 1}`) lineas.push(`# ${quien}: no tiene libro de este ejercicio`);
    else if (!String(c['Programa'] || '').trim()) lineas.push(`# ${quien}: nadie ha abierto aún su libro (o falta «Actualizar el estado»)`);
    else lineas.push(`${String(c['Programa']).trim()}  # ${quien}`);
  });
  return lineas;
}

function consolaRepararTodos() {
  const ss = consolaActiva();
  const ui = SpreadsheetApp.getUi();
  const r0 = ui.alert('Reparar todos los libros',
    'Se pondrá al día la estructura (fórmulas, formatos, desplegables, protecciones, partidas comunes) de los libros de '
    + 'todos los centros. No se toca ningún dato.\n\nMientras se repara un libro, Sheets lo recarga: si alguien lo tiene '
    + 'abierto con una ventana de Tesorería, la perderá. Mejor a una hora sin uso. ¿Sigo?', ui.ButtonSet.YES_NO);
  if (r0 !== ui.Button.YES) return;
  const r = recorrerCentros(ss, 'reparar', c => {
    const libroCentro = libroDeCentro(c);
    repararLibro(libroCentro);
    llevarDatosDeConsola(libroCentro, c);
    return estadoDeCentro(c);
  });
  ui.alert('Reparar todos', resumenDeRecorrido(r, 'Reparados'), ui.ButtonSet.OK);
}


// ==================================================================
// INFORME NACIONAL
// ==================================================================

function consolaInformeNacional() {
  const ss = consolaActiva();
  const ui = SpreadsheetApp.getUi();
  const anioConsola = anioDeConsola(ss);
  const fin = new Date(anioConsola + 1, 7, 31);
  const hoy = new Date();
  const propuesta = hoy < fin ? hoy : fin;
  const p = ui.prompt('Informe nacional', `Fecha de corte (dd/mm/aaaa). Vacío: ${fechaCorta(propuesta)}.\n\n`
    + `La fecha decide el ejercicio: el ${fechaCorta(new Date(anioConsola, 7, 31))} da el informe de cierre del `
    + `${anioConsola - 1}-${anioConsola}, aunque la consola ya esté en el ${anioConsola}-${anioConsola + 1}.`, ui.ButtonSet.OK_CANCEL);
  if (p.getSelectedButton() !== ui.Button.OK) return;
  const corte = p.getResponseText().trim() ? fechaDeTexto(p.getResponseText()) : propuesta;
  if (!corte) { ui.alert('Esa fecha no es válida.'); return; }
  // El ejercicio de la fecha (septiembre a agosto), no el de la consola.
  const anio = anioPropuesto('', corte);
  const r = informeNacional(ss, anio, new Date(corte.getFullYear(), corte.getMonth(), corte.getDate(), 23, 59, 59));
  ss.setActiveSheet(ss.getSheetByName(CONSOLA.INFORME));
  ui.alert('Informe nacional', resumenDeRecorrido(r, 'Centros sumados'), ui.ButtonSet.OK);
}

/**
 * Rellena la hoja Informe nacional: una fila por concepto
 * (filasDelInformeNacional()), una columna por centro y el total. Si no da
 * tiempo, la siguiente vez sigue (las columnas ya escritas se quedan).
 */
function informeNacional(ss, anio, corte) {
  const filas = filasDelInformeNacional();
  const centros = leerCentros(ss).filter(esCentroActivo);
  const props = PropertiesService.getUserProperties();
  const clave = `consola:${ss.getId()}:informe`;
  const marca = `${anio}|${fechaCompacta(corte)}`;
  let h = ss.getSheetByName(CONSOLA.INFORME);
  const empezar = props.getProperty(clave + ':marca') !== marca || !h;
  if (empezar) {
    if (!h) h = ss.insertSheet(CONSOLA.INFORME);
    h.clear();
    h.getRange(1, 1).setValue(`Informe nacional · Ejercicio ${anio}-${anio + 1} · movimientos hasta el ${fechaCorta(corte)} `
      + '(criterio de caja) · sin las transferencias pendientes').setFontWeight('bold');
    const cab = ['Concepto'].concat(centros.map(c => c['Centro'] || c['Código'] || '¿?'), ['Total']);
    h.getRange(3, 1, 1, cab.length).setValues([cab]).setFontWeight('bold').setBackground('#6075BB').setFontColor('#FFFFFF').setWrap(true);
    h.getRange(4, 1, filas.length, 1).setValues(filas.map(f => [f.etiqueta]));
    filas.forEach((f, i) => { if (f.titulo) h.getRange(4 + i, 1, 1, cab.length).setFontWeight('bold').setBackground('#EEF0F8'); });
    h.setColumnWidth(1, 320);
    h.setFrozenRows(3); h.setFrozenColumns(1);
    props.setProperty(clave + ':marca', marca);
    props.deleteProperty(`consola:${ss.getId()}:informe-centros`);
  }
  const r = recorrerCentros(ss, 'informe-centros', c => {
    const libroCentro = libroDelEjercicio(libroDeCentro(c), anio);
    const v = conLibro(libroCentro, () => {
      return valoresDelInformeNacional(resumenNacional(leerCaja(libroCentro), leerPartidas(libroCentro), saldosIniciales(libroCentro), corte));
    });
    const col = 2 + centros.findIndex(x => x._fila === c._fila);
    h.getRange(4, col, filas.length, 1).setValues(filas.map(f => [f.titulo ? '' : (v[f.clave] || 0)]));
    return null;
  });
  if (!r.quedan) {
    // Total: la suma de las columnas de los centros (valores, no fórmulas).
    const n = centros.length;
    if (n) {
      const datos = h.getRange(4, 2, filas.length, n).getValues();
      h.getRange(4, n + 2, filas.length, 1).setValues(datos.map((f, i) => [filas[i].titulo ? ''
        : redondear(f.reduce((t, x) => t + (Number(x) || 0), 0))]));
    }
    h.getRange(4, 2, filas.length, n + 1).setNumberFormat(CAJA.FORMATO_EUROS);
    props.deleteProperty(clave + ':marca');
  }
  return r;
}

/** Las filas del informe nacional: [{ clave, etiqueta, titulo }]. Pura. */
function filasDelInformeNacional() {
  const comunes = partidasComunes();
  const f = [{ etiqueta: 'Saldos a la fecha', titulo: true },
    { clave: 'banco', etiqueta: 'Banco' }, { clave: 'efectivo', etiqueta: 'Efectivo' }, { clave: 'total', etiqueta: 'Total' },
    { etiqueta: 'Ingresos (real)', titulo: true }];
  comunes.filter(p => p.lado === 'I').forEach(p => f.push({ clave: 'I:' + p.codigo, etiqueta: `${p.codigo} · ${p.descripcion}` }));
  f.push({ clave: 'realI', etiqueta: 'Total ingresos' }, { etiqueta: 'Gastos (real)', titulo: true });
  comunes.filter(p => p.lado === 'G').forEach(p => f.push({ clave: 'G:' + p.codigo, etiqueta: `${p.codigo} · ${p.descripcion}` }));
  f.push({ clave: 'realG', etiqueta: 'Total gastos' },
    { etiqueta: 'Resultado', titulo: true },
    { clave: 'resultado', etiqueta: 'Ingresos − gastos' },
    { clave: 'sinPartida', etiqueta: 'Asientos sin partida (no están arriba)' },
    { etiqueta: 'Presupuesto', titulo: true },
    { clave: 'presI', etiqueta: 'Ingresos presupuestados' }, { clave: 'presG', etiqueta: 'Gastos presupuestados' });
  return f;
}

/** resumenNacional() de un centro → { clave de filasDelInformeNacional(): valor }. Pura. */
function valoresDelInformeNacional(r) {
  const v = { banco: r.saldos.banco, efectivo: r.saldos.efectivo, total: r.saldos.total,
    realI: r.totales.realI, realG: r.totales.realG, resultado: redondear(r.totales.realI - r.totales.realG),
    sinPartida: r.sinPartida, presI: r.totales.presI, presG: r.totales.presG };
  Object.keys(r.ingresos).forEach(k => { v['I:' + k] = r.ingresos[k].real; });
  Object.keys(r.gastos).forEach(k => { v['G:' + k] = r.gastos[k].real; });
  return v;
}


// ==================================================================
// CADA NOCHE
// ==================================================================

/** Instala la actualización del estado cada noche (de 3 a 4) para ESTA consola. */
function consolaInstalarActualizacion() {
  const ss = consolaActiva();
  disparadoresDelLibro(ss, 'consolaActualizacionNocturna').forEach(t => {
    PropertiesService.getUserProperties().deleteProperty('libro:' + t.getUniqueId());
    ScriptApp.deleteTrigger(t);
  });
  const t = ScriptApp.newTrigger('consolaActualizacionNocturna').timeBased().atHour(3).everyDays(1).create();
  PropertiesService.getUserProperties().setProperty('libro:' + t.getUniqueId(), ss.getId());
  SpreadsheetApp.getUi().alert('Listo: cada noche se actualizará el estado de los centros. Si no da tiempo a todos, '
    + 'la noche siguiente sigue por donde iba.');
}

/** Disparador nocturno: no hay libro abierto, se abre la consola guardada al instalarlo. */
function consolaActualizacionNocturna(e) {
  const id = e && e.triggerUid ? PropertiesService.getUserProperties().getProperty('libro:' + e.triggerUid) : '';
  if (!id) return;
  const ss = SpreadsheetApp.openById(id);
  conLibro(ss, () => recorrerCentros(ss, 'estado', estadoDeCentro));
}
