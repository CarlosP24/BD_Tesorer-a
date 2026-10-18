/*******************************************************************
 * JMV — TESORERÍA · Cuotas de socio y BD Socios
 *
 * Dos cosas:
 *
 * 1. IDENTIFICAR (identificarSocio(), puro). Quién paga una cuota, a
 *    partir del concepto del banco. En este orden:
 *      a) el número de socio escrito (JMV-000130, Jmv000130…), si tiene
 *         inscripción en el curso y el nombre del concepto no es el de
 *         OTRO socio;
 *      b) el nombre del socio en el concepto: nombre de pila obligatorio
 *         (es lo único que distingue a dos hermanos) y al menos un
 *         apellido, con ventaja clara sobre el segundo candidato;
 *      c) el ordenante, solo si es el propio socio con todos sus nombres
 *         y apellidos (un adulto que paga su cuota);
 *      d) el ordenante como tutor/a de una familia con un solo socio
 *         inscrito y cuyo importe coincide con su cuota.
 *    Ante la duda no se adivina: se deja vacío con una nota que dice a
 *    quién se parece.
 *
 * 2. SINCRONIZAR (planificarSincronizacion(), puro, y
 *    sincronizarConBdSocios()). Cada asiento de Caja con ID de socio
 *    queda reflejado en la pestaña Pagos de BD Socios con
 *    Referencia = TES-<ID de transacción>:
 *      - si esa inscripción tiene un pago sin conciliar (el que crea el
 *        formulario de Tally con el justificante, con el Importe vacío),
 *        se concilia: Importe, Medio, Referencia y Conciliado = Sí;
 *      - si no, se crea un pago nuevo, marcado "[Tesorería]" en Notas;
 *      - si el ID de socio se cambia o se borra en Caja, se deshace lo
 *        anterior: el pago creado se borra y el conciliado vuelve a
 *        estar sin conciliar.
 *    Después se recalculan Importe_pagado, Cuota_pagada y Fecha_pago de
 *    las inscripciones afectadas, con la misma regla que
 *    recalcularPagos() de BD Socios (00_estructura.js). SI ESA REGLA
 *    CAMBIA ALLÍ, HAY QUE CAMBIARLA AQUÍ (estadoDeCuota()).
 *
 * En Caja, la columna «BD Socios» dice qué se ha hecho (✓ PAG-000123) o
 * qué impide hacerlo (⚠ …).
 *******************************************************************/

const SOCIOS = {
  // Lo que BD Socios tiene que tener para que esto funcione.
  COLUMNAS: {
    Socios: ['ID_SOCIO', 'ID_FAMILIA', 'Nombre', 'Apellidos'],
    Familias: ['ID_FAMILIA', 'Tutor1_nombre', 'Tutor2_nombre'],
    Inscripciones: ['ID_INSCRIPCION', 'ID_SOCIO', 'Curso_id', 'Estado', 'Tramo_cuota', 'Importe_cuota',
                    'Bonificacion', 'Importe_pagado', 'Cuota_pagada', 'Fecha_pago'],
    Pagos: ['ID_PAGO', 'ID_INSCRIPCION', 'ID_SOCIO', 'Curso_id', 'Fecha', 'Importe', 'Medio',
            'Referencia', 'Concepto', 'Conciliado', 'Notas']
  },
  // Marca de los pagos que ha creado Tesorería (y que, por tanto, puede borrar).
  MARCA_CREADO: '[Tesorería]',
  // Método de pago de Caja → lista Medio de BD Socios.
  MEDIOS: { 'Transferencia': 'Transferencia', 'Bizum': 'Bizum', 'Efectivo': 'Efectivo',
            'Ingreso en cajero': 'Efectivo', 'Domiciliación': 'Domiciliación' },
  // Palabras del concepto que no son nombres.
  VACIAS: ['CUOTA', 'CUOTAS', 'JMV', 'PAGO', 'PAGOS', 'DE', 'DEL', 'LA', 'LAS', 'LOS', 'EL', 'Y', 'E', 'A',
           'SOCIO', 'SOCIA', 'SOCIOS', 'ANUAL', 'CURSO', 'CONCEPTO', 'PARA', 'POR', 'HIJO', 'HIJA', 'HIJOS',
           'INSCRIPCION', 'MATRICULA', 'TRANSFERENCIA', 'INMEDIATA', 'ORDENANTE', 'INGRESO', 'AÑO', 'ANO'],
  PARTICULAS: ['DE', 'DEL', 'LA', 'LAS', 'LOS', 'Y', 'E', 'DA', 'DAS', 'DO', 'DOS', 'VAN', 'VON', 'DI'],
  VENTAJA_MINIMA: 2
};


// ==================================================================
// LEER BD SOCIOS
// ==================================================================

function abrirBdSocios() {
  const id = config('ID_BD_SOCIOS');
  if (!id) throw new Error('Falta ID_BD_SOCIOS en Config.js.');
  return SpreadsheetApp.openById(id);
}

