/*
 * Dibuja en HTML una pantalla de Hojas de cálculo de Google con datos
 * inventados, para las capturas de la documentación de la propia hoja
 * (Caja, Presupuesto, menú Tesorería…). Es una recreación: los colores,
 * columnas y textos salen del código del proyecto, pero el marco de
 * Google está simplificado. Las ventanas (Asientos.html, Subir.html…) no
 * se recrean: generar.js las abre tal cual.
 *
 * pantalla(op) devuelve un documento HTML completo. op:
 *   titulo        nombre del archivo ("Ejercicio 26-27")
 *   celda         referencia de la celda activa ("E9") y formula (su contenido)
 *   columnas      [{ letra, ancho }] en el orden en que se ven (puede saltar
 *                 letras: así se ven las columnas fijas y lo desplazado)
 *   fijas         cuántas de esas columnas están inmovilizadas
 *   filas         [{ n, alto, celdas: [celda|null] }]; celda: { t, fondo,
 *                 color, negrita, cursiva, alinear, chip, nota, ajustar }
 *   filasFijas    número de la última fila inmovilizada (0 = ninguna)
 *   pestañas      nombres de las hojas; activa = la seleccionada
 *   menu          { entradas, resaltar, sub } para enseñar el menú Tesorería abierto
 *   capas         HTML extra encima de la cuadrícula (notas, desplegables…)
 *   llamadas      [{ n, x, y }] círculos numerados en coordenadas de página
 *   ancho         ancho de la pantalla en px
 */

const VERDE = '#188038';

