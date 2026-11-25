/*******************************************************************
 * JMV — TESORERÍA · Estructura del libro de un ejercicio
 *
 * Un Google Sheet por ejercicio económico ("Ejercicio 26-27", del 1 de
 * septiembre al 31 de agosto). Hojas:
 *
 *   Caja         el libro de asientos. Lo único que se escribe a diario.
 *   Presupuesto  partidas IXY / GXY con su importe presupuestado.
 *   Cuentas      lo mismo con los importes reales: solo fórmulas.
 *   Act · …      una hoja por actividad (04_Actividades.js).
 *   Ajustes      lo que cambia cada ejercicio: fechas, curso, partidas
 *                de cuotas.
 *   Log          auditoría de importaciones y sincronizaciones.
 *   _Listas      (oculta) listas de los desplegables.
 *
 * crearEstructura() es idempotente: una hoja que ya existe no se toca.
 * repararEstructura() vuelve a poner fórmulas de cabecera, formatos,
 * validaciones y protecciones SIN tocar datos.
 *******************************************************************/

const HOJAS = {
  CAJA: 'Caja',
  PRESUPUESTO: 'Presupuesto',
  CUENTAS: 'Cuentas',
  AJUSTES: 'Ajustes',
  LOG: 'Log',
  LISTAS: '_Listas'
};

/** Las cuatro secciones del presupuesto. La X de IXY/GXY es su número. */
const SECCIONES = ['1. Operaciones', '2. Actividades', '3. Financiación', '4. Donaciones'];

const CAJA = {
  FILA_CABECERA: 3,
  PRIMERA_FILA: 4,

  // El orden importa: Cuentas, las hojas de actividad y la fórmula del
  // saldo se refieren a las columnas por su letra. No se insertan
  // columnas en Caja; las columnas libres están en las hojas de
  // actividad.
  COLUMNAS: [
    'ID Transacción', 'Fecha', 'Concepto Banco', 'Descripción', 'Partida',
    'Subpartida', 'ID socio', 'Proveedor', 'CIF proveedor', 'Cantidad',
    'Saldo', 'Factura', 'Método de pago', 'Cuenta de abono', 'Titular',
    'Fecha de pago',
    // Técnicas, las escribe el script:
    'Saldo extracto',  // saldo que dice el banco tras ese movimiento
    'BD Socios',       // qué se ha hecho con la cuota en BD Socios
    'Huella extracto', // identifica el movimiento del banco (oculta)
    // De las transferencias apuntadas desde la ventana de asientos: lo
    // que hay que escribir en el concepto de la transferencia en la app
    // del banco. Empieza siempre por el ID del asiento, que es lo que
    // permite reconocerla luego en el extracto (02_Extractos.js). Va al
    // final para no mover ninguna letra.
    'Asunto transferencia'
  ],

  ANCHOS: {
    'ID Transacción': 115, 'Fecha': 95, 'Concepto Banco': 320, 'Descripción': 240,
    'Partida': 75, 'Subpartida': 90, 'ID socio': 110, 'Proveedor': 170,
    'CIF proveedor': 105, 'Cantidad': 95, 'Saldo': 100, 'Factura': 200,
    'Método de pago': 125, 'Cuenta de abono': 190, 'Titular': 160,
    'Fecha de pago': 95, 'Saldo extracto': 100, 'BD Socios': 260, 'Huella extracto': 120,
    'Asunto transferencia': 260
  },

  // Una fila es de la caja de efectivo si su método de pago es este. El
  // resto mueve la cuenta del banco.
  EFECTIVO: 'Efectivo',
  METODOS: ['Transferencia', 'Tarjeta', 'Bizum', 'Domiciliación', 'Ingreso en cajero',
            'Retirada en cajero', 'Cargo bancario', 'Efectivo', 'Otro'],

  // Pseudopartida para mover dinero entre banco y efectivo (ingresar en
  // el banco lo cobrado en mano, sacar del cajero). Son dos filas: la del
  // banco y la de efectivo, con importes contrarios. No es ingreso ni
  // gasto: Cuentas no la cuenta y comprueba que sus patas sumen 0.
  // Ver «TRASPASOS» en 02_Extractos.js.
  TRASPASO: 'Traspaso',

  // Pseudopartida para lo que llega al banco en este ejercicio pero ya
  // está contado en el saldo inicial (cobros y pagos pendientes del
  // ejercicio anterior; algo excepcional). Este ejercicio lo IGNORA del
  // todo: no mueve el saldo, no cuenta en Cuentas ni en informes y no se
  // sincroniza con BD Socios. La fila se queda en Caja solo para que el
  // importador no la vuelva a meter y para que la comparación con el
  // banco pueda compensarla mientras no ha llegado (el saldo del banco
  // = saldo de Caja − lo de «Ejercicio anterior» que aún no ha entrado).
  EJERCICIO_ANTERIOR: 'Ejercicio anterior',

  // Valor de «Fecha de pago» de un pago ordenado que aún no ha salido del
  // banco (las transferencias apuntadas desde la ventana de asientos).
  // Decisión de tesorería: cuenta en Cuentas y en las hojas de actividad
  // (es gasto comprometido) pero NO en el saldo ni en los informes a
  // fecha (criterio de caja). Al importar el extracto que la trae, se
  // reconoce por el ID en el concepto y toma la fecha del banco.
  PENDIENTE: 'Pendiente',

  // Valor de «Factura» de un gasto que por su naturaleza no lleva factura
  // (decisión de tesorería): movimientos entre cuentas de JMV y
  // devoluciones a familias o particulares. Se marca en la ventana de
  // asientos o se escribe a mano: basta con que empiece por «No requiere»
  // (noRequiereFactura()). Cuenta como si tuviera factura: no sale en
  // «Facturas que faltan», ni en amarillo, ni en «Pagos sin factura».
  SIN_FACTURA: 'No requiere',
  MOTIVOS_SIN_FACTURA: ['Movimiento entre cuentas de JMV', 'Devolución a una familia o particular'],

  // Los desplegables de Partida y Subpartida ofrecen «G21 · Convivencia»
  // para poder buscar por el nombre; al elegir, onEdit deja solo el
  // código (codigoDeOpcion()). Por eso los códigos solos también están
  // en la lista, al final: si no, la celda con «G21» sería no válida.
  SEPARADOR_OPCION: ' · ',

  FORMATO_EUROS: '#,##0.00 "€";-#,##0.00 "€"',
  FORMATO_FECHA: 'dd/MM/yyyy'
};

/** Número de columna (1-based) de una columna de Caja, por su nombre. */
function colCaja(nombre) {
  const i = CAJA.COLUMNAS.indexOf(nombre);
  if (i < 0) throw new Error(`Caja no tiene la columna "${nombre}".`);
  return i + 1;
}

/** Letra de una columna de Caja, por su nombre ("Cantidad" → "J"). */
function letraCaja(nombre) { return letraDeColumna(colCaja(nombre)); }