/** { hoja, cab, filas: [{ _fila, columna: valor… }] }, comprobando columnas. */
function tablaDeBdSocios(bd, nombre) {
  const hoja = bd.getSheetByName(nombre);
  if (!hoja) throw new Error(`BD Socios no tiene la pestaña «${nombre}».`);
  const datos = hoja.getDataRange().getValues();
  const cab = datos[0].map(c => String(c).trim());
  const faltan = SOCIOS.COLUMNAS[nombre].filter(c => cab.indexOf(c) < 0);
  if (faltan.length) throw new Error(`A la pestaña «${nombre}» de BD Socios le faltan columnas: ${faltan.join(', ')}.`);
  const filas = [];
  datos.slice(1).forEach((f, i) => {
    if (f.join('') === '') return;
    const o = { _fila: i + 2 };
    cab.forEach((c, j) => { o[c] = f[j]; });
    filas.push(o);
  });
  return { hoja: hoja, cab: cab, filas: filas };
}

/**
 * Lo necesario para identificar socios en los movimientos del curso:
 * { candidatos, curso, tramos, titular }.
 * candidatos: [{ id, nombre, apellidos, familia, tutores: [], tramo, cuota }]
 */
function prepararIdentificacion(aj) {
  const bd = abrirBdSocios();
  const socios = {}, familias = {};
  tablaDeBdSocios(bd, 'Socios').filas.forEach(s => { socios[String(s.ID_SOCIO).trim()] = s; });
  tablaDeBdSocios(bd, 'Familias').filas.forEach(f => { familias[String(f.ID_FAMILIA).trim()] = f; });
  const candidatos = [];
  tablaDeBdSocios(bd, 'Inscripciones').filas.forEach(ins => {
    if (String(ins.Curso_id).trim() !== aj.curso) return;
    if (String(ins.Estado).trim() === 'Anulada') return;
    const s = socios[String(ins.ID_SOCIO).trim()];
    if (!s) return;
    const fam = familias[String(s.ID_FAMILIA || '').trim()];
    candidatos.push({
      id: String(s.ID_SOCIO).trim(), nombre: String(s.Nombre || ''), apellidos: String(s.Apellidos || ''),
      familia: String(s.ID_FAMILIA || '').trim(),
      tutores: fam ? [fam.Tutor1_nombre, fam.Tutor2_nombre].filter(Boolean).map(String) : [],
      tramo: String(ins.Tramo_cuota || '').trim(),
      cuota: numeroDeTexto(ins.Importe_cuota)
    });
  });
  return { candidatos: candidatos, curso: aj.curso, tramos: aj.tramos, titular: config('TITULAR_CUENTA') };
}

/** identificarSocio() + partida + la nota que se pone en la celda. */
function identificarMovimiento(m, ctx) {
  const r = identificarSocio(m.concepto, m.importe, ctx);
  const quien = id => { const c = ctx.candidatos.find(x => x.id === id); return c ? `${id} (${c.nombre} ${c.apellidos})` : id; };
  if (!r.ids.length) {
    r.nota = r.pista ? 'Sin identificar. ' + r.pista : '';
    return r;
  }
  const partidas = r.ids.map(id => {
    const c = ctx.candidatos.find(x => x.id === id);
    return c ? (ctx.tramos[c.tramo] || '') : '';
  });
  r.partida = partidas.every(p => p && p === partidas[0]) ? partidas[0] : '';
  const como = { codigo: 'por el número de socio del concepto', nombre: 'por el nombre',
                 tutor: 'por el nombre del tutor/a que paga. Compruébalo' }[r.por];
  r.nota = `Identificado ${como}: ${r.ids.map(quien).join(', ')}.`
    + (r.ids.length > 1 && !r.partida ? ' Son de tramos distintos: divide el asiento (Caja → Dividir) y pon a cada parte su partida.' : '');
  return r;
}


// ==================================================================
// IDENTIFICAR (puro)
// ==================================================================

/**
 * texto: el concepto del banco entero. importe: lo que ha entrado.
 * ctx: { candidatos, curso, titular }.
 * Devuelve { ids: [...], por: 'codigo'|'nombre'|'tutor', pista }.
 */
