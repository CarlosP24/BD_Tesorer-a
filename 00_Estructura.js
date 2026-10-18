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
    'Huella extracto'  // identifica el movimiento del banco (oculta)
  ],

  ANCHOS: {
    'ID Transacción': 115, 'Fecha': 95, 'Concepto Banco': 320, 'Descripción': 240,
    'Partida': 75, 'Subpartida': 90, 'ID socio': 110, 'Proveedor': 170,
    'CIF proveedor': 105, 'Cantidad': 95, 'Saldo': 100, 'Factura': 200,
    'Método de pago': 125, 'Cuenta de abono': 190, 'Titular': 160,
    'Fecha de pago': 95, 'Saldo extracto': 100, 'BD Socios': 260, 'Huella extracto': 120
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

  // Siembra del primer ejercicio. Genérica a propósito: las campañas
  // concretas de cada año se añaden como partidas nuevas (I32, G32…),
  // también a mitad de curso.
  INGRESOS: [
    ['I11', 'Cuotas infantiles (10-15)'],
    ['I12', 'Cuotas PD (16-30)'],
    ['I13', 'Cuotas adultos (31+)'],
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
  TRAMOS_POR_DEFECTO: [['10-15', 'I11'], ['16-30', 'I12'], ['31+', 'I13']]
};

/** Prefijo de las protecciones que pone este script: así se reconocen. */
const PROTECCION = 'Tesorería: ';


// ==================================================================
// CONFIGURACIÓN (Config.js) — siempre por getter, ver CLAUDE.md §3
// ==================================================================

/** Un valor de Config.js, o '' si el archivo o la clave faltan. */
function config(clave) {
  try { return (CONFIG && CONFIG[clave]) ? String(CONFIG[clave]).trim() : ''; }
  catch (e) { return ''; }   // ReferenceError: no hay Config.js
}


// ==================================================================
// CREAR Y REPARAR LA ESTRUCTURA
// ==================================================================

function crearEstructura() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
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

  if (nuevas[HOJAS.AJUSTES]) sembrarAjustes(ss, anio);
  if (nuevas[HOJAS.PRESUPUESTO]) sembrarPresupuesto(ss);
  if (nuevas[HOJAS.LOG]) ss.getSheetByName(HOJAS.LOG).getRange(1, 1, 1, 4)
    .setValues([['Fecha', 'Nivel', 'Mensaje', 'Detalle']]).setFontWeight('bold');

  // La hoja que trae un Sheet nuevo ("Hoja 1"), si sigue vacía.
  ss.getSheets().forEach(h => {
    if (Object.values(HOJAS).indexOf(h.getName()) === -1 && !esHojaDeActividad(h)
        && h.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(h);
  });

  repararEstructura(true);

  ui.alert('Estructura creada',
    'Siguientes pasos:\n\n'
    + '1. Caja: escribe arriba el saldo inicial del banco y del efectivo (o déjalo vacío: '
    + 'al importar el primer extracto se propone solo).\n'
    + '2. Presupuesto: revisa las partidas y pon los importes. Puedes añadir partidas '
    + 'cuando quieras, también a mitad de curso.\n'
    + '3. Ajustes: comprueba fechas, curso y partidas de cuotas.\n'
    + '4. Tesorería → Diagnóstico → Diagnóstico del sistema.',
    ui.ButtonSet.OK);
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
  const ss = SpreadsheetApp.getActiveSpreadsheet();
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
  if (silencioso !== true) {
    SpreadsheetApp.getUi().alert('Listo: fórmulas, formatos, desplegables y protecciones al día. '
      + 'No se ha tocado ningún dato.');
  }
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
  const noAnterior = `${e}, "<>${CAJA.EJERCICIO_ANTERIOR}"`;
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
   'Huella extracto'].forEach(x => col(x).setNumberFormat('@'));
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
  col('Fecha de pago').setDataValidation(fecha);
  col('Partida').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInRange(listas.getRange('A2:A'), true).setAllowInvalid(false)
    .setHelpText('Una partida del Presupuesto; «Traspaso» para mover dinero entre banco y efectivo; '
      + '«Ejercicio anterior» para lo que llega ahora al banco pero ya está en el saldo inicial (no cuenta en nada). '
      + 'Si falta una, añádela en la hoja Presupuesto.').build());
  col('Subpartida').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInRange(listas.getRange('B2:B'), true).setAllowInvalid(true)
    .setHelpText('Las subpartidas se definen en la hoja de cada actividad.').build());
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
 * «Ejercicio anterior» cuentan 0: ya están en el saldo inicial. En
 * sintaxis inglesa: escríbela dentro de conFormulasEnIngles().
 */