function letraDeColumna(n) {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

const PRESUPUESTO = {
  // Presupuesto y Cuentas tienen la tabla de partidas en las mismas filas,
  // para poder compararlas de un vistazo.
  FILA_CABECERA: 10,
  PRIMERA_FILA: 11,
  CABECERA: ['Partida ingresos', 'Sección', 'Descripción', 'Importe presupuestado',
             'Partida gastos', 'Sección', 'Descripción', 'Importe presupuestado'],

  // Siembra del primer ejercicio y, a la vez, el PLAN DE PARTIDAS COMÚN de
  // JMV España (09_Nacional.js): todos los centros las tienen, con el mismo
  // código, y el informe nacional suma por ellas. Las de cada centro
  // (actividades, campañas: I23, G32…) se añaden encima, también a mitad
  // de curso, y en el informe nacional cuentan en la común de su sección
  // (NACIONAL.POR_DEFECTO). Cambiar esta lista cambia el plan de todos los
  // centros: es una decisión del equipo nacional.
  INGRESOS: [
    ['I11', 'Cuotas infantiles (10-15)'],
    ['I12', 'Cuotas PD (16-30)'],
    ['I13', 'Cuotas adultos (31+)'],
    ['I14', 'Otros ingresos de operaciones'],
    ['I21', 'Actividades de centro'],
    ['I22', 'Actividades JMV externas'],
    ['I31', 'Campañas de financiación'],
    ['I41', 'Donaciones recibidas']
  ],
  GASTOS: [
    ['G11', 'Cuota ECN'],
    ['G12', 'Material'],
    ['G13', 'Gastos operativos'],
    ['G21', 'Actividades de centro'],
    ['G22', 'Actividades JMV externas'],
    ['G31', 'Campañas de financiación'],
    ['G41', 'Donaciones realizadas']
  ]
};

/** Código de partida válido: I o G, sección 1-4, número de partida. */
const PATRON_PARTIDA = /^[IG][1-4]\d+$/;

const AJUSTES = {
  EJERCICIO: 'Ejercicio',
  INICIO: 'Fecha de inicio',
  FIN: 'Fecha de fin',
  CURSO: 'Curso en BD Socios',
  ANTERIOR: 'Ejercicio anterior (ID del archivo)',
  ULTIMO_EXTRACTO: 'Último extracto importado',
  PREFIJO_TRAMO: 'Partida de cuotas, tramo ',
  // Tramos de BD Socios (pestaña Cuotas) → partida de ingresos.
  TRAMOS_POR_DEFECTO: [['10-15', 'I11'], ['16-30', 'I12'], ['31+', 'I13']],
  VERSION: 'Versión de la estructura',
  PROGRAMA: 'Programa (ID del script)'
};

/**
 * Lo propio de cada centro. Antes estaba en Config.js (un archivo por
 * instalación); ahora el código es el mismo en todos los centros (se
 * despliega igual a todos los libros), así que vive en la hoja Ajustes de
 * cada libro, que se copia sola al ejercicio siguiente. Clave de config() → [fila de Ajustes, para qué
 * sirve]. Casi todo se rellena solo (completarConfiguracion()).
 */
const CONFIG_EN_AJUSTES = {
  NOMBRE_CENTRO: ['Centro', 'Nombre del centro, para los informes. Vacío: el de la unidad compartida.'],
  CODIGO_CENTRO: ['Código del centro', 'Código del centro en JMV España, para los informes.'],
  ID_BD_SOCIOS: ['BD Socios (archivo)', 'Enlace o ID de la base de datos de socios. Vacío: se busca en la unidad compartida.'],
  CARPETA_FACTURAS: ['Carpeta de facturas', 'Enlace o ID. Vacío: la carpeta «Facturas» junto a este libro (se crea si no está).'],
  CARPETA_EXTRACTOS: ['Carpeta de extractos', 'Enlace o ID. Vacío: la carpeta «Extractos» junto a este libro (se crea si no está).'],
  CARPETA_INFORMES: ['Carpeta de informes', 'Enlace o ID. Vacío: la carpeta «Memorias» junto a este libro (se crea si no está).'],
  IBAN_CUENTA: ['IBAN de la cuenta', 'Lo pone el primer extracto importado. Evita importar el de otra cuenta.'],
  TITULAR_CUENTA: ['Titular de la cuenta', 'Lo pone el primer extracto importado. Sirve para reconocer los ingresos de la propia asociación.'],
  LOGO_INFORME: ['Logo de los informes', 'Opcional: enlace o ID de una imagen PNG o JPG en Drive.']
};

/**
 * Versión de la estructura del libro (columnas, fórmulas, validaciones,
 * listas). Súbela cuando cambie algo de montar*(): el Diagnóstico y la
 * consola avisan de los libros que tienen una menor, y «Reparar» los pone
 * al día. El código lo sube el despliegue (DESPLIEGUE.md); la estructura de cada
 * libro, no.
 */
const VERSION_ESTRUCTURA = 4;

/** Prefijo de las protecciones que pone este script: así se reconocen. */
const PROTECCION = 'Tesorería: ';


// ==================================================================
// EL LIBRO CON EL QUE SE TRABAJA
//
// Casi siempre, el que está abierto. Pero la consola central trabaja con
// libros que no están abiertos (y en un disparador de complemento no hay
// libro activo): los abre por su ID y los fija con conLibro().
// ==================================================================

const CONTEXTO = { libro: null, ajustes: null, protegidas: null };

function libro() { return CONTEXTO.libro || SpreadsheetApp.getActiveSpreadsheet(); }

/**
 * El bloqueo para importar, sincronizar o guardar asientos: el del
 * documento (en un complemento, el del script sería uno solo para todos los
 * centros). Si no hay documento, el del script.
 */
function bloqueo() { return LockService.getDocumentLock() || LockService.getScriptLock(); }

/** Ejecuta fn con `ss` como libro de trabajo. */
function conLibro(ss, fn) {
  const antes = CONTEXTO.libro;
  CONTEXTO.libro = ss;
  CONTEXTO.ajustes = null;
  try { return fn(ss); }
  finally { CONTEXTO.libro = antes; CONTEXTO.ajustes = null; }
}


// ==================================================================
// CONFIGURACIÓN DEL CENTRO (hoja Ajustes)
// ==================================================================

/**
 * Valores fijos para las pruebas en Node y las capturas, que no tienen hoja
 * Ajustes. En Apps Script se queda vacío.
 */
const CONFIG_FIJA = {};

/** Un valor de la configuración del centro, o '' si no está. Nunca falla. */
function config(clave) {
  if (CONFIG_FIJA[clave] !== undefined) return String(CONFIG_FIJA[clave]).trim();
  const fila = CONFIG_EN_AJUSTES[clave];
  let v = '';
  try { if (fila) v = String(mapaDeAjustes()[fila[0]] || '').trim(); } catch (e) { v = ''; }
  if (!v) v = configAntigua(clave);
  return /^(ID_BD_SOCIOS|CARPETA_|LOGO_)/.test(clave) ? idDeDrive(v) : v;
}

/**
 * Config.js de la primera instalación. Solo sirve para pasar sus valores a
 * Ajustes la primera vez que se repara el libro (completarConfiguracion()).
 * El despliegue nunca lo lleva.
 */
function configAntigua(clave) {
  try { return (CONFIG && CONFIG[clave]) ? String(CONFIG[clave]).trim() : ''; }
  catch (e) { return ''; }   // ReferenceError: no hay Config.js
}

/** «https://drive.google.com/drive/folders/1AbC…?usp=…» o el ID suelto → el ID. Pura. */
function idDeDrive(v) {
  const t = String(v || '').trim();
  const m = t.match(/\/(?:d|folders)\/([-\w]{20,})/) || t.match(/[?&]id=([-\w]{20,})/) || t.match(/^([-\w]{20,})$/);
  return m ? m[1] : t;
}

/** Ajustes como { etiqueta: valor }, leído una vez por ejecución. */
function mapaDeAjustes() {
  if (CONTEXTO.ajustes) return CONTEXTO.ajustes;
  const h = libro().getSheetByName(HOJAS.AJUSTES);
  const mapa = {};
  if (h && h.getLastRow() > 1) h.getRange(2, 1, h.getLastRow() - 1, 2).getValues()
    .forEach(f => { mapa[String(f[0]).trim()] = f[1]; });
  CONTEXTO.ajustes = mapa;
  return mapa;
}

/**
 * Rellena en Ajustes lo que falte de la configuración del centro, sin
 * tocar lo que ya tenga: lo de un Config.js antiguo, el nombre de la unidad
 * compartida, las carpetas de Tesorería junto al libro (creándolas si no
 * están) y la base de socios de la misma unidad. Devuelve qué ha puesto.
 */
function completarConfiguracion(ss) {
  const puesto = [];
  const poner = (clave, valor, como) => {
    if (!valor) return;
    escribirAjuste(ss, CONFIG_EN_AJUSTES[clave][0], valor, CONFIG_EN_AJUSTES[clave][1]);
    puesto.push(`${CONFIG_EN_AJUSTES[clave][0]}: ${como || valor}`);
  };
  const tiene = clave => conLibro(ss, () => !!config(clave));
  const vacia = clave => conLibro(ss, () => !String(mapaDeAjustes()[CONFIG_EN_AJUSTES[clave][0]] || '').trim());

  // 1. Lo que hubiera en un Config.js de la primera instalación.
  Object.keys(CONFIG_EN_AJUSTES).forEach(k => { if (vacia(k) && configAntigua(k)) poner(k, configAntigua(k), 'de Config.js'); });

  // 2. Lo que se deduce de dónde está el libro.
  let info = null;
  try { info = Drive.Files.get(ss.getId(), { fields: 'driveId,parents', supportsAllDrives: true }); }
  catch (e) { return puesto; }   // sin el servicio de Drive no se puede deducir nada más
  if (info.driveId && !tiene('NOMBRE_CENTRO')) {
    try { poner('NOMBRE_CENTRO', Drive.Drives.get(info.driveId).name); } catch (e) { /* sin acceso a la unidad */ }
  }
  const padre = info.parents && info.parents[0] ? DriveApp.getFolderById(info.parents[0]) : null;
  if (padre) {
    [['CARPETA_FACTURAS', ['Facturas']], ['CARPETA_EXTRACTOS', ['Extractos']], ['CARPETA_INFORMES', ['Memorias', 'Informes']]]
      .forEach(x => {
        if (tiene(x[0])) return;
        const carpeta = carpetaHermana(padre, x[1]);
        poner(x[0], carpeta.getUrl(), `«${carpeta.getName()}»`);
      });
  }
  if (info.driveId && !tiene('ID_BD_SOCIOS')) {
    const bd = buscarBdSocios(info.driveId, ss.getId());
    if (bd) poner('ID_BD_SOCIOS', bd.getUrl(), `«${bd.getName()}»`);
  }
  return puesto;
}

/** La subcarpeta de `padre` con alguno de esos nombres (sin mayúsculas ni tildes); si no hay, se crea con el primero. */
function carpetaHermana(padre, nombres) {
  const buscados = nombres.map(normalizarTexto);
  const it = padre.getFolders();
  while (it.hasNext()) {
    const c = it.next();
    if (buscados.indexOf(normalizarTexto(c.getName())) >= 0) return c;
  }
  return padre.createFolder(nombres[0]);
}

/**
 * La base de datos de socios de una unidad compartida: una hoja de cálculo
 * que se llama como una (socios, base de datos, BD) y tiene las pestañas
 * que este proyecto lee (SOCIOS.COLUMNAS). Solo se abren las que se llaman
 * así: abrir todas las hojas de la unidad es lento, y casi ningún centro
 * tiene base de socios. Si se llama de otra forma, se pega a mano en Ajustes.
 */
function buscarBdSocios(idUnidad, idPropio) {
  let archivos = [];
  try {
    archivos = Drive.Files.list({ q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
      corpora: 'drive', driveId: idUnidad, includeItemsFromAllDrives: true, supportsAllDrives: true,
      pageSize: 100, fields: 'files(id,name)' }).files || [];
  } catch (e) { return null; }
  const candidatos = archivos.filter(f => f.id !== idPropio && /socios|base de datos|\bbd\b/i.test(f.name)).slice(0, 4);
  for (const f of candidatos) {
    try {
      const bd = SpreadsheetApp.openById(f.id);
      if (Object.keys(SOCIOS.COLUMNAS).every(t => bd.getSheetByName(t))) return bd;
    } catch (e) { /* sin acceso: siguiente */ }
  }
  return null;
}


// ==================================================================
// CREAR Y REPARAR LA ESTRUCTURA
// ==================================================================

function crearEstructura() {
  const ss = libro();
  const ui = SpreadsheetApp.getUi();

  let anio = ss.getSheetByName(HOJAS.AJUSTES) ? null : anioPropuesto(ss.getName(), new Date());
  if (anio !== null) {
    const r = ui.alert('Crear la estructura',
      `Se va a preparar este libro para el ejercicio ${anio}-${anio + 1} `
      + `(del 1/9/${anio} al 31/8/${anio + 1}).\n\n¿Es correcto?`, ui.ButtonSet.YES_NO_CANCEL);
    if (r === ui.Button.CANCEL || r === ui.Button.CLOSE) return;
    if (r === ui.Button.NO) {
      const p = ui.prompt('Ejercicio', 'Año en que EMPIEZA el ejercicio (por ejemplo, 2026):', ui.ButtonSet.OK_CANCEL);
      if (p.getSelectedButton() !== ui.Button.OK) return;
      anio = parseInt(p.getResponseText(), 10);
      if (!(anio > 2000 && anio < 2100)) { ui.alert('Ese año no es válido.'); return; }
    }
  }
  const r = montarLibro(ss, anio);
  ui.alert('Estructura creada',
    (r.configuracion.length ? 'Configuración del centro (hoja Ajustes):\n• ' + r.configuracion.join('\n• ') + '\n\n' : '')
    + 'Siguientes pasos:\n\n'
    + '1. Caja: escribe arriba el saldo inicial del banco y del efectivo (o déjalo vacío: '
    + 'al importar el primer extracto se propone solo).\n'
    + '2. Presupuesto: revisa las partidas y pon los importes. Puedes añadir partidas '
    + 'cuando quieras, también a mitad de curso.\n'
    + '3. Ajustes: comprueba fechas, curso, partidas de cuotas y los datos del centro.\n'
    + '4. Tesorería → Diagnóstico → Diagnóstico del sistema.',
    ui.ButtonSet.OK);
}

/**
 * Prepara un libro (vacío o a medias) para el ejercicio que empieza en
 * `anio`: crea las hojas que falten, siembra Ajustes y Presupuesto y lo
 * repara. Sin ventanas: lo usa también la consola central sobre libros que
 * no están abiertos. Devuelve { configuracion: [lo que se ha rellenado] }.
 */
function montarLibro(ss, anio) {
  return conLibro(ss, () => {
    ss.setSpreadsheetTimeZone('Europe/Madrid');
    ss.setSpreadsheetLocale('es_ES');

    // Primero todas las hojas, vacías: las fórmulas de unas se refieren a
    // otras, y una fórmula que apunta a una hoja que todavía no existe se
    // queda en #REF! aunque la hoja aparezca después.
    const nuevas = {};
    [HOJAS.CAJA, HOJAS.PRESUPUESTO, HOJAS.CUENTAS, HOJAS.AJUSTES, HOJAS.LOG, HOJAS.LISTAS]
      .forEach(nombre => {
        if (!ss.getSheetByName(nombre)) { ss.insertSheet(nombre); nuevas[nombre] = true; }
      });

    if (nuevas[HOJAS.AJUSTES]) sembrarAjustes(ss, anio === null || anio === undefined ? anioPropuesto(ss.getName(), new Date()) : anio);
    if (nuevas[HOJAS.PRESUPUESTO]) sembrarPresupuesto(ss);
    if (nuevas[HOJAS.LOG]) ss.getSheetByName(HOJAS.LOG).getRange(1, 1, 1, 4)
      .setValues([['Fecha', 'Nivel', 'Mensaje', 'Detalle']]).setFontWeight('bold');

    // La hoja que trae un Sheet nuevo ("Hoja 1"), si sigue vacía.
    ss.getSheets().forEach(h => {
      if (Object.values(HOJAS).indexOf(h.getName()) === -1 && !esHojaDeActividad(h)
          && h.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(h);
    });

    return repararLibro(ss);
  });
}

/** Año de inicio del ejercicio: del nombre ("Ejercicio 26-27") o de la fecha. */
function anioPropuesto(nombre, hoy) {
  const m = String(nombre || '').match(/(\d{2,4})\s*[-/]\s*(\d{2,4})/);
  if (m) {
    const a = parseInt(m[1], 10);
    return a < 100 ? 2000 + a : a;
  }
  return hoy.getMonth() >= 8 ? hoy.getFullYear() : hoy.getFullYear() - 1;
}

/**
 * Vuelve a poner todo lo que no son datos: fórmulas de cabecera,
 * formatos, desplegables, formato condicional, rangos con nombre y
 * protecciones. No borra ni mueve ningún dato.
 */
function repararEstructura(silencioso) {
  const r = repararLibro(libro());
  if (silencioso !== true) {
    SpreadsheetApp.getUi().alert('Listo: fórmulas, formatos, desplegables y protecciones al día. '
      + 'No se ha tocado ningún dato.'
      + (r.configuracion.length ? '\n\nConfiguración del centro (hoja Ajustes):\n• ' + r.configuracion.join('\n• ') : ''));
  }
}

/**
 * repararEstructura() sin ventanas, sobre cualquier libro (la consola la
 * usa sobre los de todos los centros). Completa también Ajustes y apunta la
 * versión de la estructura. Devuelve { configuracion: [lo rellenado] }.
 */
function repararLibro(ss) {
  return conLibro(ss, () => {
    comprobarProteccionesAjenas(ss);
    asegurarFilasDeAjustes(ss);
    const configuracion = completarConfiguracion(ss);
    const comunes = typeof asegurarPartidasComunes === 'function' ? asegurarPartidasComunes(ss) : [];
    if (comunes.length) configuracion.push('Partidas comunes añadidas al Presupuesto: ' + comunes.join(', '));
    conFormulasEnIngles(ss, () => {
      montarListas(ss);
      montarPresupuesto(ss);
      montarCaja(ss);
      montarCuentas(ss);
      montarAjustes(ss);
      montarLog(ss);
    });
    if (typeof actualizarListaSubpartidas === 'function') actualizarListaSubpartidas(ss);
    ordenarHojas(ss);
    protegerHojas(ss);
    escribirAjuste(ss, AJUSTES.VERSION, VERSION_ESTRUCTURA);
    registrarPrograma(ss);
    return { configuracion: configuracion };
  });
}

/**
 * Ejecuta fn con la hoja en inglés (en_US) y la deja después en su
 * idioma. Todas las fórmulas del código (celdas, validaciones y formato
 * condicional) están escritas en sintaxis inglesa: comas entre
 * argumentos, {a, b; c} en las matrices. En una hoja en español, Sheets
 * puede interpretarlas con la sintaxis local (punto y coma) y dejar
 * «Error de análisis de fórmula» en todas. Con la hoja en en_US mientras
 * se escriben, se leen bien; Sheets las guarda en un formato interno y
 * al volver a es_ES las enseña traducidas, con «;».
 *
 * TODO lo que escriba fórmulas tiene que pasar por aquí.
 */
function conFormulasEnIngles(ss, fn) {
  const original = ss.getSpreadsheetLocale();
  const cambiar = original !== 'en_US';
  if (cambiar) { ss.setSpreadsheetLocale('en_US'); SpreadsheetApp.flush(); }
  try {
    return fn();
  } finally {
    if (cambiar) { SpreadsheetApp.flush(); ss.setSpreadsheetLocale(original); }
  }
}

function ordenarHojas(ss) {
  const orden = [HOJAS.CAJA, HOJAS.PRESUPUESTO, HOJAS.CUENTAS];
  orden.forEach((nombre, i) => {
    const h = ss.getSheetByName(nombre);
    if (h) { ss.setActiveSheet(h); ss.moveActiveSheet(i + 1); }
  });
  // Ajustes y Log al final. _Listas no se mueve: activar una hoja oculta
  // la vuelve visible.
  [HOJAS.AJUSTES, HOJAS.LOG].forEach(nombre => {
    const h = ss.getSheetByName(nombre);
    if (h) { ss.setActiveSheet(h); ss.moveActiveSheet(ss.getSheets().length); }
  });
  const listas = ss.getSheetByName(HOJAS.LISTAS);
  if (listas && !listas.isSheetHidden()) listas.hideSheet();
  const caja = ss.getSheetByName(HOJAS.CAJA);
  if (caja) ss.setActiveSheet(caja);
}


// ==================================================================
// CAJA
// ==================================================================

function montarCaja(ss) {
  const h = ss.getSheetByName(HOJAS.CAJA);
  const n = CAJA.COLUMNAS.length;
  asegurarTamaño(h, 1000, n);
  const L = letraCaja;
  const P = CAJA.PRIMERA_FILA;

  // Antes que las fórmulas que los usan.
  asegurarRangoConNombre(ss, 'SALDO_INICIAL_BANCO', h.getRange('B1'));
  asegurarRangoConNombre(ss, 'SALDO_INICIAL_EFECTIVO', h.getRange('C1'));

  // Fila de cabecera de columnas.
  const cab = CAJA.COLUMNAS.slice();
  cab[colCaja('Saldo') - 1] = '';           // la pone la fórmula
  h.getRange(CAJA.FILA_CABECERA, 1, 1, n).setValues([cab])
    .setFontWeight('bold').setBackground('#6075BB').setFontColor('#FFFFFF')
    .setWrap(true).setVerticalAlignment('middle');

  const c = `${L('Cantidad')}${P}:${L('Cantidad')}`;
  const m = `${L('Método de pago')}${P}:${L('Método de pago')}`;
  h.getRange(CAJA.FILA_CABECERA, colCaja('Saldo')).setFormula(formulaDeSaldo());

  // Cabecera de saldos. Los dos saldos iniciales (B1, C1) son lo único
  // que se escribe a mano aquí arriba.
  h.getRange('A1:A2').setValues([['Saldo inicial'], ['Saldo actual']]).setFontWeight('bold');
  h.getRange('D1').setFormula('=B1+C1');
  const e = `${L('Partida')}${P}:${L('Partida')}`;
  const fp = `${L('Fecha de pago')}${P}:${L('Fecha de pago')}`;
  // Ni lo del ejercicio anterior (ya está en el inicial) ni lo pendiente
  // (aún no ha salido del banco).
  const noAnterior = `${e}, "<>${CAJA.EJERCICIO_ANTERIOR}", ${fp}, "<>${CAJA.PENDIENTE}"`;
  h.getRange('B2').setFormula(`=SALDO_INICIAL_BANCO+SUMIFS(${c}, ${m}, "<>${CAJA.EFECTIVO}", ${noAnterior})`);
  h.getRange('C2').setFormula(`=SALDO_INICIAL_EFECTIVO+SUMIFS(${c}, ${m}, "${CAJA.EFECTIVO}", ${noAnterior})`);
  h.getRange('D2').setFormula('=B2+C2');
  h.getRange('B1:B2').setNumberFormat('"Banco: "#,##0.00 "€";"Banco: "-#,##0.00 "€"');
  h.getRange('C1:C2').setNumberFormat('"Efectivo: "#,##0.00 "€";"Efectivo: "-#,##0.00 "€"');
  h.getRange('D1:D2').setNumberFormat('"Total: "#,##0.00 "€";"Total: "-#,##0.00 "€"').setFontWeight('bold');
  h.getRange('B1:C1').setBackground('#FFF6E5').setNote(
    'Saldo inicial del ejercicio (a 1 de septiembre): banco en B1, efectivo en C1. '
    + 'Si B1 está vacío, al importar el primer extracto se rellena solo.');
  const f = `${L('Fecha de pago')}${P}:${L('Fecha de pago')}`;
  const b = `${L('Fecha')}${P}:${L('Fecha')}`;
  h.getRange('H1').setValue('Último asiento').setFontWeight('bold').setHorizontalAlignment('right');
  h.getRange('I1').setFormula(`=IF(COUNT(${f}, ${b})=0, , MAX(${f}, ${b}))`).setNumberFormat(CAJA.FORMATO_FECHA);
  h.getRange('H2').setValue('Banco según extracto').setFontWeight('bold').setHorizontalAlignment('right');
  h.getRange('I2').setNumberFormat(CAJA.FORMATO_EUROS);

  // Formatos de columna, de la primera fila de datos hasta el final.
  const filas = h.getMaxRows() - P + 1;
  const col = nombre => h.getRange(P, colCaja(nombre), filas, 1);
  ['ID Transacción', 'ID socio', 'CIF proveedor', 'Partida', 'Subpartida', 'Cuenta de abono',
   'Huella extracto', 'Asunto transferencia'].forEach(x => col(x).setNumberFormat('@'));
  ['Fecha', 'Fecha de pago'].forEach(x => col(x).setNumberFormat(CAJA.FORMATO_FECHA));
  ['Cantidad', 'Saldo', 'Saldo extracto'].forEach(x => col(x).setNumberFormat(CAJA.FORMATO_EUROS));
  col('Concepto Banco').setWrap(false);
  CAJA.COLUMNAS.forEach((x, i) => h.setColumnWidth(i + 1, CAJA.ANCHOS[x] || 100));
  h.setRowHeight(CAJA.FILA_CABECERA, 36);
  h.setFrozenRows(CAJA.FILA_CABECERA);
  h.setFrozenColumns(2);
  h.hideColumns(colCaja('Huella extracto'));
  h.getRange(P, colCaja('Saldo'), filas, 1).setBackground('#F3F3F3');
  h.getRange(P, colCaja('Saldo extracto'), filas, 3).setBackground('#F3F3F3').setFontColor('#666666');

  // Desplegables.
  const listas = ss.getSheetByName(HOJAS.LISTAS);
  const fecha = SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false)
    .setHelpText('Una fecha (dd/mm/aaaa).').build();
  col('Fecha').setDataValidation(fecha);
  const fpCelda = `${L('Fecha de pago')}${P}`;
  col('Fecha de pago').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireFormulaSatisfied(`=OR(ISNUMBER(${fpCelda}), ${fpCelda}="${CAJA.PENDIENTE}")`).setAllowInvalid(false)
    .setHelpText(`Una fecha (dd/mm/aaaa), o «${CAJA.PENDIENTE}» si el pago está ordenado pero aún no ha salido del banco.`).build());
  col('Partida').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInRange(listas.getRange('A2:A'), true).setAllowInvalid(false)
    .setHelpText('Escribe el código o parte del nombre y elige: en la celda queda solo el código. '
      + '«Traspaso» para mover dinero entre banco y efectivo; '
      + '«Ejercicio anterior» para lo que llega ahora al banco pero ya está en el saldo inicial (no cuenta en nada). '
      + 'Si falta una, añádela en la hoja Presupuesto.').build());
  col('Subpartida').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInRange(listas.getRange('B2:B'), true).setAllowInvalid(true)
    .setHelpText('Escribe el código o parte del nombre y elige: en la celda queda solo el código. '
      + 'Las subpartidas se definen en la hoja de cada actividad.').build());
  col('Método de pago').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(CAJA.METODOS, true).setAllowInvalid(false)
    .setHelpText('«Efectivo» cuenta en el saldo de efectivo; todo lo demás, en el del banco.').build());
  col('Cantidad').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireNumberBetween(-1000000, 1000000).setAllowInvalid(false)
    .setHelpText('Positivo si entra dinero, negativo si sale.').build());

  // Formato condicional: lo que hay que mirar, en color.
  const reglas = [];
  const regla = (rango, formula, fondo) => reglas.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(formula).setBackground(fondo).setRanges([rango]).build());
  const R = x => h.getRange(`${L(x)}${P}:${L(x)}`);
  const ROJO = '#F4C7C3', NARANJA = '#FCE8B2', AMARILLO = '#FFF2CC';

  // El saldo calculado no coincide con el del banco: falta o sobra algo,
  // o la hoja no está ordenada. Lo de «Ejercicio anterior» que aún no ha
  // llegado está en el saldo de Caja (va en el inicial) pero todavía no
  // en el del banco: se descuenta para comparar.
  const pendienteAnterior = `SUMIFS($${L('Cantidad')}${P + 1}:$${L('Cantidad')}, $${L('Partida')}${P + 1}:$${L('Partida')}, `
    + `"${CAJA.EJERCICIO_ANTERIOR}", $${L('Método de pago')}${P + 1}:$${L('Método de pago')}, "<>${CAJA.EFECTIVO}")`;
  const dif = `AND($${L('Saldo extracto')}${P}<>"", `
    + `ROUND($${L('Saldo')}${P}-${pendienteAnterior}-$${L('Saldo extracto')}${P}, 2)<>0)`;
  regla(R('Saldo'), '=' + dif, ROJO);
  regla(R('Saldo extracto'), '=' + dif, ROJO);
  // Fuera de orden por fecha de pago.
  regla(h.getRange(`${L('Fecha de pago')}${P + 1}:${L('Fecha de pago')}`),
    `=AND(ISNUMBER($${L('Fecha de pago')}${P + 1}), ISNUMBER($${L('Fecha de pago')}${P}), `
    + `$${L('Fecha de pago')}${P + 1}<$${L('Fecha de pago')}${P})`, NARANJA);
  // Pago ordenado que aún no ha salido del banco.
  regla(R('Fecha de pago'), `=$${L('Fecha de pago')}${P}="${CAJA.PENDIENTE}"`, '#DCEBFA');
  // Subpartida que no es de su partida (G21A solo vale con G21).
  regla(R('Subpartida'), `=AND($${L('Subpartida')}${P}<>"", `
    + `LEFT($${L('Subpartida')}${P}, LEN($${L('Partida')}${P}))<>$${L('Partida')}${P})`, ROJO);
  // ID de socio mal escrito.
  regla(R('ID socio'), `=AND($${L('ID socio')}${P}<>"", NOT(REGEXMATCH(UPPER($${L('ID socio')}${P}), `
    + `"^\\s*JMV-\\d{6}(@\\d{4}-\\d{4})?(\\s*[,;]\\s*JMV-\\d{6}(@\\d{4}-\\d{4})?)*\\s*$")))`, ROJO);
  // Un traspaso no es el pago de ninguna cuota; lo del ejercicio anterior
  // no se sincroniza.
  regla(R('ID socio'), `=AND($${L('ID socio')}${P}<>"", OR($${L('Partida')}${P}="${CAJA.TRASPASO}", `
    + `$${L('Partida')}${P}="${CAJA.EJERCICIO_ANTERIOR}"))`, ROJO);
  // Lo del ejercicio anterior, en gris: aquí no cuenta para nada.
  reglas.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(`=$${L('Partida')}${P}="${CAJA.EJERCICIO_ANTERIOR}"`)
    .setFontColor('#999999').setItalic(true)
    .setRanges([h.getRange(`A${P}:${L('Fecha de pago')}`)]).build());
  // Partida de ingresos con dinero que sale, o al revés: puede ser una
  // devolución, pero hay que mirarlo.
  regla(R('Partida'), `=OR(AND(LEFT($${L('Partida')}${P})="I", $${L('Cantidad')}${P}<0), `
    + `AND(LEFT($${L('Partida')}${P})="G", $${L('Cantidad')}${P}>0))`, NARANJA);
  // Asiento sin partida.
  regla(R('Partida'), `=AND(ISNUMBER($${L('Cantidad')}${P}), $${L('Partida')}${P}="")`, AMARILLO);
  // Pago sin factura (salvo traspasos y cargos del propio banco).
  regla(R('Factura'), `=AND($${L('Cantidad')}${P}<0, $${L('Factura')}${P}="", `
    + `$${L('Partida')}${P}<>"${CAJA.TRASPASO}", $${L('Partida')}${P}<>"${CAJA.EJERCICIO_ANTERIOR}", `
    + `$${L('Método de pago')}${P}<>"Cargo bancario")`, AMARILLO);
  // Algo que resolver con BD Socios.
  regla(R('BD Socios'), `=LEFT($${L('BD Socios')}${P})="⚠"`, NARANJA);
  h.setConditionalFormatRules(reglas);
}


