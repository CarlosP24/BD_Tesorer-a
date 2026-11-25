# JMV — Tesorería · Guía para el agente

Google Apps Script vinculado al Google Sheet de **un ejercicio económico** del
centro JMV (Parroquia San Vicente de Paúl): «Ejercicio 26-27», del 1 de
septiembre de 2026 al 31 de agosto de 2027. Lo usa tesorería, sin perfil
técnico: todo tiene que entenderse desde la hoja y poder arreglarse a mano.

Proyecto hermano: **BD Socios** (`../BD_Socios`, su `CLAUDE.md`). De allí
vienen el estilo, las trampas de Apps Script (§3 de su guía) y la pestaña
`Pagos`, donde este proyecto apunta las cuotas cobradas. Si algo de aquí y del
código no coincide, **manda el código**.

---

## 1. Archivos

| Archivo | Qué hace |
|---|---|
| `00_Estructura.js` | Constantes (`HOJAS`, `CAJA`, `PRESUPUESTO`, `AJUSTES`), creación y reparación de hojas, fórmulas, validaciones, formato condicional, protecciones, `leerAjustes()`, `leerPartidas()`, utilidades, menú (`entradasDelMenu()`), `onOpen()`, `onEdit()` |
| `01_Caja.js` | `leerCaja()` / `filaDeCaja()`, ID de transacción, orden, `codigoDeOpcion()`, dividir asiento, traspasos, facturas, diálogo de subida (`recibirArchivo()`) |
| `02_Extractos.js` | Importación del Excel del banco: `leerExtracto()` y `planificarImportacion()` (puras), `importarExtracto()` |
| `03_Socios.js` | `identificarSocio()` y `planificarSincronizacion()` (puras), `sincronizarConBdSocios()`, caché de pagos de BD Socios |
| `04_Actividades.js` | Hojas de actividad y lista de subpartidas |
| `05_Informes.js` | `calcularInforme()` / `calcularInformeActividad()` (puras) y PDF |
| `06_Ejercicios.js` | Crear el ejercicio siguiente, traer saldos iniciales |
| `07_Diagnostico.js` | `diagnostico()` y `pruebasTesoreria()` (casos con datos inventados) |
| `08_Asientos.js` | Servidor de la ventana de asientos: `datosDeAsientos()`, `guardarTransferencia()`, `guardarEfectivo()`, `guardarCambiosDeAsiento()`; lógica pura (`planDeTransferencia()`, `planDeEfectivo()`, `planDeCambios()`, `clasificarAsiento()`, `ibanValido()`, `documentoFiscalValido()`, `asuntoDeTransferencia()`) |
| `Asientos.html` | La ventana de asientos (traspaso, transferencias, pendientes, por completar, facturas, efectivo) |
| `Subir.html`, `Actividad.html`, `Informes.html` | Diálogos |
| `Informe.html` | Plantilla del PDF (scriptlets de HtmlService) |
| `Config.js` | **No está en git** (§6). `Config.ejemplo.js` es su plantilla |
| `pruebas/ejecutar.js` | Ejecuta `pruebasTesoreria()` en Node |
| `docs/` | Guía de uso para tesorería (MkDocs Material), lista para llevarla a la web de documentación de JMV España (§8) |
| `pruebas/capturas/` | Genera las capturas de `docs/assets/img/` con datos inventados (§8) |

---

## 2. Modelo de datos

Un Sheet **por ejercicio** (a diferencia de BD Socios, que es uno para todos
los cursos). Hojas:

| Hoja | Qué es |
|---|---|
| `Caja` | Libro de asientos. Filas 1-2: saldos (inicial en B1 banco / C1 efectivo, rangos con nombre `SALDO_INICIAL_BANCO` / `_EFECTIVO`; actual en B2:D2). Fila 3: cabecera. Datos desde la 4 |
| `Presupuesto` | Resumen por sección (filas 1-5) y tabla de partidas desde la fila 11: ingresos en A-D, gastos en E-H |
| `Cuentas` | Espejo del Presupuesto con importes reales. **Solo fórmulas** |
| `Act · …`, `Fin · …` | Hojas de actividad y de financiación (se reconocen por metadatos `tesoreria.actividad`, no por el nombre; el valor es el tipo, `ACT.TIPOS`) |
| `Ajustes` | Ejercicio, fechas, curso de BD Socios, partida de cuotas por tramo, ejercicio anterior |
| `Log` | Auditoría |
| `_Listas` | Oculta: listas de los desplegables |