function identificarSocio(texto, importe, ctx) {
  const partes = partirConcepto(texto);
  const quien = c => `${c.id} (${c.nombre} ${c.apellidos})`;

  // a) Número de socio.
  const codigos = idsDeSocioEnTexto(texto);
  const porNombre = mejorPorNombre(partes.concepto, ctx.candidatos, importe, false);
  if (codigos.length) {
    const encontrados = codigos.map(id => ctx.candidatos.find(c => c.id === id)).filter(Boolean);
    if (encontrados.length === codigos.length) {
      const otro = porNombre.ids.length === 1 && codigos.indexOf(porNombre.ids[0]) < 0
        ? ctx.candidatos.find(c => c.id === porNombre.ids[0]) : null;
      if (otro) {
        return { ids: [], pista: `El concepto lleva el número ${codigos.join(', ')}, pero el nombre es el de `
          + `${quien(otro)}: o el número está mal escrito, o paga por otra persona.` };
      }
      return { ids: encontrados.map(c => c.id), por: 'codigo' };
    }
  }
  const sinInscripcion = codigos.filter(id => !ctx.candidatos.some(c => c.id === id));
  const avisoCodigo = sinInscripcion.length
    ? `El concepto lleva ${sinInscripcion.join(', ')}, sin inscripción en el curso ${ctx.curso || ''}. ` : '';

  // b) Nombre en el concepto.
  if (porNombre.ids.length) return { ids: porNombre.ids, por: 'nombre', pista: avisoCodigo };

  // c) y d) El ordenante, si no es la propia asociación ingresando en cajero.
  let pistaOrdenante = '';
  if (partes.ordenante && !(ctx.titular && mismoNombre(partes.ordenante, ctx.titular))) {
    const propio = mejorPorNombre(partes.ordenante, ctx.candidatos, importe, true);
    if (propio.ids.length) return { ids: propio.ids, por: 'nombre', pista: avisoCodigo };
    const tutor = porTutor(partes.ordenante, importe, ctx.candidatos);
    if (tutor.ids.length) return { ids: tutor.ids, por: 'tutor', pista: avisoCodigo };
    pistaOrdenante = tutor.pista || propio.pista || '';
  }
  return { ids: [], pista: (avisoCodigo + (porNombre.pista || pistaOrdenante || '')).trim() };
}

/**
 * "Transferencia Inmediata De X, Concepto Y" → { ordenante: X, concepto: Y }
 * "Ingreso … Concepto: Y. Ordenante: X."     → { ordenante: X, concepto: Y }
 */
function partirConcepto(texto) {
  const t = String(texto || '').trim();
  let m = t.match(/^(?:transferencia|transf\.?|bizum|traspaso)(?:\s+inmediata)?(?:\s+recibida)?\s+de\s+(.+?)\s*,\s*(?:concepto[:\s]+)?(.*)$/i);
  if (m) return { ordenante: m[1].trim(), concepto: m[2].replace(/^[\s.,;:-]+|[\s.,;:-]+$/g, '').trim() };
  m = t.match(/concepto:\s*(.*?)\.?\s*ordenante:\s*(.+?)\.?$/i);
  if (m) return { ordenante: m[2].trim(), concepto: m[1].trim() };
  m = t.match(/concepto[:\s]+(.+)$/i);
  if (m) return { ordenante: '', concepto: m[1].trim() };
  return { ordenante: '', concepto: t };
}

/**
 * Números de socio escritos en el texto, ya normalizados (JMV-000130).
 * "JMV 2026" o "Jmv-2027" no cuentan: un número de cuatro cifras sin
 * ceros delante que parece un año es el curso, no un socio.
 */
function idsDeSocioEnTexto(texto) {
  const ids = [];
  const patron = /JMV\s*[-_.·]?\s*(\d{1,6})(?!\d)/gi;
  let m;
  while ((m = patron.exec(String(texto || ''))) !== null) {
    const crudo = m[1];
    if (!(crudo.length === 6 || crudo[0] === '0' || parseInt(crudo, 10) < 1900)) continue;
    const id = 'JMV-' + String(parseInt(crudo, 10)).padStart(6, '0');
    if (ids.indexOf(id) < 0) ids.push(id);
  }
  return ids;
}

/** Palabras con las que comparar: sin cifras, sin "cuota", sin "jmv". */
function palabrasDeConcepto(texto) {
  return normalizarTexto(texto).replace(/\d+/g, ' ').split(' ')
    .map(p => p.replace(/^CUOTAS?(?=[A-Z]{3})/, '').replace(/([A-Z]{3})CUOTAS?$/, '$1'))
    .filter(p => p.length >= 2 && SOCIOS.VACIAS.indexOf(p) < 0);
}

function palabrasDeNombre(texto) {
  return normalizarTexto(texto).split(' ').filter(w => w.length >= 2 && SOCIOS.PARTICULAS.indexOf(w) < 0);
}

/**
 * ¿Está la palabra w? Entera; con una letra de diferencia si es larga
 * (salvo `exacta`); o pegada dentro de una palabra mucho más larga
 * ("GARCIALOPEZ", "MARIAISABELROBLES"): hay quien escribe el
 * concepto sin espacios.
 *
 * Los nombres de pila van con `exacta`: Daniel/Daniela, Manuel/Manuela
 * o Mario/María se diferencian en una letra y pueden ser hermanos.
 */
function aparece(w, palabras, exacta) {
  if (palabras.indexOf(w) >= 0) return true;
  if (!exacta && w.length >= 5 && palabras.some(p => Math.abs(p.length - w.length) <= 1 && distanciaDeEdicion(p, w) <= 1)) return true;
  if (w.length >= 4 && palabras.some(p => p.length >= w.length + 3 && p.indexOf(w) >= 0)) return true;
  return false;
}