/**
 * Saldo fila a fila, en el orden de la hoja, en la cabecera de la
 * columna Saldo. Lleva dos acumulados, uno para el banco y otro para el
 * efectivo: cada fila muestra el saldo de SU cuenta tras ese movimiento.
 * Por eso Caja tiene que estar ordenada por fecha de pago. Las filas de
 * «Ejercicio anterior» cuentan 0: ya están en el saldo inicial. Las
 * pendientes («Pendiente» en Fecha de pago) cuentan 0 y no enseñan saldo:
 * el dinero aún no ha salido. En sintaxis inglesa: escríbela dentro de
 * conFormulasEnIngles().
 */
function formulaDeSaldo() {
  const L = letraCaja, P = CAJA.PRIMERA_FILA;
  const c = `${L('Cantidad')}${P}:${L('Cantidad')}`;
  const m = `${L('Método de pago')}${P}:${L('Método de pago')}`;
  const e = `${L('Partida')}${P}:${L('Partida')}`;
  const fp = `${L('Fecha de pago')}${P}:${L('Fecha de pago')}`;
  return `={"Saldo"; ARRAYFORMULA(LET(cantidad, ${c}, esEfectivo, ${m}="${CAJA.EFECTIVO}", `
    + `pagado, ISNUMBER(cantidad)*(${fp}<>"${CAJA.PENDIENTE}"), `
    + `importe, IF(pagado*(${e}<>"${CAJA.EJERCICIO_ANTERIOR}"), cantidad, 0), `
    + `acumBanco, SCAN(0, IF(esEfectivo, 0, importe), LAMBDA(acum, valor, acum + valor)), `
    + `acumEfectivo, SCAN(0, IF(esEfectivo, importe, 0), LAMBDA(acum, valor, acum + valor)), `
    + `IF(pagado, IF(esEfectivo, SALDO_INICIAL_EFECTIVO + acumEfectivo, SALDO_INICIAL_BANCO + acumBanco), )))}`;
}


