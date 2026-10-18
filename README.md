# JMV — Tesorería

Libro de contabilidad de un centro JMV en Google Sheets, con un menú
**Tesorería** que importa los extractos del banco, reconoce las cuotas de
socio y las apunta en BD Socios, crea hojas por actividad y genera los
informes contables en PDF.

Un Google Sheet por ejercicio («Ejercicio 26-27», del 1 de septiembre al 31
de agosto). Hojas: **Caja** (los asientos), **Presupuesto**, **Cuentas** (lo
real, se rellena solo), una hoja por actividad, **Ajustes** y **Log**.

---

## Instalación (una vez)

### 1. En Drive, dentro de la carpeta Tesorería de la unidad compartida

1. Crea una hoja de cálculo vacía llamada **`Ejercicio 26-27`**.
2. Comprueba que existen estas tres carpetas (créalas si no): **Facturas**,
   **Extractos** y **Memorias**. Ninguna debe estar compartida como
   «cualquiera con el enlace».
3. Apunta los ID: el de cada carpeta es lo que va detrás de `/folders/` en su
   dirección. El de la hoja de **BD Socios** es lo que va entre `/d/` y
   `/edit`.

### 2. El proyecto de Apps Script

1. En la hoja nueva: **Extensiones → Apps Script**. Ponle de nombre
   `BD Tesorería`.
2. En el editor: **Configuración del proyecto** (rueda dentada) → copia el
   **ID de la secuencia de comandos**.
3. En esta carpeta del repositorio crea `.clasp.json` (no va a git):

   ```json
   { "scriptId": "PEGA_AQUÍ_EL_ID", "rootDir": "" }
   ```

### 3. Configuración

Abre `Config.js` (ya existe en local y no va a git). Ya tiene el centro, el
IBAN, el titular y el logo; rellena lo que falta:

```js
ID_BD_SOCIOS: '…',        // ID de la hoja de BD Socios
CARPETA_FACTURAS: '…',
CARPETA_EXTRACTOS: '…',
CARPETA_INFORMES: '…',     // la carpeta Memorias
```

### 4. Subir el código

```bash
clasp status    # debe salir Config.js y NO Config.ejemplo.js, CLAUDE.md ni pruebas/
clasp push      # si pregunta por el manifiesto, contesta que sí
```

### 5. En la hoja

1. Recarga la página. Aparece el menú **Tesorería** (puede tardar unos
   segundos).
2. **Tesorería → Ejercicio → Crear estructura.** La primera vez pide
   autorización: acepta con la cuenta de tesorería. Confirma que el ejercicio
   es 2026-2027.
3. **Presupuesto**: revisa las partidas (vienen unas genéricas basadas en las
   del curso pasado) y escribe los importes. Puedes añadir partidas cuando
   quieras.
4. **Ajustes**: comprueba el curso de BD Socios y las partidas de cuotas por
   tramo (10-15 → I11, 16-30 → I12, 31+ → I13).
5. **Caja**: en **C1**, el efectivo que hay en mano a 1 de septiembre. El
   saldo del banco (B1) lo propone solo el primer extracto.
6. **Tesorería → Diagnóstico → Diagnóstico del sistema.** Tiene que acabar
   sin ✖.

### 6. Permiso sobre BD Socios

La sincronización escribe en las pestañas **Pagos** e **Inscripciones** de BD
Socios, que están protegidas (solo su propietario puede editarlas). Usa la
misma cuenta que es propietaria de BD Socios, o añade a la cuenta de
tesorería como editora de esas dos protecciones (en BD Socios: Datos →
Proteger hojas e intervalos).

### 7. Opcional

- **Tesorería → Diagnóstico → Instalar sincronización automática**: cada
  hora lleva a BD Socios las cuotas que hayas corregido a mano en Caja. Sin
  ella, la sincronización se hace al importar y desde el menú.

---

## Uso diario

### Importar un extracto

Descarga del banco el Excel de movimientos (tal cual, el `.xls` del
Santander vale) y **Tesorería → Importar extracto bancario…**. Puedes subir
extractos que se solapen: lo ya importado no se repite. Al terminar:

- cada movimiento nuevo es una fila de Caja, con su ID, fecha, concepto,
  método y el saldo que dice el banco;
- en los ingresos se busca al socio. Si se reconoce con seguridad, se rellena
  **ID socio** y la partida de su tramo, y el pago se apunta en BD Socios. Si
  hay dudas, la celda queda vacía con una **nota** que dice a quién se parece;
- si ya habías apuntado a mano ese movimiento, se completa en vez de
  duplicarse;
- si el saldo calculado no coincide con el del banco, la fila sale en rojo.

### Apuntar a mano