function formulaDeSaldo() {
  const L = letraCaja, P = CAJA.PRIMERA_FILA;
  const c = `${L('Cantidad')}${P}:${L('Cantidad')}`;
  const m = `${L('Método de pago')}${P}:${L('Método de pago')}`;
  const e = `${L('Partida')}${P}:${L('Partida')}`;
  return `={"Saldo"; ARRAYFORMULA(LET(cantidad, ${c}, esEfectivo, ${m}="${CAJA.EFECTIVO}", `
    + `importe, IF(ISNUMBER(cantidad)*(${e}<>"${CAJA.EJERCICIO_ANTERIOR}"), cantidad, 0), `
    + `acumBanco, SCAN(0, IF(esEfectivo, 0, importe), LAMBDA(acum, valor, acum + valor)), `
    + `acumEfectivo, SCAN(0, IF(esEfectivo, importe, 0), LAMBDA(acum, valor, acum + valor)), `
    + `IF(ISNUMBER(cantidad), IF(esEfectivo, SALDO_INICIAL_EFECTIVO + acumEfectivo, SALDO_INICIAL_BANCO + acumBanco), )))}`;
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
    + 'Código: I (ingreso) o G (gasto) + número de sección (1-4) + número de partida. Ej.: I32, G32.')
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
      .setBackground(ROJO).setRanges([h.getRange(`E${P}:E`)]).build()
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
  const h = (ss || SpreadsheetApp.getActiveSpreadsheet()).getSheetByName(HOJAS.PRESUPUESTO);
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
  h.getRange('A2').setFormula(`={IFERROR(FILTER(${pres}!A${P}:A, ${pres}!A${P}:A<>""), ); `
    + `IFERROR(FILTER(${pres}!E${P}:E, ${pres}!E${P}:E<>""), ); "${CAJA.TRASPASO}"; "${CAJA.EJERCICIO_ANTERIOR}"}`);
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
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
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

function escribirAjuste(ss, clave, valor) {
  const h = ss.getSheetByName(HOJAS.AJUSTES);
  const claves = h.getRange(1, 1, h.getLastRow(), 1).getValues().map(f => String(f[0]).trim());
  const i = claves.indexOf(clave);
  if (i >= 0) h.getRange(i + 1, 2).setValue(valor);
  else h.appendRow([clave, valor, '']);
}

function registrar(nivel, mensaje, detalle) {
  try {
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJAS.LOG)
      .appendRow([new Date(), nivel, mensaje, String(detalle || '').slice(0, 5000)]);
  } catch (e) { console.error(e.message); }
}


// ==================================================================
// PROTECCIONES
//
// Dos tipos, a propósito:
//  - ESTRICTAS (solo quien las pone puede editar): lo que es copia o
//    cálculo y el script no reescribe nunca al trabajar — Cuentas, el
//    resumen del Presupuesto, la parte copiada de las hojas de actividad.
//  - DE AVISO (cualquiera puede, tras confirmar): lo que el script SÍ
//    escribe mientras trabaja (IDs, saldo, columnas técnicas, Log). Una
//    protección estricta haría fallar al script cuando lo ejecuta otra
//    persona del equipo, porque el script actúa con los permisos de
//    quien lo lanza.
// ==================================================================