// ==================================================================
// PRESUPUESTO Y CUENTAS
// ==================================================================

function sembrarPresupuesto(ss) {
  const h = ss.getSheetByName(HOJAS.PRESUPUESTO);
  const P = PRESUPUESTO.PRIMERA_FILA;
  const ing = PRESUPUESTO.INGRESOS, gas = PRESUPUESTO.GASTOS;
  h.getRange(P, 1, ing.length, 1).setValues(ing.map(x => [x[0]]));
  h.getRange(P, 3, ing.length, 1).setValues(ing.map(x => [x[1]]));
  h.getRange(P, 5, gas.length, 1).setValues(gas.map(x => [x[0]]));
  h.getRange(P, 7, gas.length, 1).setValues(gas.map(x => [x[1]]));
}

/** Resumen por secciones + cabecera de la tabla. Común a las dos hojas. */
function montarTablaDePartidas(h, real) {
  asegurarTamaño(h, 1000, 8);
  const P = PRESUPUESTO.PRIMERA_FILA, C = PRESUPUESTO.FILA_CABECERA;

  const cabResumen = real ? ['Sección', 'Ingresos', 'Gastos', 'Balance'] : ['Sección', 'Ingresos', 'Gastos'];
  h.getRange(1, 1, 1, cabResumen.length).setValues([cabResumen]);
  SECCIONES.forEach((s, i) => {
    const f = i + 2;
    h.getRange(f, 1).setValue(s);
    h.getRange(f, 2).setFormula(`=SUMIF($B$${P}:$B, $A${f}, $D$${P}:$D)`);
    h.getRange(f, 3).setFormula(`=SUMIF($F$${P}:$F, $A${f}, $H$${P}:$H)`);
    if (real) h.getRange(f, 4).setFormula(`=B${f}-C${f}`);
  });
  if (real) {
    h.getRange('A6').setValue('Total');
    h.getRange('B6').setFormula('=SUM(B2:B5)');
    h.getRange('C6').setFormula('=SUM(C2:C5)');
    h.getRange('D6').setFormula('=B6-C6');
    h.getRange('A6:D6').setFontWeight('bold').setBorder(true, null, null, null, null, null);
  }
  h.getRange(1, 1, 1, cabResumen.length).setFontWeight('bold').setBackground('#6075BB').setFontColor('#FFFFFF');
  h.getRange('B2:D6').setNumberFormat(CAJA.FORMATO_EUROS);

  const cab = PRESUPUESTO.CABECERA.slice();
  if (real) { cab[3] = 'Importe real'; cab[7] = 'Importe real'; }
  // B y F (Sección) las pone una fórmula: se deducen del código.
  const r = h.getRange(C, 1, 1, 8);
  if (!real) r.setValues([cab.map((x, i) => (i === 1 || i === 5) ? '' : x)]);
  const seccion = col => `={"Sección"; ARRAYFORMULA(IF(${col}${P}:${col}="",, `
    + `IFERROR(CHOOSE(VALUE(MID(${col}${P}:${col}, 2, 1)), ${SECCIONES.map(s => `"${s}"`).join(', ')}), `
    + `"⚠ Código no válido")))}`;
  if (!real) {
    h.getRange(C, 2).setFormula(seccion('A'));
    h.getRange(C, 6).setFormula(seccion('E'));
  }
  r.setFontWeight('bold').setBackground('#18A2B5').setFontColor('#FFFFFF').setWrap(true);
  h.getRange(C, 1, 1, 4).setBorder(null, null, null, true, null, null);

  const filas = h.getMaxRows() - P + 1;
  h.getRange(P, 4, filas, 1).setNumberFormat(CAJA.FORMATO_EUROS);
  h.getRange(P, 8, filas, 1).setNumberFormat(CAJA.FORMATO_EUROS);
  h.getRange(P, 1, filas, 1).setNumberFormat('@');
  h.getRange(P, 5, filas, 1).setNumberFormat('@');
  [90, 140, 260, 120, 90, 140, 260, 120].forEach((w, i) => h.setColumnWidth(i + 1, w));
  h.setColumnWidth(1, 140);
  h.setFrozenRows(C);
}