Escribe la **Fecha** y el ID se pone solo; la **Fecha de pago** se iguala a
la Fecha si la dejas vacía (cámbiala si el pago fue otro día). Cantidad
positiva si entra dinero, negativa si sale. **Método de pago «Efectivo»**
cuenta en el saldo de efectivo; todo lo demás, en el del banco.

### Efectivo y traspasos

- **Cuota cobrada en mano**: una fila de Efectivo el día que se cobra, con su
  **ID socio** (la partida se pone sola al sincronizar).
- **Ingresar en el banco el efectivo** o **sacar dinero del cajero** es un
  **traspaso**: no es ingreso ni gasto, solo cambia el dinero de sitio. Son
  dos filas con la partida **Traspaso** e importes contrarios, una en el banco
  y otra en efectivo. **Caja → Apuntar traspaso entre banco y efectivo…** las
  crea las dos.
- Al importar el extracto, **las retiradas de cajero** se marcan solas como
  traspaso y se crea la fila de efectivo.
- **Los ingresos en cajero se tratan como cobros**, porque en el extracto un
  ingreso de tesorería y el de una familia que paga su cuota en el cajero son
  idénticos. Si eres tú quien ingresa efectivo, apúntalo antes con **Apuntar
  traspaso**: al importar, el movimiento del banco se reconoce y no se
  duplica.
- Si una fila sale mal clasificada: **Caja → Convertir el asiento
  seleccionado en traspaso** o **Caja → El asiento seleccionado no es un
  traspaso** (borra su fila de efectivo y busca al socio).

Colores en Caja: amarillo = falta algo (partida, factura); naranja = míralo
(fuera de orden, signo raro para la partida, algo pendiente con BD Socios);
rojo = está mal (saldo distinto del banco, subpartida de otra partida, ID de
socio mal escrito).

### Movimientos que son del ejercicio anterior

Si un cobro o pago llega al banco en septiembre u octubre pero ya lo
contaste en el saldo inicial (B1), **no borres la fila**: el siguiente
extracto la volvería a meter. Ponle la partida **«Ejercicio anterior»**. Sale
en gris y no cuenta en nada: ni en el saldo, ni en Cuentas, ni en los
informes, ni en BD Socios (si la importación la había enlazado a un socio,
la próxima sincronización lo deshace). La comparación con el banco lo tiene
en cuenta, así que el saldo sigue cuadrando con el extracto.

Si sabes que el extracto trae movimientos así, al importar desmarca
«apuntar en BD Socios las cuotas reconocidas», márcalos, y después
Tesorería → Sincronizar cuotas con BD Socios.

### Cuotas que no se reconocen

Escribe el ID en **ID socio** (`JMV-000042`; varios separados por comas si
el ingreso es la suma exacta de sus cuotas) y **Tesorería → Sincronizar
cuotas con BD Socios**. La columna **BD Socios** dice qué se ha hecho
(✓ PAG-000123) o qué falta (⚠ …). Si una transferencia paga cuotas de tramos
distintos, **Caja → Dividir el asiento seleccionado**.

### Facturas

**Caja → Adjuntar factura al asiento seleccionado…** la guarda en la carpeta
de facturas del ejercicio con el ID del asiento como nombre. Si las subes
directamente a la carpeta con ese nombre, **Caja → Vincular facturas subidas
a la carpeta** las enlaza.

### Actividades

**Actividades → Nueva hoja de actividad…**: título, partida de ingresos y de
gastos. La hoja muestra presupuesto, real y los movimientos, que se
actualizan solos. Las subpartidas (por defecto Alojamiento, Manutención,
Transporte y Material: G21A, G21M, G21T, G21MT) se editan en la propia hoja y
pasan a estar disponibles en Caja. A partir de la columna N puedes añadir
columnas propias; mejor fórmulas de la misma fila que datos tecleados,
porque los movimientos se recolocan cuando entra uno nuevo.

### Informes

**Tesorería → Generar informe contable…**: cierre del ejercicio, provisional
a una fecha, o de una actividad a una fecha. Se guarda en PDF en la carpeta
de Memorias. Nunca incluye el concepto del banco (lleva nombres de familias).

### Cambio de ejercicio (cada septiembre)

**Ejercicio → Crear el ejercicio siguiente…** en el libro que se cierra.
Crea «Ejercicio 27-28» con las mismas partidas, sin asientos y con los saldos
finales como iniciales. En el libro nuevo:

1. Abre el menú Tesorería y autoriza.
2. Diagnóstico del sistema.
3. Si usas la sincronización automática, quítala del viejo e instálala en el
   nuevo.
4. Para seguir con clasp: copia el ID de la secuencia de comandos del
   proyecto nuevo a `.clasp.json`.

Si después se añade algo al ejercicio viejo, **Ejercicio → Traer los saldos
iniciales del ejercicio anterior** en el nuevo.

---

## Para quien mantenga el código

Ver [CLAUDE.md](CLAUDE.md). Pruebas: `node pruebas/ejecutar.js`.