/**
 * Puntos de un candidato: sin ningún nombre de pila, 0. Luego 3 por el
 * primer nombre que aparece, +1 por cada otro, −1 por cada nombre suyo
 * que NO aparece (así "Juan David" y "David Alexander", hermanos, no
 * empatan cuando el concepto dice "Juan David") y +2 por apellido.
 */
function puntosDeSocio(c, palabras) {
  const nombres = palabrasDeNombre(c.nombre), apellidos = palabrasDeNombre(c.apellidos);
  const nm = nombres.filter(w => aparece(w, palabras, true)).length;
  const ap = apellidos.filter(w => aparece(w, palabras)).length;
  if (!nm) return { pts: 0, nombres: 0, apellidos: ap, completo: false, todosApellidos: ap === apellidos.length && ap >= 2 };
  return {
    pts: 3 + (nm - 1) - (nombres.length - nm) + 2 * ap,
    nombres: nm, apellidos: ap,
    completo: nm === nombres.length && ap === apellidos.length,
    todosNombres: nm === nombres.length,
    todosApellidos: ap === apellidos.length && ap >= 2
  };
}

/**
 * El socio del texto por su nombre: { ids, pista }.
 * soloCompleto: exigir todos los nombres y apellidos (para el ordenante).
 */
function mejorPorNombre(texto, candidatos, importe, soloCompleto) {
  const palabras = palabrasDeConcepto(texto);
  if (!palabras.length) return { ids: [] };
  const quien = c => `${c.id} (${c.nombre} ${c.apellidos})`;
  const notas = candidatos.map(c => ({ c: c, p: puntosDeSocio(c, palabras) }));
  const conNombre = notas.filter(x => x.p.nombres > 0).sort((a, b) => b.p.pts - a.p.pts);
  const validos = conNombre.filter(x => x.p.apellidos > 0 && (!soloCompleto || x.p.completo));

  if (!validos.length) {
    if (soloCompleto) return { ids: [] };
    const porApellidos = notas.filter(x => x.p.nombres === 0 && x.p.todosApellidos);
    if (porApellidos.length === 1) {
      return { ids: [], pista: `Coinciden los apellidos de ${quien(porApellidos[0].c)}, pero no el nombre de pila.` };
    }
    return { ids: [], pista: conNombre.length === 1
      ? `Se parece a ${quien(conNombre[0].c)}, pero no se lee ningún apellido.` : '' };
  }

  const a = validos[0];
  const b = conNombre.find(x => x !== a);
  if (!b || a.p.pts - b.p.pts >= SOCIOS.VENTAJA_MINIMA) return { ids: [a.c.id] };

  // Dos o más socios en el mismo pago ("Cuota Lucía y Pablo García"):
  // todos con su nombre completo, y el importe es la suma de sus cuotas.
  const completos = validos.filter(x => x.p.todosNombres);
  if (completos.length >= 2 && importe !== null && importe !== undefined) {
    const suma = redondear(completos.reduce((s, x) => s + (x.c.cuota || 0), 0));
    if (suma === redondear(importe)) return { ids: completos.map(x => x.c.id) };
  }
  return { ids: [], pista: `Podría ser ${quien(a.c)} o ${quien(b.c)}: no se distingue con seguridad.` };
}

/** El ordenante es tutor/a de una familia: { ids, pista }. */
function porTutor(ordenante, importe, candidatos) {
  const palabras = palabrasDeConcepto(ordenante);
  if (!palabras.length) return { ids: [] };
  const familias = {};
  candidatos.forEach(c => {
    if (!c.familia) return;
    c.tutores.forEach(t => {
      const w = palabrasDeNombre(t);
      if (w.length < 2) return;
      const hay = w.filter(x => aparece(x, palabras)).length;
      // Los bancos recortan los nombres largos: con cuatro palabras o
      // más se admite que falte una.
      if (hay === w.length || (w.length >= 4 && hay >= w.length - 1)) {
        familias[c.familia] = familias[c.familia] || {};
        familias[c.familia][c.id] = c;
      }
    });
  });
  const claves = Object.keys(familias);
  if (!claves.length) return { ids: [] };
  if (claves.length > 1) return { ids: [], pista: `${ordenante} coincide con tutores de varias familias.` };
  const hijos = Object.keys(familias[claves[0]]).map(id => familias[claves[0]][id]);
  const nombres = hijos.map(c => `${c.id} (${c.nombre} ${c.apellidos})`).join(', ');
  if (hijos.length === 1 && hijos[0].cuota !== null && redondear(hijos[0].cuota) === redondear(importe)) {
    return { ids: [hijos[0].id] };
  }
  const suma = redondear(hijos.reduce((s, c) => s + (c.cuota || 0), 0));
  if (hijos.length > 1 && suma === redondear(importe)) return { ids: hijos.map(c => c.id) };
  return { ids: [], pista: `Paga ${ordenante}, tutor/a de ${nombres}, pero el importe no coincide con `
    + (hijos.length > 1 ? 'ninguna cuota ni con su suma.' : 'su cuota.') };
}