function montarPresupuesto(ss) {
  const h = ss.getSheetByName(HOJAS.PRESUPUESTO);
  montarTablaDePartidas(h, false);
  const P = PRESUPUESTO.PRIMERA_FILA;
  h.getRange('A8').setValue('Añade partidas en la tabla cuando haga falta, también a mitad de curso. '
    + 'Código: I (ingreso) o G (gasto) + número de sección (1-4) + número de partida. Ej.: I32, G32. '
    + 'Las de código en negrita son las comunes de JMV España: no cambies su código ni las borres.')
    .setFontStyle('italic').setFontColor('#666666');

  const filas = h.getMaxRows() - P + 1;
  const codigo = letra => SpreadsheetApp.newDataValidation()
    .requireFormulaSatisfied(`=REGEXMATCH(${letra}${P}, "^${letra === 'A' ? 'I' : 'G'}[1-4]\\d+$")`)
    .setAllowInvalid(false)
    .setHelpText(letra === 'A' ? 'I + sección (1-4) + número: I11, I32…' : 'G + sección (1-4) + número: G11, G32…')
    .build();
  h.getRange(P, 1, filas, 1).setDataValidation(codigo('A'));
  h.getRange(P, 5, filas, 1).setDataValidation(codigo('E'));

  const ROJO = '#F4C7C3';
  h.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(`=AND($A${P}<>"", COUNTIF($A$${P}:$A, $A${P})>1)`)
      .setBackground(ROJO).setRanges([h.getRange(`A${P}:A`)]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(`=AND($E${P}<>"", COUNTIF($E$${P}:$E, $E${P})>1)`)
      .setBackground(ROJO).setRanges([h.getRange(`E${P}:E`)]).build(),
    // Las partidas comunes de JMV España (09_Nacional.js), en negrita.
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(`=REGEXMATCH($A${P}, "^(${PRESUPUESTO.INGRESOS.map(x => x[0]).join('|')})$")`)
      .setBold(true).setRanges([h.getRange(`A${P}:A`)]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(`=REGEXMATCH($E${P}, "^(${PRESUPUESTO.GASTOS.map(x => x[0]).join('|')})$")`)
      .setBold(true).setRanges([h.getRange(`E${P}:E`)]).build()
  ]);
}

function montarCuentas(ss) {
  const h = ss.getSheetByName(HOJAS.CUENTAS);
  montarTablaDePartidas(h, true);
  const P = PRESUPUESTO.PRIMERA_FILA, C = PRESUPUESTO.FILA_CABECERA;
  const cajaJ = `${HOJAS.CAJA}!$${letraCaja('Cantidad')}$${CAJA.PRIMERA_FILA}:$${letraCaja('Cantidad')}`;
  const cajaE = `${HOJAS.CAJA}!$${letraCaja('Partida')}$${CAJA.PRIMERA_FILA}:$${letraCaja('Partida')}`;
  const pres = HOJAS.PRESUPUESTO;

  // La tabla es un espejo del Presupuesto con el importe real al lado:
  // una partida nueva en el Presupuesto aparece aquí sola.
  h.getRange(C, 1).setFormula(`=ARRAYFORMULA(${pres}!A${C}:C)`);
  h.getRange(C, 4).setFormula(`={"Importe real"; ARRAYFORMULA(IF(A${P}:A="",, SUMIFS(${cajaJ}, ${cajaE}, A${P}:A)))}`);
  h.getRange(C, 5).setFormula(`=ARRAYFORMULA(${pres}!E${C}:G)`);
  h.getRange(C, 8).setFormula(`={"Importe real"; ARRAYFORMULA(IF(E${P}:E="",, -SUMIFS(${cajaJ}, ${cajaE}, E${P}:E)))}`);

  // Comprobaciones: lo que hace que estas cuentas no cuadren con el saldo.
  h.getRange('A7').setFormula(`=LET(sinPartida, COUNTIFS(${cajaJ}, "<>", ${cajaE}, ""), IF(sinPartida=0, `
    + `"✓ Todos los asientos de Caja tienen partida.", `
    + `"⚠ Hay "&sinPartida&" asientos sin partida en Caja ("&TEXT(SUMIFS(${cajaJ}, ${cajaE}, ""), "#,##0.00")&" €): no cuentan aquí."))`);
  h.getRange('A8').setFormula(`=LET(usadas, UNIQUE(FILTER(${cajaE}, ${cajaE}<>"", ${cajaE}<>"${CAJA.TRASPASO}", `
    + `${cajaE}<>"${CAJA.EJERCICIO_ANTERIOR}")), `
    + `faltan, FILTER(usadas, ISNA(MATCH(usadas, {${pres}!A${P}:A; ${pres}!E${P}:E}, 0))), `
    + `IF(ISERROR(INDEX(faltan, 1)), "✓ Todas las partidas usadas en Caja están en el Presupuesto.", `
    + `"⚠ Partidas usadas en Caja que no están en el Presupuesto: "&TEXTJOIN(", ", TRUE, faltan)))`);
  h.getRange('A9').setFormula(`=LET(neto, SUMIFS(${cajaJ}, ${cajaE}, "${CAJA.TRASPASO}"), IF(ROUND(neto, 2)=0, `
    + `"✓ Los traspasos entre banco y efectivo cuadran.", `
    + `"⚠ Los traspasos entre banco y efectivo no suman cero ("&TEXT(neto, "#,##0.00")&" €): falta una de las dos patas."))`);
  h.getRange('E7').setFormula(`=LET(neto, SUMIFS(${cajaJ}, ${cajaE}, "${CAJA.EJERCICIO_ANTERIOR}"), `
    + `filas, COUNTIFS(${cajaE}, "${CAJA.EJERCICIO_ANTERIOR}"), IF(filas=0, "", `
    + `"ℹ Asientos marcados «${CAJA.EJERCICIO_ANTERIOR}» (ya incluidos en el saldo inicial, no cuentan en nada): "`
    + `&filas&", neto "&TEXT(neto, "#,##0.00")&" €."))`);
  h.getRange('A7:A9').setFontStyle('italic');
  h.getRange('E7').setFontStyle('italic');
}