Columnas de Caja, **en este orden** (`CAJA.COLUMNAS`): ID Transacción, Fecha,
Concepto Banco, Descripción, Partida, Subpartida, ID socio, Proveedor, CIF
proveedor, Cantidad, Saldo, Factura, Método de pago, Cuenta de abono, Titular,
Fecha de pago, las técnicas Saldo extracto, BD Socios, Huella extracto
(oculta), y Asunto transferencia (añadida al final para no mover nada). Las
fórmulas de Cuentas, de las actividades y del saldo se refieren a ellas por
letra: **no se insertan ni se mueven columnas en Caja**; si hace falta una
nueva, va al final de `CAJA.COLUMNAS` y se crea con «Reparar».

### Decisiones que no hay que deshacer

- **Fecha = la del asiento o factura. Fecha de pago = cuando se mueve el
  dinero** (vacía → se iguala a Fecha en `onEdit`). El saldo, el orden de Caja
  y el corte de los informes van por **Fecha de pago** (criterio de caja). Lo
  decidió tesorería.
- **Banco y efectivo, saldos aparte.** Una fila es de efectivo si `Método de
  pago = Efectivo`. Mover dinero entre los dos es la pseudopartida
  `Traspaso`: dos filas (banco con «Ingreso/Retirada en cajero», efectivo con
  «Efectivo») de importes contrarios. Cuentas no la cuenta y comprueba que
  sume 0; `emparejarTraspasos()` busca las patas sueltas (Diagnóstico).
- **Las cuotas cobradas en mano se apuntan PRIMERO en Efectivo**, con su ID
  de socio (decisión de tesorería), y su ingreso en el banco es un traspaso.
  **Pero el extracto no lo distingue** del ingreso en cajero de una familia
  que no se identifica: el banco pone a la asociación de ordenante en los
  dos casos (en el primer extracto, dos cuotas de familias salieron como
  traspasos con la regla «ordenante = asociación»; no la reintroduzcas).
  Regla actual (`planificarTraspasos()`): una **retirada** de cajero es
  siempre traspaso; un **ingreso** en cajero es un cobro salvo que
  tesorería lo haya declarado (pata de efectivo suelta ya apuntada, o la fila
  del banco marcada Traspaso a mano). El importador crea sola la pata de
  efectivo de lo que sí es traspaso. Para corregir a mano: Caja → «Convertir
  el asiento seleccionado en traspaso» / «El asiento seleccionado no es un
  traspaso» (`01_Caja.js`). Un traspaso nunca lleva ID de socio
  (`pagosDeseados()` lo rechaza).
- **«Ejercicio anterior»: lo que llega al banco ahora pero ya está en el
  saldo inicial** (cobros y pagos pendientes del ejercicio pasado; algo
  excepcional). Decisión de tesorería: el ejercicio en curso lo **ignora del
  todo**. No mueve el saldo (la fórmula de K3, B2 y C2 lo excluyen), no está
  en Cuentas, informes ni actividades, no pide factura y no va a BD Socios
  (`pagosDeseados()` devuelve vacío, así que deshace lo que la importación
  hubiera enlazado). La fila **no se borra**: si se borrara, el siguiente
  extracto la volvería a meter. Para comparar con el banco, al saldo de Caja
  se le resta lo marcado así que aún no ha llegado (`descuadresDeSaldo()` y
  el formato condicional de «Saldo extracto»); por eso hay que pasarle
  siempre TODAS las filas.
- **Transferencias pendientes: Fecha de pago = «Pendiente»** (`CAJA.PENDIENTE`).
  Un gasto por transferencia se apunta desde la ventana ANTES de ordenarlo en
  el banco, con un asunto que empieza por su ID. Decisión de tesorería:
  mientras está pendiente **cuenta en Cuentas y en las actividades** (gasto
  comprometido) pero **no en el saldo** (K3, B2, C2 lo excluyen) **ni en los
  informes a fecha** ni en `saldosALaFecha()`: `filaDeCaja()` le da
  `pendiente = true` y `fechaEfectiva = null`. El importador la reconoce por
  el ID en el concepto (`idsDeAsientoEnConcepto()`; con otro importe, no se
  fusiona y avisa) o, si el banco lo cortara, por importe, siendo
  transferencia y hasta `DIAS_PENDIENTE` días después; entonces le pone la
  fecha del banco. `onEdit` no toca «Pendiente» (no está vacía).
- **Desplegables con nombre.** La lista de Partida y Subpartida (`_Listas`)
  ofrece primero «G21 · Convivencia» y, al final, los códigos solos; al
  elegir, `onEdit` deja solo el código (`codigoDeOpcion()`). Los códigos
  tienen que seguir en la lista: si no, la celda con «G21» sería no válida
  (Sheets no deja que una opción muestre una cosa y guarde otra). Lo eligió
  tesorería frente a guardar el nombre en la celda.