function esc(t) {
  return String(t === null || t === undefined ? '' : t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const CSS = `
* { box-sizing: border-box; }
body { margin: 0; font-family: Arial, Helvetica, sans-serif; background: #fff; color: #202124; }
#pantalla { position: relative; background: #f9fbfd; }
.arriba { display: flex; align-items: center; gap: 10px; padding: 8px 14px 0; }
.icono { width: 26px; height: 34px; border-radius: 3px; background: ${VERDE}; position: relative; flex: none; }
.icono:after { content: ''; position: absolute; left: 6px; right: 6px; top: 12px; height: 12px;
  border: 2px solid #fff; background: linear-gradient(#fff,#fff) center/2px 100% no-repeat, linear-gradient(#fff,#fff) center/100% 2px no-repeat; }
.titulo { font-size: 18px; color: #1f1f1f; font-family: 'Google Sans', Arial, sans-serif; }
.compartir { margin-left: auto; background: #c2e7ff; color: #001d35; border-radius: 18px; padding: 8px 18px; font-size: 14px; font-weight: bold; }
.menus { display: flex; gap: 2px; padding: 0 0 4px 50px; margin-top: -6px; font-size: 14px; color: #1f1f1f; }
.menus span { padding: 3px 7px; border-radius: 4px; }
.menus span.abierto { background: #e8eaed; }
.barra { margin: 4px 10px 6px; height: 36px; border-radius: 18px; background: #edf2fa; display: flex; align-items: center;
  gap: 16px; padding: 0 16px; color: #444746; font-size: 14px; }
.barra b { font-weight: normal; }
.formula { display: flex; align-items: center; border-top: 1px solid #c4c7c5; border-bottom: 1px solid #c4c7c5; background: #fff; height: 28px; font-size: 13px; }
.formula .ref { width: 90px; padding-left: 10px; border-right: 1px solid #c4c7c5; height: 100%; display: flex; align-items: center; }
.formula .fx { width: 34px; text-align: center; color: #80868b; font-style: italic; border-right: 1px solid #c4c7c5; }
.formula .cont { padding-left: 10px; white-space: nowrap; overflow: hidden; }
table.rejilla { border-collapse: collapse; table-layout: fixed; background: #fff; font-size: 13px; }
table.rejilla td, table.rejilla th { border: 1px solid #e2e3e3; padding: 0 4px; height: 21px; white-space: nowrap; overflow: hidden;
  text-overflow: clip; vertical-align: bottom; }
table.rejilla th { background: #f8f9fa; color: #444746; font-weight: normal; font-size: 11px; text-align: center; vertical-align: middle; }
table.rejilla th.sel { background: #d3e3fd; color: #0b57d0; font-weight: bold; }
table.rejilla td.ajustar { white-space: normal; vertical-align: middle; line-height: 1.15; }
table.rejilla td.activa { outline: 2px solid #1a73e8; outline-offset: -2px; }
td.finFijas, th.finFijas { border-right: 4px solid #c4c7c5 !important; }
tr.finFijas td, tr.finFijas th { border-bottom: 4px solid #c4c7c5 !important; }
.chip { display: inline-flex; align-items: center; gap: 2px; background: #e8eaed; border-radius: 10px; padding: 0 6px 0 8px;
  font-size: 12px; line-height: 17px; max-width: 100%; overflow: hidden; }
.chip:after { content: '▾'; font-size: 10px; color: #5f6368; }
.trinota { position: relative; }
.trinota:before { content: ''; position: absolute; right: 0; top: 0; border-style: solid; border-width: 0 6px 6px 0;
  border-color: transparent #202124 transparent transparent; }
.pestanas { display: flex; align-items: center; gap: 2px; padding: 6px 10px; background: #f9fbfd; border-top: 1px solid #c4c7c5;
  font-size: 13px; color: #444746; }
.pestanas .mas { font-size: 18px; padding: 0 10px; color: #5f6368; }
.pestanas span.p { padding: 5px 14px; border-radius: 4px 4px 0 0; }
.pestanas span.p.activa { background: #e1e9f7; color: #0b57d0; font-weight: bold; border-radius: 16px; }
.menu { position: absolute; background: #fff; border-radius: 4px; box-shadow: 0 2px 6px 2px rgba(60,64,67,.15), 0 1px 2px rgba(60,64,67,.3);
  padding: 6px 0; font-size: 14px; color: #202124; min-width: 330px; z-index: 5; }
.menu div.op { padding: 6px 28px 6px 34px; display: flex; justify-content: space-between; white-space: nowrap; }
.menu div.op.res { background: #e8eaed; }
.menu div.op.destacada { font-weight: bold; }
.menu hr { border: 0; border-top: 1px solid #dadce0; margin: 6px 0; }
.nota { position: absolute; background: #fff; border: 1px solid #c4c7c5; box-shadow: 0 2px 6px rgba(0,0,0,.2);
  padding: 8px 10px; font-size: 13px; line-height: 1.35; width: 300px; z-index: 4; }
.desplegable { position: absolute; background: #fff; border-radius: 6px; box-shadow: 0 2px 6px 2px rgba(60,64,67,.15), 0 1px 2px rgba(60,64,67,.3);
  padding: 6px 0; font-size: 13px; z-index: 4; min-width: 260px; }
.desplegable div { padding: 6px 12px; display: flex; align-items: center; gap: 8px; }
.desplegable div.res { background: #e8f0fe; }
.desplegable .chip:after { content: ''; }
.llamada { position: absolute; width: 26px; height: 26px; border-radius: 50%; background: #C1443B; color: #fff; font-weight: bold;
  font-size: 15px; display: flex; align-items: center; justify-content: center; box-shadow: 0 1px 3px rgba(0,0,0,.4); z-index: 9; }
.marco { position: absolute; border: 3px solid #C1443B; border-radius: 6px; z-index: 8; pointer-events: none; }
`;

// El menú Tesorería va arriba (script vinculado a cada libro). Con
// op.menu.complemento se dibujaría dentro de Extensiones, como un complemento.
const MENUS = ['Archivo', 'Editar', 'Ver', 'Insertar', 'Formato', 'Datos', 'Herramientas', 'Extensiones', 'Ayuda', 'Tesorería'];
const EXTENSIONES = [['Complementos', true], ['Macros', true], ['Apps Script', false], '-', ['Tesorería JMV', true]];

function pintarMenu(entradas, resaltar, x, y) {
  const filas = entradas.map(e => {
    if (e === '-') return '<hr>';
    if (Array.isArray(e)) {
      const clase = 'op' + (e[0] === resaltar ? ' res' : '') + (/^⇄/.test(e[0]) ? ' destacada' : '');
      return `<div class="${clase}"><span>${esc(e[0])}</span></div>`;
    }
    return `<div class="op${e.sub === resaltar ? ' res' : ''}" data-sub="${esc(e.sub)}"><span>${esc(e.sub)}</span><span>▸</span></div>`;
  }).join('');
  return `<div class="menu" style="left:${x}px;top:${y}px">${filas}</div>`;
}

function pantalla(op) {
  const cols = op.columnas;
  const fijas = op.fijas || 0;
  const cabecera = '<tr><th style="width:46px"></th>' + cols.map((c, i) =>
    `<th class="${c.sel ? 'sel' : ''}${i === fijas - 1 ? ' finFijas' : ''}" style="width:${c.ancho}px">${c.letra}</th>`).join('') + '</tr>';
  const filas = op.filas.map(f => {
    const clase = f.n === op.filasFijas ? ' class="finFijas"' : '';
    return `<tr${clase} style="height:${f.alto || 21}px"><th${f.sel ? ' class="sel"' : ''}>${f.n}</th>` + cols.map((c, i) => {
      const x = (f.celdas || [])[i];
      const clases = [];
      if (i === fijas - 1) clases.push('finFijas');
      if (x && x.ajustar) clases.push('ajustar');
      if (x && x.nota) clases.push('trinota');
      if (x && x.activa) clases.push('activa');
      const estilo = [];
      if (x && x.fondo) estilo.push('background:' + x.fondo);
      if (x && x.color) estilo.push('color:' + x.color);
      if (x && x.negrita) estilo.push('font-weight:bold');
      if (x && x.cursiva) estilo.push('font-style:italic');
      if (x && x.alinear) estilo.push('text-align:' + x.alinear);
      if (x && x.grande) estilo.push('font-size:' + x.grande + 'px');
      /* Como en Sheets: el texto invade las celdas vacías de su derecha. */
      if (x && x.desborda) estilo.push('overflow:visible;position:relative;z-index:2');
      const t = !x ? '' : x.chip ? `<span class="chip">${esc(x.t)}</span>` : esc(x.t);
      return `<td id="c_${c.letra}${f.n}"${clases.length ? ` class="${clases.join(' ')}"` : ''}${estilo.length ? ` style="${estilo.join(';')}"` : ''}>${t}</td>`;
    }).join('') + '</tr>';
  }).join('');
  const ancho = op.ancho || 46 + cols.reduce((s, c) => s + c.ancho, 0) + 2;
  const comp = !!(op.menu && op.menu.complemento);
  const menus = MENUS.filter(m => !(comp && m === 'Tesorería')).map(m => {
    const abierto = op.menu && m === (comp ? 'Extensiones' : 'Tesorería');
    return `<span${abierto ? ' class="abierto"' : ''} id="menu${m === 'Tesorería' ? 'Tesoreria' : m}">${m}</span>`;
  }).join('');
  const pest = (op.pestañas || []).map(p => `<span class="p${p === op.activa ? ' activa' : ''}">${esc(p)}</span>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>
<div id="pantalla" style="width:${ancho}px">
  <div class="arriba"><div class="icono"></div><div class="titulo">${esc(op.titulo || 'Ejercicio 26-27')}</div><div class="compartir">Compartir</div></div>
  <div class="menus">${menus}</div>
  <div class="barra"><b>↶</b><b>↷</b><b>🖨</b><b>100% ▾</b><b>€</b><b>%</b><b>Arial ▾</b><b>10</b><b><u>B</u></b></div>
  <div class="formula"><div class="ref">${esc(op.celda || 'A1')}</div><div class="fx">fx</div><div class="cont">${esc(op.formula || '')}</div></div>
  <div id="cuadricula" style="position:relative"><table class="rejilla" style="width:${46 + cols.reduce((s, c) => s + c.ancho, 0)}px">${cabecera}${filas}</table></div>
  ${op.capas || ''}
  ${op.pestañas ? `<div class="pestanas"><span class="mas">+</span><span class="mas">☰</span>${pest}</div>` : ''}
  ${op.menu && comp ? `<div class="menu" id="menuExt" style="min-width:230px">${EXTENSIONES.map(e => e === '-' ? '<hr>'
    : `<div class="op${e[0] === 'Tesorería JMV' ? ' res' : ''}" ${e[0] === 'Tesorería JMV' ? 'id="opTesoreria"' : ''}><span>${e[0]}</span><span>${e[1] ? '▸' : ''}</span></div>`).join('')}</div>`
    + pintarMenu(op.menu.entradas, op.menu.resaltar, 0, 0).replace('class="menu"', 'class="menu" id="menuTes"') : ''}
  ${op.menu && !comp ? pintarMenu(op.menu.entradas, op.menu.resaltar, 0, 0).replace('class="menu"', 'class="menu" id="menuTes"') : ''}
  ${op.menu && op.menu.sub ? pintarMenu(op.menu.sub.entradas, op.menu.sub.resaltar, 0, 0).replace('class="menu"', 'class="menu" id="menuSub"') : ''}
</div>
<script>
  (function () {
    var p = document.getElementById('pantalla').getBoundingClientRect();
    function caja(sel) { var e = document.querySelector(sel); var r = e.getBoundingClientRect(); return { x: r.left - p.left, y: r.top - p.top, w: r.width, h: r.height }; }
    window.caja = caja;
    window.colocar = function (id, sel, dx, dy) { var c = caja(sel), e = document.getElementById(id); e.style.left = (c.x + (dx || 0)) + 'px'; e.style.top = (c.y + c.h + (dy || 0)) + 'px'; };
    var pantalla = document.getElementById('pantalla');
    /* Círculo numerado sobre un elemento, y recuadro alrededor de uno o varios. */
    window.llamada = function (n, sel, dx, dy) {
      var c = caja(sel), d = document.createElement('div');
      d.className = 'llamada'; d.textContent = n;
      d.style.left = (c.x + (dx || 0)) + 'px'; d.style.top = (c.y + (dy || 0)) + 'px';
      pantalla.appendChild(d);
    };
    window.recuadro = function (desde, hasta) {
      var a = caja(desde), b = caja(hasta || desde), d = document.createElement('div');
      d.className = 'marco';
      d.style.left = (a.x - 3) + 'px'; d.style.top = (a.y - 3) + 'px';
      d.style.width = (b.x + b.w - a.x + 6) + 'px'; d.style.height = (b.y + b.h - a.y + 6) + 'px';
      pantalla.appendChild(d);
    };
    if (document.getElementById('menuTes') && !document.getElementById('menuExt')) {
      var mt = caja('#menuTesoreria'), dt = document.getElementById('menuTes');
      dt.style.left = mt.x + 'px'; dt.style.top = (mt.y + mt.h + 2) + 'px';
    }
    if (document.getElementById('menuSub')) {
      var os = document.querySelector('#menuTes [data-sub="' + ${JSON.stringify((op.menu && op.menu.sub && op.menu.sub.titulo) || '')} + '"]');
      var po = caja('#menuTes'), ro = os.getBoundingClientRect(), sb = document.getElementById('menuSub');
      sb.style.left = (po.x + po.w - 4) + 'px'; sb.style.top = (ro.top - p.top - 6) + 'px';
    }
    if (document.getElementById('menuExt')) {
      var m = caja('#menuExtensiones'), d = document.getElementById('menuExt');
      d.style.left = m.x + 'px'; d.style.top = (m.y + m.h + 2) + 'px';
      var o = caja('#opTesoreria'), t = document.getElementById('menuTes');
      t.style.left = (o.x + o.w - 4) + 'px'; t.style.top = (o.y - 6) + 'px';
    }
    ${op.script || ''}
  })();
</script>
</body></html>`;
}

module.exports = { pantalla, pintarMenu, esc };