/**
 * Las partidas del Presupuesto:
 * { ingresos: [{ codigo, descripcion, seccion, importe }], gastos: [...] }
 */
function leerPartidas(ss) {
  const h = (ss || libro()).getSheetByName(HOJAS.PRESUPUESTO);
  const P = PRESUPUESTO.PRIMERA_FILA;
  const n = h.getMaxRows() - P + 1;
  const v = n > 0 ? h.getRange(P, 1, n, 8).getValues() : [];
  const lado = desde => v.filter(f => String(f[desde]).trim() !== '').map(f => {
    const codigo = String(f[desde]).trim().toUpperCase();
    return { codigo: codigo, descripcion: String(f[desde + 2] || '').trim(),
      seccion: SECCIONES[parseInt(codigo.charAt(1), 10) - 1] || '', importe: numeroDeTexto(f[desde + 3]) || 0 };
  });
  return { ingresos: lado(0), gastos: lado(4) };
}


/**
 * Número de la primera partida libre de una sección (1-4) a la vez en
 * ingresos y en gastos, para que las dos vayan emparejadas: con I21, I22,
 * G21 y G22, 3 (I23 y G23). Pura.
 */
function siguientePartidaLibre(partidas, seccion) {
  const usados = partidas.ingresos.concat(partidas.gastos)
    .filter(x => PATRON_PARTIDA.test(x.codigo) && x.codigo.charAt(1) === String(seccion))
    .map(x => parseInt(x.codigo.slice(2), 10));
  return usados.length ? Math.max.apply(null, usados) + 1 : 1;
}

/**
 * Añade una partida al final de su lado de la tabla del Presupuesto
 * (A-D ingresos, E-H gastos), sin importe. La sección y Cuentas salen
 * solas por fórmula.
 */
function añadirPartida(ss, codigo, descripcion) {
  const h = ss.getSheetByName(HOJAS.PRESUPUESTO);
  const P = PRESUPUESTO.PRIMERA_FILA;
  const col = codigo.charAt(0) === 'I' ? 1 : 5;
  const n = h.getMaxRows() - P + 1;
  const v = n > 0 ? h.getRange(P, col, n, 1).getValues() : [];
  let ultima = -1;
  v.forEach((f, i) => { if (String(f[0]).trim() !== '') ultima = i; });
  const fila = P + ultima + 1;
  if (fila > h.getMaxRows()) h.insertRowsAfter(h.getMaxRows(), 50);
  h.getRange(fila, col).setNumberFormat('@').setValue(codigo);
  h.getRange(fila, col + 2).setValue(descripcion);
  return fila;
}

// ==================================================================
// AJUSTES, LISTAS Y LOG
// ==================================================================

function sembrarAjustes(ss, anio) {
  const h = ss.getSheetByName(HOJAS.AJUSTES);
  const filas = [
    ['Ajuste', 'Valor', 'Para qué sirve'],
    [AJUSTES.EJERCICIO, `${anio}-${anio + 1}`, 'Nombre del ejercicio. Da nombre a las subcarpetas de facturas, extractos e informes.'],
    [AJUSTES.INICIO, new Date(anio, 8, 1), 'Primer día del ejercicio. Los movimientos del extracto anteriores no se importan.'],
    [AJUSTES.FIN, new Date(anio + 1, 7, 31), 'Último día del ejercicio. Fecha de corte del informe de cierre.'],
    [AJUSTES.CURSO, `${anio}-${anio + 1}`, 'Curso de BD Socios al que se apuntan las cuotas cobradas en este ejercicio.'],
    [AJUSTES.ANTERIOR, '', 'Lo rellena «Crear el ejercicio siguiente». Sirve para traer los saldos iniciales.'],
    [AJUSTES.ULTIMO_EXTRACTO, '', 'Lo escribe el importador de extractos.']
  ];
  AJUSTES.TRAMOS_POR_DEFECTO.forEach(t => filas.push([AJUSTES.PREFIJO_TRAMO + t[0], t[1],
    'Partida de ingresos a la que va la cuota de un socio de ese tramo (Tramo_cuota en BD Socios).']));
  Object.keys(CONFIG_EN_AJUSTES).forEach(k => filas.push([CONFIG_EN_AJUSTES[k][0], '', CONFIG_EN_AJUSTES[k][1]]));
  filas.push([AJUSTES.VERSION, '', 'La escribe «Reparar». Si es menor que la del programa, el Diagnóstico pide reparar.']);
  filas.push([AJUSTES.PROGRAMA, '', 'Lo escribe el libro al abrirse. La consola lo usa para subir las versiones nuevas del programa.']);
  // Texto antes de escribir, o "2026-2027" podría leerse como otra cosa.
  h.getRange('B2:B').setNumberFormat('@');
  h.getRange('B3:B4').setNumberFormat(CAJA.FORMATO_FECHA);
  h.getRange(1, 1, filas.length, 3).setValues(filas);
}

function montarAjustes(ss) {
  const h = ss.getSheetByName(HOJAS.AJUSTES);
  h.getRange('A1:C1').setFontWeight('bold').setBackground('#6075BB').setFontColor('#FFFFFF');
  h.setColumnWidth(1, 260); h.setColumnWidth(2, 220); h.setColumnWidth(3, 560);
  h.getRange('C:C').setFontColor('#666666').setWrap(true);
}

function montarListas(ss) {
  const h = ss.getSheetByName(HOJAS.LISTAS);
  const P = PRESUPUESTO.PRIMERA_FILA, pres = HOJAS.PRESUPUESTO;
  h.getRange('A1:C1').setValues([['Partidas', 'Subpartidas', 'Métodos de pago']]).setFontWeight('bold');
  // Primero «código · nombre», para poder buscar por el nombre; después
  // los códigos solos, que es lo que queda en la celda (ver
  // CAJA.SEPARADOR_OPCION). Una partida sin descripción sale una sola vez.
  const S = CAJA.SEPARADOR_OPCION;
  const conNombre = (cod, desc) => `IFERROR(FILTER(${pres}!${cod}${P}:${cod}&IF(${pres}!${desc}${P}:${desc}="", "", `
    + `"${S}"&${pres}!${desc}${P}:${desc}), ${pres}!${cod}${P}:${cod}<>""), )`;
  const soloCodigo = (cod, desc) => `IFERROR(FILTER(${pres}!${cod}${P}:${cod}, ${pres}!${cod}${P}:${cod}<>"", `
    + `${pres}!${desc}${P}:${desc}<>""), )`;
  h.getRange('A2').setFormula(`={${conNombre('A', 'C')}; ${conNombre('E', 'G')}; `
    + `"${CAJA.TRASPASO}"; "${CAJA.EJERCICIO_ANTERIOR}"; ${soloCodigo('A', 'C')}; ${soloCodigo('E', 'G')}}`);
  h.getRange('C2:C').clearContent();
  h.getRange(2, 3, CAJA.METODOS.length, 1).setValues(CAJA.METODOS.map(x => [x]));
}

function montarLog(ss) {
  const h = ss.getSheetByName(HOJAS.LOG);
  h.getRange('A:A').setNumberFormat('dd/MM/yyyy HH:mm');
  h.setColumnWidth(3, 360); h.setColumnWidth(4, 600);
  h.setFrozenRows(1);
}

/**
 * Los ajustes del ejercicio, ya interpretados:
 * { ejercicio, inicio, fin, curso, anterior, ultimoExtracto, tramos: {'10-15': 'I11', …} }
 */
function leerAjustes(ss) {
  ss = ss || libro();
  const h = ss.getSheetByName(HOJAS.AJUSTES);
  if (!h) throw new Error('Falta la hoja «Ajustes». Ejecuta Tesorería → Ejercicio → Crear estructura.');
  const valores = h.getDataRange().getValues();
  const mapa = {};
  valores.slice(1).forEach(f => { mapa[String(f[0]).trim()] = f[1]; });
  const fecha = v => v instanceof Date ? v : fechaDeTexto(v);
  const a = {
    ejercicio: String(mapa[AJUSTES.EJERCICIO] || '').trim(),
    inicio: fecha(mapa[AJUSTES.INICIO]),
    fin: fecha(mapa[AJUSTES.FIN]),
    curso: String(mapa[AJUSTES.CURSO] || '').trim(),
    anterior: String(mapa[AJUSTES.ANTERIOR] || '').trim(),
    ultimoExtracto: String(mapa[AJUSTES.ULTIMO_EXTRACTO] || '').trim(),
    tramos: {}
  };
  Object.keys(mapa).forEach(k => {
    if (k.indexOf(AJUSTES.PREFIJO_TRAMO) === 0) {
      a.tramos[k.slice(AJUSTES.PREFIJO_TRAMO.length).trim()] = String(mapa[k] || '').trim().toUpperCase();
    }
  });
  if (!a.ejercicio || !a.inicio || !a.fin) {
    throw new Error('La hoja «Ajustes» está incompleta: hacen falta el ejercicio y sus fechas de inicio y fin.');
  }
  // Fin del día, para que el propio 31 de agosto quede dentro.
  a.fin = new Date(a.fin.getFullYear(), a.fin.getMonth(), a.fin.getDate(), 23, 59, 59);
  return a;
}