- **La ventana de asientos solo escribe valores** y hace una llamada al
  abrirse (como BD Socios §3.10). Todo lo que guarda pasa por el lock del
  script (`conLockDeCaja()`) y, al cambiar un asiento existente, comprueba
  que lo que se cambia sigue valiendo lo que la ventana vio (`planDeCambios()`).
  Lo que viene del banco (fecha, importe, concepto, método) no se edita desde
  ella, salvo en una transferencia pendiente.
- **El saldo es una sola fórmula en K3** (`={"Saldo"; ARRAYFORMULA(LET(…SCAN…))}`),
  con dos acumulados. **Nunca escribas en la columna Saldo**, ni vacío:
  rompe la fórmula con #REF!. `escribirFilasCaja()` se la salta. Por lo mismo,
  `getLastRow()` no sirve en Caja: usa `ultimaFilaDeCaja()`.
- **El ID de transacción (AAAAMMDD-NN) se asigna una vez y no cambia** aunque
  se corrija la Fecha: lo llevan el nombre de la factura y la Referencia
  `TES-…` en BD Socios.
- **Huella del extracto = fecha | importe | saldo | concepto.** Sin el
  concepto no basta: en un extracto real, dos ingresos de 20 € el mismo día
  con un cargo entre medias dejaban fecha, importe y saldo idénticos. Las
  partes de un asiento dividido llevan la misma huella con `#1`, `#2`.
- **Un asiento apuntado a mano antes de importar se completa, no se
  duplica** (mismo importe, ±`DIAS_FUSION` días, sin huella, del banco). Si
  hay dos candidatos no se elige: se importa como nuevo y se avisa en una nota.
- **Las partidas se pueden añadir en cualquier momento.** Todo lo que depende
  de ellas (Cuentas, `_Listas`, validación de Caja) es fórmula abierta.
  Código `[IG][1-4]\d+`; la sección se deduce del dígito. Una hoja de
  actividad nueva crea por defecto las suyas (`siguientePartidaLibre()`:
  mismo número en I y G; `añadirPartida()`: al final de su lado de la
  tabla, solo código y descripción).
- **Lo que escribe una persona manda**: la importación y la sincronización
  solo rellenan Partida, Método, etc. si están vacíos.
- **Un ejercicio cerrado conserva su código.** «Crear el ejercicio siguiente»
  copia el archivo y Drive copia con él el proyecto de Apps Script. El
  `scriptId` cambia cada año (ver README).

---

## 3. BD Socios: el contrato

Lo que este proyecto lee y escribe en el Sheet de BD Socios (`CONFIG.ID_BD_SOCIOS`):

- Lee `Socios`, `Familias`, `Inscripciones` y `Pagos` (columnas en `SOCIOS.COLUMNAS`;
  si BD Socios renombra una, `tablaDeBdSocios()` falla con el nombre).
- Escribe **solo en `Pagos`** y en la caché de `Inscripciones`
  (`Importe_pagado`, `Cuota_pagada`, `Fecha_pago`).
- Cada pago que toca lleva `Referencia = TES-<ID de transacción>`. Los que
  **crea** llevan `Notas` empezando por `[Tesorería]`: son los únicos que
  puede borrar. A los de Tally (Importe vacío, `Conciliado = No`) solo los
  concilia (y desconcilia si se quita el socio).
- La caché se recalcula con `estadoDeCuota()`, **copia de la regla de
  `recalcularPagos()` de BD Socios** (`00_estructura.js`). Si cambia allí,
  cambia aquí.
- `pagosDeseados()`: varios socios en una celda (`JMV-000001, JMV-000002`)
  solo si el importe es la suma exacta de sus cuotas. Si no, se pide dividir
  el asiento. `JMV-000001@2027-2028` fuerza otro curso.
- **Identificación** (`identificarSocio()`): número de socio → nombre en el
  concepto → ordenante como el propio socio (completo) → ordenante como
  tutor/a (una familia, un hijo, importe = cuota; o todos los hijos y su
  suma). El **nombre de pila es obligatorio y exacto** (Daniel/Daniela,
  Mario/María pueden ser hermanos); los apellidos admiten una errata y
  palabras pegadas. Ante la duda, no se asigna: nota con la pista.
- BD Socios protege `Pagos` e `Inscripciones` (`protegerTablas()`): quien
  sincroniza tiene que poder editarlas.

---

## 4. Privacidad — qué nunca se publica

El repositorio es público como el de BD Socios. **Nunca** van a git:

- `Config.js`, `.clasp.json`, `.clasprc.json`.
- Ningún extracto, hoja de cálculo, CSV o PDF (`.gitignore` los bloquea por
  extensión). Un extracto lleva nombres de familias **y de menores** en el
  concepto, e IBAN.
- Ningún nombre real en las pruebas: `pruebasTesoreria()` usa nombres
  inventados. Si reproduces un caso real, inventa los nombres conservando la
  forma (palabras pegadas, guiones bajos, puntos…).

En Drive: el extracto temporal convertido se borra **en definitivo**
(`Drive.Files.remove`), y los informes PDF **nunca llevan el Concepto Banco**
(`conceptoParaInforme()`): una cuota sale como «Cuota de socio».

---

## 5. Trampas (además de las de BD Socios §3)

- **Espacio de nombres compartido**: `grep -n "^function nombre" *.js` antes
  de crear una función.
- **`Config.js` se lee siempre con `config('CLAVE')`**, nunca `CONFIG.X` al
  cargar un archivo: Config.js carga después de los `NN_*.js`.
- **Las fórmulas del código están en sintaxis inglesa** (comas; `{a, b; c}`)
  **y se escriben siempre dentro de `conFormulasEnIngles()`**, que pone la
  hoja en en_US mientras tanto y la devuelve a su idioma. En la hoja de la
  organización (es_ES, separador «;») escribirlas sin eso dio «Error de
  análisis de fórmula» en todas. Vale para `setFormula()`, validaciones
  (`requireFormulaSatisfied`) y formato condicional (`whenFormulaSatisfied`).
  Nunca copies una fórmula con `getFormula()` para volver a ponerla: sale en
  el idioma de la hoja. Regénerala desde el código (`formulaDeSaldo()`).
- **Pero cambiar el idioma de la hoja hace que Sheets recargue la página**:
  un diálogo abierto (`google.script.run`) pierde la conexión con
  «NetworkError». Por eso `conFormulasEnIngles()` solo se usa al montar o
  reparar la estructura, nunca en lo que se hace a diario desde un diálogo.
  `ordenarCaja()` ordena en memoria (`ordenDeCaja()`) y reescribe sin tocar
  la columna Saldo, en vez de `Range.sort()` + volver a poner la fórmula.
- **Nombres en `LET`/`LAMBDA` descriptivos**, nunca de una letra (`c`, `r`…
  pueden chocar con referencias).
- **Protecciones estrictas solo donde el script no escribe al trabajar**
  (Cuentas, resumen del Presupuesto, lo copiado en actividades). Donde
  escribe (IDs, columnas técnicas, Log, Ajustes) son de aviso: una estricta
  haría fallar el script cuando lo lanza otra persona del equipo.
- **`onEdit` es un disparador simple**: no puede abrir BD Socios ni Drive.
  Por eso la sincronización va por menú, tras importar o por disparador
  horario (`instalarSincronizacionAutomatica()`).
- **Activar una hoja oculta la muestra** (`ordenarHojas()` no toca `_Listas`).
- **Bytes con signo**: en Apps Script `0xD0` es `-48` (`filasDeArchivo()`).
- **Nada de `//` en el script de `Asientos.html`** (ni comentarios ni
  direcciones): al servir la plantilla, Apps Script lo toma por comentario y
  corta la línea (BD Socios §3.9). Comentarios con `/* */`.
- **`google.script.run` no devuelve `Date`**: lo que va a la ventana lleva
  las fechas como «aaaa-mm-dd» (`isoDeFecha()`; lo comprueba una prueba).
- **El menú** se compone en `entradasDelMenu()`; una prueba comprueba que
  todas sus funciones existen.
- **El PDF**: mismas reglas que BD Socios §4 (tablas, mm, nada de flex). El
  logo va con `<?!= ?>`: con `<?= ?>` el escapado puede filtrar la URI `data:`.

---

## 6. Configuración

| Qué | Dónde |
|---|---|
| Por instalación: IDs de BD Socios y carpetas, IBAN, titular, centro, logo | `Config.js` (no versionado; plantilla `Config.ejemplo.js`, que `.claspignore` excluye) |
| Por ejercicio: fechas, curso, partidas de cuotas por tramo | Hoja `Ajustes` |
| Constantes de diseño | En su archivo |

---

## 7. Cómo trabajar

```bash
node pruebas/ejecutar.js                       # «Los N casos correctos»
for f in *.js; do cp "$f" "$TMPDIR/c.js" && node --check "$TMPDIR/c.js" || echo "$f"; done
clasp status                                   # qué subiría (Config.js sí, Config.ejemplo.js no)
clasp push
```