function protegerHojas(ss) {
  // Fuera las protecciones que pusimos antes (se reconocen por el
  // prefijo); las que haya puesto una persona se respetan.
  ss.getProtections(SpreadsheetApp.ProtectionType.RANGE)
    .concat(ss.getProtections(SpreadsheetApp.ProtectionType.SHEET))
    .forEach(p => {
      const r = p.getRange && p.getRange();
      const enActividad = r && esHojaDeActividad(r.getSheet());
      if (String(p.getDescription()).indexOf(PROTECCION) === 0 && !enActividad) p.remove();
    });

  const caja = ss.getSheetByName(HOJAS.CAJA);
  const L = letraCaja, P = CAJA.PRIMERA_FILA;
  ['A1:A3', 'B2:C3', `D1:${L('Huella extracto')}3`].forEach(a =>
    proteger(caja.getRange(a), 'cabecera y saldos (se calculan solos)', true));
  proteger(caja.getRange(`A${P}:A`), 'ID de transacción (lo asigna el script)', true);
  proteger(caja.getRange(`${L('Saldo')}${P}:${L('Saldo')}`), 'saldo (fórmula)', true);
  proteger(caja.getRange(`${L('Saldo extracto')}${P}:${L('Huella extracto')}`), 'columnas técnicas del script', true);

  const pres = ss.getSheetByName(HOJAS.PRESUPUESTO);
  proteger(pres.getRange(`A1:H${PRESUPUESTO.FILA_CABECERA}`), 'resumen y cabecera del presupuesto', false);
  proteger(pres.getRange(`B${PRESUPUESTO.PRIMERA_FILA}:B`), 'sección (se deduce del código)', false);
  proteger(pres.getRange(`F${PRESUPUESTO.PRIMERA_FILA}:F`), 'sección (se deduce del código)', false);

  const cuentas = ss.getSheetByName(HOJAS.CUENTAS);
  proteger(cuentas.getRange('A1:H' + cuentas.getMaxRows()), 'cuentas (solo fórmulas)', false);

  proteger(ss.getSheetByName(HOJAS.AJUSTES).getDataRange(), 'ajustes del ejercicio', true);
  proteger(ss.getSheetByName(HOJAS.LOG).getRange('A:D'), 'registro del script', true);
  proteger(ss.getSheetByName(HOJAS.LISTAS).getRange('A:C'), 'listas de los desplegables', true);
}

function proteger(rango, descripcion, soloAviso) {
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

/** Carpeta de este ejercicio dentro de una de las de Config.js. */
function carpetaDelEjercicio(claveConfig, ss) {
  const id = config(claveConfig);
  if (!id) throw new Error(`Falta ${claveConfig} en Config.js.`);
  return subcarpeta(id, leerAjustes(ss).ejercicio);
}


// ==================================================================
// MENÚ Y DISPARADORES SIMPLES
// ==================================================================

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('Tesorería')
    .addItem('Importar extracto bancario…', 'abrirImportarExtracto')
    .addItem('Sincronizar cuotas con BD Socios', 'sincronizarConBdSociosAhora')
    .addSeparator()
    .addSubMenu(ui.createMenu('Caja')
      .addItem('Ordenar por fecha de pago', 'ordenarCajaAhora')
      .addItem('Asignar los ID de transacción que falten', 'asignarIdsQueFaltan')
      .addItem('Dividir el asiento seleccionado…', 'dividirAsientoSeleccionado')
      .addItem('Apuntar traspaso entre banco y efectivo…', 'abrirApuntarTraspaso')
      .addItem('Convertir el asiento seleccionado en traspaso', 'convertirEnTraspasoSeleccionado')
      .addItem('El asiento seleccionado no es un traspaso', 'deshacerTraspasoSeleccionado')
      .addSeparator()
      .addItem('Adjuntar factura al asiento seleccionado…', 'abrirAdjuntarFactura')
      .addItem('Vincular facturas subidas a la carpeta', 'vincularFacturasDeLaCarpeta'))
    .addSubMenu(ui.createMenu('Actividades')
      .addItem('Nueva hoja de actividad…', 'abrirNuevaActividad')
      .addItem('Actualizar la lista de subpartidas', 'actualizarListaSubpartidasAhora'))
    .addItem('Generar informe contable…', 'abrirInformes')
    .addSeparator()
    .addSubMenu(ui.createMenu('Ejercicio')
      .addItem('Crear estructura', 'crearEstructura')
      .addItem('Reparar fórmulas, formatos y protecciones', 'repararEstructura')
      .addSeparator()
      .addItem('Crear el ejercicio siguiente…', 'crearEjercicioSiguiente')
      .addItem('Traer los saldos iniciales del ejercicio anterior', 'traerSaldosInicialesDelAnterior'))
    .addSubMenu(ui.createMenu('Diagnóstico')
      .addItem('Diagnóstico del sistema', 'diagnostico')
      .addItem('Ejecutar las pruebas', 'ejecutarPruebas')
      .addSeparator()
      .addItem('Instalar sincronización automática (cada hora)', 'instalarSincronizacionAutomatica')
      .addItem('Quitar sincronización automática', 'quitarSincronizacionAutomatica'))
    .addToUi();
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