function escribirAjuste(ss, clave, valor, descripcion) {
  const h = ss.getSheetByName(HOJAS.AJUSTES);
  const claves = h.getRange(1, 1, h.getLastRow(), 1).getValues().map(f => String(f[0]).trim());
  const i = claves.indexOf(clave);
  if (i >= 0) h.getRange(i + 1, 2).setValue(valor);
  else h.appendRow([clave, valor, descripcion || '']);
  CONTEXTO.ajustes = null;
}

/**
 * Añade a Ajustes las filas que tenga un libro nuevo y le falten a este
 * (libros de antes de la configuración en Ajustes), vacías. Devuelve cuántas.
 */
function asegurarFilasDeAjustes(ss) {
  const h = ss.getSheetByName(HOJAS.AJUSTES);
  const hay = {};
  h.getRange(1, 1, Math.max(h.getLastRow(), 1), 1).getValues().forEach(f => { hay[String(f[0]).trim()] = true; });
  const faltan = Object.keys(CONFIG_EN_AJUSTES).map(k => CONFIG_EN_AJUSTES[k])
    .concat([[AJUSTES.VERSION, 'La escribe «Reparar». Si es menor que la del programa, el Diagnóstico pide reparar.'],
      [AJUSTES.PROGRAMA, 'Lo escribe el libro al abrirse. La consola lo usa para subir las versiones nuevas del programa.']])
    .filter(x => !hay[x[0]]);
  if (faltan.length) {
    const desde = h.getLastRow() + 1;
    h.getRange(desde, 1, faltan.length, 3).setValues(faltan.map(x => [x[0], '', x[1]]));
    h.getRange(desde, 2, faltan.length, 1).setNumberFormat('@');
  }
  CONTEXTO.ajustes = null;
  return faltan.length;
}

function registrar(nivel, mensaje, detalle) {
  try {
    libro().getSheetByName(HOJAS.LOG)
      .appendRow([new Date(), nivel, mensaje, String(detalle || '').slice(0, 5000)]);
  } catch (e) { console.error(e.message); }
}


// ==================================================================
// PROTECCIONES
//
// Todas DE AVISO (cualquiera puede editar tras confirmar), como en BD
// Socios (§3.11 de su guía). Antes, lo que es copia o cálculo (Cuentas, el
// resumen del Presupuesto, las hojas de actividad) llevaba protección
// ESTRICTA: solo quien la ponía podía editar. Con varias personas de
// tesorería (cuentas @gmail) y la consola reparando con la cuenta de la
// administración, eso rompía «Reparar» en cuanto lo lanzaba otra persona
// («Estás intentando editar una celda o un objeto protegidos»), porque el
// script actúa con los permisos de quien lo lanza. El aviso basta para lo
// que se buscaba: que nadie escriba ahí sin querer.
// ==================================================================

function protegerHojas(ss) {
  // Fuera las protecciones que pusimos antes (se reconocen por el
  // prefijo); las que haya puesto una persona se respetan.
  // Las que no puede tocar quien repara (las puso otra persona: por
  // ejemplo, la administración desde la consola) se dejan como están y no se
  // duplican: proteger() se las salta.
  CONTEXTO.protegidas = {};
  ss.getProtections(SpreadsheetApp.ProtectionType.RANGE)
    .concat(ss.getProtections(SpreadsheetApp.ProtectionType.SHEET))
    .forEach(p => {
      const r = p.getRange && p.getRange();
      const enActividad = r && esHojaDeActividad(r.getSheet());
      const desc = String(p.getDescription());
      if (desc.indexOf(PROTECCION) !== 0 || enActividad) return;
      if (p.canEdit()) p.remove();
      else CONTEXTO.protegidas[desc + '|' + (r ? r.getSheet().getName() + '!' + r.getA1Notation() : '')] = true;
    });

  const caja = ss.getSheetByName(HOJAS.CAJA);
  const L = letraCaja, P = CAJA.PRIMERA_FILA;
  ['A1:A3', 'B2:C3', `D1:${letraDeColumna(CAJA.COLUMNAS.length)}3`].forEach(a =>
    proteger(caja.getRange(a), 'cabecera y saldos (se calculan solos)', true));
  proteger(caja.getRange(`A${P}:A`), 'ID de transacción (lo asigna el script)', true);
  proteger(caja.getRange(`${L('Saldo')}${P}:${L('Saldo')}`), 'saldo (fórmula)', true);
  proteger(caja.getRange(`${L('Saldo extracto')}${P}:${L('Huella extracto')}`), 'columnas técnicas del script', true);

  const pres = ss.getSheetByName(HOJAS.PRESUPUESTO);
  proteger(pres.getRange(`A1:H${PRESUPUESTO.FILA_CABECERA}`), 'resumen y cabecera del presupuesto', true);
  proteger(pres.getRange(`B${PRESUPUESTO.PRIMERA_FILA}:B`), 'sección (se deduce del código)', true);
  proteger(pres.getRange(`F${PRESUPUESTO.PRIMERA_FILA}:F`), 'sección (se deduce del código)', true);

  const cuentas = ss.getSheetByName(HOJAS.CUENTAS);
  proteger(cuentas.getRange('A1:H' + cuentas.getMaxRows()), 'cuentas (solo fórmulas)', true);

  proteger(ss.getSheetByName(HOJAS.AJUSTES).getDataRange(), 'ajustes del ejercicio', true);
  proteger(ss.getSheetByName(HOJAS.LOG).getRange('A:D'), 'registro del script', true);
  proteger(ss.getSheetByName(HOJAS.LISTAS).getRange('A:C'), 'listas de los desplegables', true);
}

/**
 * Antes de reparar: las protecciones ESTRICTAS que puso este programa en
 * versiones anteriores y que quien repara no puede editar harían fallar
 * «Reparar» a mitad. Se avisa antes de tocar nada, diciendo qué hacer.
 */
function comprobarProteccionesAjenas(ss) {
  const ajenas = ss.getProtections(SpreadsheetApp.ProtectionType.RANGE)
    .concat(ss.getProtections(SpreadsheetApp.ProtectionType.SHEET))
    .filter(p => String(p.getDescription()).indexOf(PROTECCION) === 0 && !p.isWarningOnly() && !p.canEdit())
    .filter(p => { const r = p.getRange && p.getRange(); return !(r && esHojaDeActividad(r.getSheet())); });
  if (!ajenas.length) return;
  const donde = ajenas.map(p => { const r = p.getRange(); return `${r.getSheet().getName()}!${r.getA1Notation()}`; });
  throw new Error(`Este libro tiene protecciones de una versión anterior que solo puede editar quien las puso `
    + `(${donde.slice(0, 4).join(', ')}${donde.length > 4 ? '…' : ''}). Que esa persona (normalmente la cuenta del centro) `
    + 'pulse «Reparar» una vez, o que las quite en Datos → Proteger hojas e intervalos. Después ya puede reparar cualquiera.');
}

function proteger(rango, descripcion, soloAviso) {
  if (CONTEXTO.protegidas && CONTEXTO.protegidas[PROTECCION + descripcion + '|' + rango.getSheet().getName() + '!' + rango.getA1Notation()]) return null;
  const p = rango.protect().setDescription(PROTECCION + descripcion);
  if (soloAviso) { p.setWarningOnly(true); return p; }
  const yo = Session.getEffectiveUser();
  p.addEditor(yo);
  const otros = p.getEditors().filter(e => e.getEmail() !== yo.getEmail());
  if (otros.length) p.removeEditors(otros);
  if (p.canDomainEdit()) p.setDomainEdit(false);
  return p;
}


// ==================================================================
// UTILIDADES
// ==================================================================

function asegurarTamaño(h, filas, columnas) {
  if (h.getMaxRows() < filas) h.insertRowsAfter(h.getMaxRows(), filas - h.getMaxRows());
  if (h.getMaxColumns() < columnas) h.insertColumnsAfter(h.getMaxColumns(), columnas - h.getMaxColumns());
}

function asegurarRangoConNombre(ss, nombre, rango) {
  const existente = ss.getNamedRanges().find(n => n.getName() === nombre);
  if (existente) existente.setRange(rango);
  else ss.setNamedRange(nombre, rango);
}

/** "15/10/2026", "15-10-2026" o "2026-10-15" → Date (local), o null. */
function fechaDeTexto(v) {
  if (v instanceof Date) return isNaN(v) ? null : v;
  const t = String(v || '').trim();
  let m = t.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);
  if (m) {
    const a = parseInt(m[3], 10);
    return fechaValida(a < 100 ? 2000 + a : a, parseInt(m[2], 10), parseInt(m[1], 10));
  }
  m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return fechaValida(parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10));
  return null;
}

function fechaValida(a, mes, d) {
  const f = new Date(a, mes - 1, d);
  return (f.getFullYear() === a && f.getMonth() === mes - 1 && f.getDate() === d) ? f : null;
}

/** 20261015 — para IDs y huellas. Usa la hora local (la del proyecto). */
function fechaCompacta(d) {
  return String(d.getFullYear()) + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
}

/** 15/10/2026 */
function fechaCorta(d) {
  if (!(d instanceof Date)) return '';
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
}