- `clasp push` borra del proyecto lo que no exista en local: **sin
  `Config.js` local te llevas el de producción.**
- Si tocas identificación, importación, sincronización o informes, añade un
  caso a `pruebasTesoreria()`. Para probar con un extracto real, hazlo fuera
  del repositorio (en un directorio temporal), nunca con el archivo dentro.
- Antes de publicar: `git status` sin `Config.js` ni `.clasp.json`, y
  `grep -nE "1[A-Za-z0-9_-]{25,}|ES\d{2} ?\d{4}" *.js *.html` sin resultados
  fuera de `Config.js`.

## 8. Documentación de uso (`docs/`)

Guía paso a paso para quien lleve la tesorería, que puede no haber usado nunca
Sheets ni hecho contabilidad. Sigue el estilo de
[documentacion-publica](https://github.com/JMV-Espana/documentacion-publica)
(MkDocs Material + awesome-nav; ver su README y su página «Subir imágenes») y
está colocada con **las mismas rutas que tendrá allí**:

- `docs/Tesorería/Libro de cuentas/*.md` y su `.nav.yml` (orden de lectura).
  Sustituye al esbozo `docs/Tesorería/libro-cuentas.md` de esa web.
- `docs/assets/img/<página>/NN.png`, numeradas por orden de aparición. Desde
  las páginas: `../../assets/img/…` (dos niveles por debajo de `docs/`). Cada
  imagen enlaza a sí misma para verla a tamaño real.
- Avisos `!!! info/warning/danger/success` y `???` plegables, como allí. No
  hay `def_list` en su `mkdocs.yml`: nada de listas de definición.
- A páginas de esa web se enlaza con su **dirección completa**
  (`https://jmv-espana.github.io/documentacion-publica/…`), para que el enlace
  funcione en los dos sitios.

**Mientras no se integre, se publica desde aquí** con GitHub Pages:
<https://jmv-espana.github.io/BD_Tesoreria/>. `.github/workflows/docs.yml`
construye con `mkdocs build --strict` en cada PR que toque `docs/` y publica
al llegar a `main` (Settings → Pages → Source: GitHub Actions). Son **solo de
este sitio**, y no se copian al integrar: `mkdocs.yml`, `docs/index.md`,
`docs/.nav.yml`, `docs/assets/extra.css` (paleta copiada de la de allí) y los
logos de `docs/assets/`. En local:

```bash
python3 -m venv .venv && .venv/bin/pip install mkdocs-material mkdocs-awesome-nav
.venv/bin/mkdocs serve        # http://127.0.0.1:8000
```

**Las capturas se regeneran, no se editan a mano**, cuando cambia la interfaz:

```bash
npm install --prefix pruebas/capturas     # una vez (puppeteer-core; usa el Chrome instalado)
node pruebas/capturas/generar.js          # todas; con un argumento, solo las que lo contienen
```

`generar.js` carga el código del proyecto con un conjunto de datos
**inventados** (socios, proveedores, IBAN de la entidad 9999, CIF ficticios) y:
abre las ventanas reales (`Asientos.html`, `Subir.html`…) con
`google.script.run` simulado, cuyas respuestas calcula el propio código
(`contextoDeVentana()`, `planDeTransferencia()`…), las rellena con clics y
recorta; pinta el PDF con `Informe.html`; y **recrea** la hoja (Caja,
Presupuesto, menú) en `hoja.js` con los colores y columnas del código. Si
cambias columnas, colores o el menú, la recreación lo sigue sola; si cambias
el marco de Google, no. La web es **pública**: nunca metas ahí un dato real.

### Sin verificar todavía en Apps Script real

El código está probado en Node (lógica pura) y la plantilla del PDF se ha
renderizado con Chrome, pero **no se ha ejecutado aún contra Sheets/Drive**.
Lo primero que conviene mirar en la primera ejecución: que el orden de Caja
conserve el del banco dentro del mismo día (la fila en rojo de «Saldo
extracto» lo delataría), la conversión del `.xls` vía
`Drive.Files.create`, y el aspecto del PDF con el conversor de Google.

La ventana de asientos se ha probado en Chrome con `google.script.run`
simulado. En Sheets falta ver: que al elegir «G21 · …» en el desplegable la
celda quede en «G21» sin marca de no válida; que la validación de Fecha de
pago (fórmula, para admitir «Pendiente») deje escribir fechas con normalidad;
que los botones «Copiar» funcionen dentro del diálogo (si el navegador
bloquea el portapapeles, usan `execCommand('copy')`); y el concepto real que
pone el Santander a una transferencia emitida (que conserve el ID).