/** ¿Es el mismo nombre? (para reconocer a la propia asociación). */
function mismoNombre(a, b) {
  const pa = palabrasDeConcepto(a), pb = palabrasDeNombre(b).filter(w => w.length >= 3);
  if (!pb.length) return false;
  return pb.filter(w => aparece(w, pa)).length / pb.length >= 0.6;
}

function distanciaDeEdicion(a, b) {
  let previa = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const fila = [i];
    for (let j = 1; j <= b.length; j++) {
      fila[j] = Math.min(previa[j] + 1, fila[j - 1] + 1, previa[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previa = fila;
  }
  return previa[b.length];
}


// ==================================================================
// SINCRONIZAR (plan puro)
// ==================================================================

/**
 * "JMV-000042, JMV-000043@2027-2028" → [{ idSocio, curso }], o null si
 * algo no tiene ese formato. curso vacío = el del ejercicio.
 */
function idsDeCelda(texto) {
  const trozos = String(texto || '').toUpperCase().split(/[,;\s]+/).filter(Boolean);
  const r = [];
  for (const t of trozos) {
    const m = t.match(/^(JMV-\d{6})(?:@(\d{4}-\d{4}))?$/);
    if (!m) return null;
    r.push({ idSocio: m[1], curso: m[2] || '' });
  }
  return r;
}

/** Qué pagos debería tener en BD Socios una fila de Caja. */
function pagosDeseados(f, insPorId, curso) {
  // Ya contado en el saldo inicial: este ejercicio no lo lleva a BD
  // Socios, y si la importación lo había enlazado, se deshace.
  if (f.partida === CAJA.EJERCICIO_ANTERIOR) return { asignaciones: [] };
  if (!f.idSocio) return { asignaciones: [] };
  const ids = idsDeCelda(f.idSocio);
  if (!ids || !ids.length) return { error: 'El ID de socio no tiene el formato JMV-000000.' };
  if (f.partida === CAJA.TRASPASO) {
    return { error: 'Un traspaso entre banco y efectivo no es el pago de una cuota: la cuota cobrada en mano '
      + 'va en su propia fila de Efectivo, con el ID de socio. Quítalo de aquí.' };
  }
  if (f.cantidad === null || f.cantidad <= 0) return { error: 'Hay un ID de socio en un asiento que no es un ingreso.' };
  const vistos = {};
  const asignaciones = [];
  for (const x of ids) {
    const idIns = `${x.idSocio}@${x.curso || curso}`;
    if (vistos[idIns]) return { error: `${x.idSocio} está dos veces.` };
    vistos[idIns] = true;
    const ins = insPorId[idIns];
    if (!ins) return { error: `${x.idSocio} no tiene inscripción en el curso ${x.curso || curso}.` };
    asignaciones.push({ idIns: idIns, idSocio: x.idSocio, curso: x.curso || curso,
      cuota: numeroDeTexto(ins.Importe_cuota), tramo: String(ins.Tramo_cuota || '').trim() });
  }
  if (asignaciones.length === 1) {
    asignaciones[0].importe = redondear(f.cantidad);
  } else {
    const suma = redondear(asignaciones.reduce((s, a) => s + (a.cuota || 0), 0));
    if (suma !== redondear(f.cantidad)) {
      return { error: `El ingreso (${euros(f.cantidad)}) no es la suma de sus cuotas (${euros(suma)}): `
        + 'divide el asiento (Caja → Dividir el asiento seleccionado).' };
    }
    asignaciones.forEach(a => { a.importe = redondear(a.cuota); });
  }
  return { asignaciones: asignaciones };
}

/**
 * caja: filas de leerCaja(). pagos, inscripciones: filas de BD Socios.
 * aj: { curso, inicio, fin, tramos }. hoy: Date.
 * Devuelve {
 *   cambiar: [{ _fila, ID_PAGO, cambios }], crear: [{ registro, filaCaja }],
 *   borrar: [{ _fila, ID_PAGO }], estados: { filaCaja: [texto | {crear: i}] },
 *   errores: { filaCaja: texto }, partidas: { filaCaja: partida }, afectadas: [ID_INSCRIPCION]
 * }
 */
function planificarSincronizacion(caja, pagos, inscripciones, aj, hoy) {
  const insPorId = {};
  inscripciones.forEach(i => { insPorId[String(i.ID_INSCRIPCION).trim()] = i; });
  const porRef = {};
  pagos.forEach(p => {
    const r = String(p.Referencia || '').trim();
    if (r.indexOf(PREFIJO_REFERENCIA) === 0) (porRef[r] = porRef[r] || []).push(p);
  });
  const plan = { cambiar: [], crear: [], borrar: [], estados: {}, errores: {}, partidas: {}, afectadas: [] };
  const afectadas = {};
  const usados = {};
  Object.keys(porRef).forEach(r => porRef[r].forEach(p => { usados[p._fila] = true; }));
  const nota = (previa, texto) => (String(previa || '').trim() ? String(previa).trim() + ' · ' : '') + texto;
  const dia = fechaCorta(hoy);
  const creado = p => String(p.Notas || '').indexOf(SOCIOS.MARCA_CREADO) === 0;

  const deshacer = (p, motivo) => {
    afectadas[String(p.ID_INSCRIPCION).trim()] = true;
    if (creado(p)) { plan.borrar.push({ _fila: p._fila, ID_PAGO: p.ID_PAGO }); return; }
    plan.cambiar.push({ _fila: p._fila, ID_PAGO: p.ID_PAGO, cambios: {
      Importe: '', Referencia: '', Conciliado: 'No',
      Notas: nota(p.Notas, `Desconciliado desde Tesorería el ${dia} (${motivo}).`) } });
  };

  const idsEnCaja = {};
  caja.forEach(f => { if (f.id) idsEnCaja[f.id] = true; });

  caja.forEach(f => {
    if (!f.id) {
      if (f.idSocio) plan.errores[f.fila] = 'El asiento no tiene ID de transacción: le falta la Fecha.';
      return;
    }
    const ref = PREFIJO_REFERENCIA + f.id;
    const vinculados = (porRef[ref] || []).slice();
    const d = pagosDeseados(f, insPorId, aj.curso);
    if (d.error) { plan.errores[f.fila] = d.error; return; }   // no se toca nada hasta que se arregle
    if (!d.asignaciones.length && !vinculados.length) return;

    // Primero se decide todo para esta fila; solo si no hay ningún
    // problema se pasa al plan.
    const local = { cambiar: [], crear: [], partes: [] };
    const medio = SOCIOS.MEDIOS[f.metodo] || 'Otro';
    let problema = '';
    d.asignaciones.forEach(a => {
      if (problema) return;
      const i = vinculados.findIndex(p => String(p.ID_INSCRIPCION).trim() === a.idIns);
      if (i >= 0) {
        // Ya estaba enlazado: se pone al día si ha cambiado algo en Caja.
        const p = vinculados.splice(i, 1)[0];
        const cambios = {};
        if (redondear(numeroDeTexto(p.Importe)) !== a.importe) cambios.Importe = a.importe;
        if (String(p.Medio || '') !== medio) cambios.Medio = medio;
        if (String(p.Conciliado || '') !== 'Sí') cambios.Conciliado = 'Sí';
        if (creado(p) && f.fechaEfectiva && !(p.Fecha instanceof Date && fechaCompacta(p.Fecha) === fechaCompacta(f.fechaEfectiva))) {
          cambios.Fecha = f.fechaEfectiva;
        }
        if (Object.keys(cambios).length) {
          local.cambiar.push({ _fila: p._fila, ID_PAGO: p.ID_PAGO, cambios: cambios });
          afectadas[a.idIns] = true;
        }
        local.partes.push(p.ID_PAGO + (creado(p) ? '' : ' (conciliado)'));
        return;
      }
      // Un pago sin conciliar de esa inscripción (el de Tally).
      const libres = pagos.filter(p => !usados[p._fila] && String(p.ID_INSCRIPCION).trim() === a.idIns
        && !String(p.Referencia || '').trim() && String(p.Conciliado || '') !== 'Sí');
      const encajan = libres.filter(p => p.Importe === '' || p.Importe === null
        || redondear(numeroDeTexto(p.Importe)) === a.importe);
      if (encajan.length) {
        const p = encajan[0];
        usados[p._fila] = true;
        local.cambiar.push({ _fila: p._fila, ID_PAGO: p.ID_PAGO, cambios: {
          Importe: a.importe, Medio: medio, Referencia: ref, Conciliado: 'Sí',
          Notas: nota(p.Notas, `Conciliado desde Tesorería (${f.id}) el ${dia}.`) } });
        afectadas[a.idIns] = true;
        local.partes.push(p.ID_PAGO + ' (conciliado)');
        return;
      }
      if (libres.length) {
        problema = `${a.idSocio} tiene un pago sin conciliar en BD Socios (${libres[0].ID_PAGO}) de `
          + `${euros(numeroDeTexto(libres[0].Importe))}, y aquí entran ${euros(a.importe)}. Corrige uno de los dos.`;
        return;
      }
      local.crear.push({ filaCaja: f.fila, registro: {
        ID_INSCRIPCION: a.idIns, ID_SOCIO: a.idSocio, Curso_id: a.curso,
        Fecha: f.fechaEfectiva || '', Importe: a.importe, Medio: medio, Referencia: ref,
        Justificante_url: '', Concepto: 'Cuota ' + a.curso, Conciliado: 'Sí',
        Notas: `${SOCIOS.MARCA_CREADO} Creado desde Caja (asiento ${f.id}) el ${dia}.` } });
      afectadas[a.idIns] = true;
      local.partes.push({ crear: true });
    });
    if (problema) { plan.errores[f.fila] = problema; return; }

    // Lo enlazado que ya no corresponde (ID de socio cambiado o borrado).
    vinculados.forEach(p => deshacer(p, `el asiento ${f.id} ya no es de ${p.ID_SOCIO}`));
    local.cambiar.forEach(x => plan.cambiar.push(x));
    plan.estados[f.fila] = local.partes.map(x => {
      if (typeof x === 'string') return x;
      plan.crear.push(local.crear.shift());
      return { crear: plan.crear.length - 1 };
    });

    // Partida por tramo, solo si está vacía (lo que escribe una persona manda).
    if (!f.partida && d.asignaciones.length) {
      const ps = d.asignaciones.map(a => aj.tramos[a.tramo] || '');
      if (ps.every(p => p && p === ps[0])) plan.partidas[f.fila] = ps[0];
    }
  });

  // Pagos enlazados a asientos que ya no existen en Caja (solo los de
  // este ejercicio: el ID lleva la fecha).
  Object.keys(porRef).forEach(ref => {
    const id = ref.slice(PREFIJO_REFERENCIA.length);
    if (idsEnCaja[id]) return;
    const m = id.match(/^(\d{4})(\d{2})(\d{2})-/);
    const fecha = m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
    if (!fecha || fecha < aj.inicio || fecha > aj.fin) return;
    porRef[ref].forEach(p => deshacer(p, `el asiento ${id} ya no está en Caja`));
  });

  plan.afectadas = Object.keys(afectadas);
  return plan;
}

/**
 * Misma regla que recalcularPagos() de BD Socios (00_estructura.js).
 * Si cambia allí, hay que cambiarla aquí.
 */
function estadoDeCuota(pagado, debido, bonificacion) {
  if (/exenci[óo]n total/i.test(String(bonificacion || ''))) return 'Exenta';
  if (!debido) return '';
  if (pagado >= debido) return 'Sí';
  if (pagado > 0) return 'Parcial';
  return 'No';
}


// ==================================================================
// SINCRONIZAR (aplicar)
// ==================================================================

function sincronizarConBdSociosAhora() {
  const ui = SpreadsheetApp.getUi();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) { ui.alert('Hay otra importación o sincronización en marcha. Prueba en un minuto.'); return; }
  try {
    const r = sincronizarConBdSocios(SpreadsheetApp.getActiveSpreadsheet());
    ui.alert('Cuotas y BD Socios', r.lineas.join('\n\n'), ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('No se ha podido sincronizar', e.message, ui.ButtonSet.OK);
  } finally {
    lock.releaseLock();
  }
}

/** Disparador horario (instalarSincronizacionAutomatica()). Nunca toca la interfaz. */
function sincronizacionAutomatica() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    const r = sincronizarConBdSocios(SpreadsheetApp.getActiveSpreadsheet());
    if (r.hecho) registrar('INFO', 'Sincronización automática con BD Socios', r.lineas.join('\n'));
  } catch (e) {
    registrar('ERROR', 'Sincronización automática con BD Socios', e.message);
  } finally {
    lock.releaseLock();
  }
}