/** "1.234,56" o "-160,00 €" o 1234.56 → número, o null. */
function numeroDeTexto(v) {
  if (typeof v === 'number') return isNaN(v) ? null : v;
  let t = String(v || '').replace(/[€\s]|EUR/gi, '').trim();
  if (!t) return null;
  if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');   // formato español
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');     // "1.000": miles, sin decimales
  else t = t.replace(/,/g, '');
  const n = parseFloat(t);
  return isNaN(n) ? null : n;
}

function redondear(n) { return Math.round((Number(n) || 0) * 100) / 100; }

function euros(n) {
  const v = redondear(n);
  const s = Math.abs(v).toFixed(2).split('.');
  return (v < 0 ? '-' : '') + s[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + s[1] + ' €';
}

/** Sin tildes, en mayúsculas, solo letras, cifras y espacios. Para comparar. */
/** ¿Dice la celda Factura que el gasto no la necesita? («No requiere · …», también escrito a mano). */
function noRequiereFactura(t) {
  return normalizarTexto(t).indexOf(normalizarTexto(CAJA.SIN_FACTURA)) === 0;
}

/** Lo que se escribe en Factura para un motivo: «No requiere · Devolución a una familia o particular». */
function textoSinFactura(motivo) { return CAJA.SIN_FACTURA + CAJA.SEPARADOR_OPCION + motivo; }

function normalizarTexto(t) {
  return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}

/** Subcarpeta con ese nombre dentro de otra; se crea si no existe. */
function subcarpeta(idPadre, nombre) {
  const padre = DriveApp.getFolderById(idPadre);
  const it = padre.getFoldersByName(nombre);
  return it.hasNext() ? it.next() : padre.createFolder(nombre);
}

/** Carpeta de este ejercicio dentro de una de las del centro (Ajustes). */
function carpetaDelEjercicio(claveConfig, ss) {
  const id = config(claveConfig);
  if (!id) throw new Error(`Falta «${CONFIG_EN_AJUSTES[claveConfig][0]}» en Ajustes: Tesorería → Ejercicio → Reparar la rellena sola.`);
  return subcarpeta(id, leerAjustes(ss).ejercicio);
}


// ==================================================================
// MENÚ Y DISPARADORES SIMPLES
// ==================================================================

/**
 * El menú Tesorería, entero en un solo sitio (como el menú JMV de BD
 * Socios). Arriba, destacado, el traspaso entre banco y efectivo: es lo
 * que hay que apuntar ANTES de ingresar efectivo en el banco, o el
 * extracto lo tomará por una cuota (ver «TRASPASOS» en 02_Extractos.js).
 * Después, lo de cada día (extracto y ventanas de asientos); luego lo de
 * cada cierto tiempo; y al final, en submenús, lo técnico.
 *
 * Cada opción nombra su función por texto y solo aparece si existe en el
 * proyecto (limpiarMenu()). Si añades una función de menú, añádela aquí.
 */
function entradasDelMenu(consola) {
  return [
    ['Abrir el panel de tesorería', 'abrirPanel'],
    ['⇄ Traspaso entre banco y efectivo…', 'abrirApuntarTraspaso'],
    '-',
    ['Importar extracto bancario…', 'abrirImportarExtracto'],
    ['Nuevo gasto por transferencia…', 'abrirNuevaTransferencia'],
    ['Completar movimientos del banco (tarjeta…)…', 'abrirMovimientosPorCompletar'],
    ['Facturas que faltan…', 'abrirFacturasQueFaltan'],
    ['Ingreso o gasto en efectivo…', 'abrirEfectivo'],
    '-',
    ['Sincronizar cuotas con BD Socios', 'sincronizarConBdSociosAhora'],
    ['Generar informe contable…', 'abrirInformes'],
    '-',
    { sub: 'Caja', entradas: [
      ['Ordenar por fecha de pago', 'ordenarCajaAhora'],
      ['Asignar los ID de transacción que falten', 'asignarIdsQueFaltan'],
      ['Dividir el asiento seleccionado…', 'dividirAsientoSeleccionado'],
      '-',
      ['Convertir el asiento seleccionado en traspaso', 'convertirEnTraspasoSeleccionado'],
      ['El asiento seleccionado no es un traspaso', 'deshacerTraspasoSeleccionado'],
      '-',
      ['Adjuntar factura al asiento seleccionado…', 'abrirAdjuntarFactura'],
      ['Vincular facturas subidas a la carpeta', 'vincularFacturasDeLaCarpeta']
    ] },
    { sub: 'Actividades', entradas: [
      ['Nueva hoja de actividad…', 'abrirNuevaActividad'],
      ['Nueva hoja de financiación…', 'abrirNuevaFinanciacion'],
      ['Actualizar la lista de subpartidas', 'actualizarListaSubpartidasAhora']
    ] },
    { sub: 'Ejercicio', entradas: [
      ['Crear estructura', 'crearEstructura'],
      ['Reparar fórmulas, formatos y protecciones', 'repararEstructura'],
      '-',
      ['Crear el ejercicio siguiente…', 'crearEjercicioSiguiente'],
      ['Traer los saldos iniciales del ejercicio anterior', 'traerSaldosInicialesDelAnterior']
    ] },
    { sub: 'Diagnóstico', entradas: [
      ['Diagnóstico del sistema', 'diagnostico'],
      ['Ejecutar las pruebas', 'ejecutarPruebas'],
      '-',
      ['Instalar sincronización automática (cada hora)', 'instalarSincronizacionAutomatica'],
      ['Quitar sincronización automática', 'quitarSincronizacionAutomatica']
    ] }
  ].concat(consola ? ['-', { sub: 'Consola nacional', entradas: [
    ['Buscar los centros en las unidades compartidas', 'consolaBuscarCentros'],
    ['Actualizar el estado de todos los centros', 'consolaActualizarEstado'],
    '-',
    ['Crear los libros que falten del ejercicio…', 'consolaCrearLibros'],
    ['Reparar la estructura de todos los libros', 'consolaRepararTodos'],
    '-',
    ['Informe nacional…', 'consolaInformeNacional'],
    '-',
    ['Lista de programas para desplegar…', 'consolaListaDeProgramas'],
    ['Actualizar el estado cada noche', 'consolaInstalarActualizacion']
  ] }] : []);
}

/**
 * Quita las opciones cuya función no existe, los submenús que se quedan
 * vacíos y los separadores sobrantes. Pura (recibe `existe`).
 */
function limpiarMenu(entradas, existe) {
  const salida = [];
  entradas.forEach(e => {
    if (e === '-') { if (salida.length && salida[salida.length - 1] !== '-') salida.push('-'); return; }
    if (Array.isArray(e)) { if (existe(e[1])) salida.push(e); return; }
    const dentro = limpiarMenu(e.entradas, existe);
    if (dentro.length) salida.push({ sub: e.sub, entradas: dentro });
  });
  while (salida.length && salida[salida.length - 1] === '-') salida.pop();
  return salida;
}

function pintarMenu(ui, menu, entradas) {
  entradas.forEach(e => {
    if (e === '-') menu.addSeparator();
    else if (Array.isArray(e)) menu.addItem(e[0], e[1]);
    else menu.addSubMenu(pintarMenu(ui, ui.createMenu(e.sub), e.entradas));
  });
  return menu;
}

/**
 * El código va vinculado a cada libro (CLAUDE.md §2: las personas de
 * tesorería usan @gmail y un complemento interno no les llegaría), así que
 * el menú sale arriba, «Tesorería». Si algún día se publica como
 * complemento, va solo a Extensiones (esComplemento()). La consola nacional
 * solo sale en el libro de la consola.
 */
function onOpen(e) {
  const ui = SpreadsheetApp.getUi();
  const existe = nombre => typeof globalThis[nombre] === 'function';
  let consola = false;
  try {
    const modo = e && e.authMode;
    if (modo !== ScriptApp.AuthMode.NONE && typeof esLibroDeConsola === 'function') consola = esLibroDeConsola(libro());
  } catch (err) { consola = false; }
  const menu = esComplemento() ? ui.createAddonMenu() : ui.createMenu('Tesorería');
  pintarMenu(ui, menu, limpiarMenu(entradasDelMenu(consola), existe)).addToUi();
  try { registrarPrograma(libro()); } catch (err) { /* sin permiso para escribir: no pasa nada */ }
}

/**
 * Apunta en Ajustes el ID del script de este libro (cada libro tiene el
 * suyo, y cada copia anual uno nuevo). La consola no puede saberlo desde
 * fuera (no hay forma de pasar de una hoja a su script): lo recoge de aquí
 * para que el despliegue sepa a qué proyectos subir cada versión. Se llama
 * al abrir, al reparar y desde el panel, la ventana de asientos y el
 * Diagnóstico; solo escribe si cambia.
 */
function registrarPrograma(ss) {
  if (esComplemento() || !ss || !ss.getSheetByName(HOJAS.AJUSTES)) return;
  const id = ScriptApp.getScriptId();
  conLibro(ss, () => {
    if (String(mapaDeAjustes()[AJUSTES.PROGRAMA] || '').trim() !== id) {
      escribirAjuste(ss, AJUSTES.PROGRAMA, id, 'Lo escribe el libro al abrirse. La consola lo usa para subir las versiones nuevas del programa.');
    }
  });
}

/** Al instalar el complemento, el menú tiene que salir ya, sin recargar. */
function onInstall(e) { onOpen(e); }

/** ¿Corre como complemento (y no como script vinculado a un libro)? */
function esComplemento() {
  try { return ScriptApp.getInstallationSource() !== ScriptApp.InstallationSource.NONE; }
  catch (e) { return false; }
}

/**
 * Disparador simple. Solo toca este mismo libro (los simples no pueden
 * abrir otros archivos ni pedir permisos), y tiene que ser rápido.
 */
function onEdit(e) {
  try {
    if (!e || !e.range) return;
    const h = e.range.getSheet();
    if (h.getName() === HOJAS.CAJA) alEditarCaja(e);
    else if (esHojaDeActividad(h)) alEditarActividad(e);
  } catch (err) {
    console.error('onEdit: ' + err.message);
  }
}