function instalarSincronizacionAutomatica() {
  quitarSincronizacionAutomatica(true);
  ScriptApp.newTrigger('sincronizacionAutomatica').timeBased().everyHours(1).create();
  SpreadsheetApp.getUi().alert('Listo: cada hora se sincronizarán con BD Socios las cuotas de Caja. '
    + 'Instálalo solo en el libro del ejercicio en curso.');
}

function quitarSincronizacionAutomatica(silencioso) {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'sincronizacionAutomatica')
    .forEach(t => ScriptApp.deleteTrigger(t));
  if (silencioso !== true) SpreadsheetApp.getUi().alert('Sincronización automática quitada.');
}

/**
 * Lleva a BD Socios lo que diga Caja. Hay que llamarla con el lock del
 * script cogido. Devuelve { lineas, hecho }.
 */
function sincronizarConBdSocios(ss) {
  const aj = leerAjustes(ss);
  const bd = abrirBdSocios();
  const tPagos = tablaDeBdSocios(bd, 'Pagos');
  const tIns = tablaDeBdSocios(bd, 'Inscripciones');
  const caja = leerCaja(ss);
  const plan = planificarSincronizacion(caja, tPagos.filas, tIns.filas, aj, new Date());

  const hP = tPagos.hoja, cab = tPagos.cab;
  const colP = nombre => cab.indexOf(nombre) + 1;

  // Antes de tocar una fila, se comprueba que sigue siendo el mismo pago
  // (BD Socios puede haber cambiado mientras tanto).
  const comprobar = (fila, idPago) => {
    if (String(hP.getRange(fila, colP('ID_PAGO')).getValue()).trim() !== String(idPago).trim()) {
      throw new Error(`La fila ${fila} de Pagos ya no es ${idPago}: BD Socios ha cambiado mientras tanto. `
        + 'Vuelve a sincronizar.');
    }
  };
  plan.cambiar.forEach(c => comprobar(c._fila, c.ID_PAGO));
  plan.borrar.forEach(c => comprobar(c._fila, c.ID_PAGO));

  plan.cambiar.forEach(c => Object.keys(c.cambios).forEach(k =>
    hP.getRange(c._fila, colP(k)).setValue(c.cambios[k])));

  // Los nuevos, con el siguiente número leído justo antes de escribir.
  const nuevosIds = [];
  if (plan.crear.length) {
    const ids = hP.getRange(2, colP('ID_PAGO'), Math.max(hP.getLastRow() - 1, 1), 1).getValues();
    let n = ids.reduce((max, x) => Math.max(max, parseInt(String(x[0]).replace(/\D/g, ''), 10) || 0), 0);
    plan.crear.forEach(c => {
      c.registro.ID_PAGO = 'PAG-' + String(++n).padStart(6, '0');
      hP.appendRow(cab.map(k => (c.registro[k] === undefined || c.registro[k] === null) ? '' : c.registro[k]));
      nuevosIds.push(c.registro.ID_PAGO);
    });
  }
  // Los borrados, de abajo arriba para no mover los números de fila.
  plan.borrar.map(c => c._fila).sort((a, b) => b - a).forEach(f => hP.deleteRow(f));

  const recalculadas = recalcularCacheDePagos(bd, plan.afectadas);

  // Caja: estado de cada fila y partidas por tramo.
  const h = ss.getSheetByName(HOJAS.CAJA);
  let avisos = 0;
  caja.forEach(f => {
    let texto = '';
    if (plan.errores[f.fila]) { texto = '⚠ ' + plan.errores[f.fila]; avisos++; }
    else if (plan.estados[f.fila]) {
      texto = '✓ ' + plan.estados[f.fila].map(x => typeof x === 'string' ? x : plan.crear[x.crear].registro.ID_PAGO).join(', ');
    }
    if (texto !== f.bdSocios) celdaCaja(h, f.fila, 'BD Socios').setValue(texto);
    if (plan.partidas[f.fila]) celdaCaja(h, f.fila, 'Partida').setValue(plan.partidas[f.fila]);
  });

  const conciliados = plan.cambiar.filter(c => c.cambios.Referencia).length;
  const deshechos = plan.borrar.length + plan.cambiar.filter(c => c.cambios.Referencia === '').length;
  const hecho = plan.crear.length + plan.cambiar.length + plan.borrar.length > 0;
  const lineas = [hecho
    ? `BD Socios: ${plan.crear.length} pagos nuevos, ${conciliados} pagos de Tally conciliados, `
      + `${plan.cambiar.length - conciliados} actualizados, ${deshechos} deshechos. `
      + `${recalculadas} inscripciones recalculadas.`
    : 'BD Socios ya estaba al día.'];
  if (avisos) lineas.push(`⚠ ${avisos} asientos con ID de socio tienen algo que resolver: está en naranja `
    + 'en la columna «BD Socios» de Caja.');
  if (hecho) registrar('INFO', 'Sincronización con BD Socios', lineas.join('\n')
    + (nuevosIds.length ? '\nNuevos: ' + nuevosIds.join(', ') : ''));
  return { lineas: lineas, hecho: hecho };
}

/**
 * Importe_pagado, Cuota_pagada y Fecha_pago de esas inscripciones, a
 * partir de Pagos. Misma regla que recalcularPagos() de BD Socios, pero
 * solo en las filas afectadas y sin diálogos.
 */
function recalcularCacheDePagos(bd, idsInscripcion) {
  if (!idsInscripcion.length) return 0;
  const quiero = {};
  idsInscripcion.forEach(id => { quiero[id] = true; });
  const suma = {}, ultima = {};
  tablaDeBdSocios(bd, 'Pagos').filas.forEach(p => {
    const id = String(p.ID_INSCRIPCION || '').trim();
    if (!quiero[id]) return;
    suma[id] = (suma[id] || 0) + (parseFloat(p.Importe) || 0);
    if (p.Fecha instanceof Date && (!ultima[id] || p.Fecha > ultima[id])) ultima[id] = p.Fecha;
  });
  const t = tablaDeBdSocios(bd, 'Inscripciones');
  const col = n => t.cab.indexOf(n) + 1;
  let n = 0;
  t.filas.forEach(ins => {
    const id = String(ins.ID_INSCRIPCION).trim();
    if (!quiero[id]) return;
    const pagado = redondear(suma[id] || 0);
    const estado = estadoDeCuota(pagado, parseFloat(ins.Importe_cuota) || 0, ins.Bonificacion);
    t.hoja.getRange(ins._fila, col('Importe_pagado')).setValue(pagado || '');
    t.hoja.getRange(ins._fila, col('Cuota_pagada')).setValue(estado);
    t.hoja.getRange(ins._fila, col('Fecha_pago')).setValue(ultima[id] || '');
    n++;
  });
  return n;
}
