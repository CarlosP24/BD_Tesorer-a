# Primeros pasos con el libro

Esta guía es para quien no ha usado nunca **Hojas de cálculo de Google** (la
versión de Google de Excel). En diez minutos sabrás moverte por el libro sin
miedo a romper nada.

### 1. Abre el libro

1. Entra en **Google Drive** con tu cuenta del centro (`@jmvesp.org`).
2. En el menú de la izquierda, pulsa **Unidades compartidas** y entra en la de
   tu centro. Si no sabes qué es una unidad compartida, lo tienes explicado en
   [Unidades compartidas](https://jmv-espana.github.io/documentacion-publica/Corporativo/Pol%C3%ADticas/unidades-compartidas/).
3. Entra en la carpeta **Tesorería** y abre el archivo del ejercicio en curso,
   por ejemplo **Ejercicio 26-27**.

!!! info "Un libro por curso"

    Cada ejercicio (de septiembre a agosto) tiene su propio archivo. Los de
    años anteriores siguen en la misma carpeta: no los borres, son las cuentas
    cerradas de esos años.

### 2. Lo que ves en pantalla

[![El libro abierto en la hoja Caja, con cinco zonas numeradas](../../assets/img/primeros-pasos/01.png)](../../assets/img/primeros-pasos/01.png)

1. **El menú Tesorería.** Está arriba, al final de la barra de menús (después
   de *Ayuda*). Desde él se hace casi todo. La primera vez que abres el libro
   puede tardar unos segundos en aparecer.
2. **Los saldos.** La fila 1 dice con cuánto dinero empezó el ejercicio, en el
   banco y en efectivo; la fila 2, cuánto hay ahora. Se calculan solos.
3. **La cabecera.** Los nombres de las columnas (*Fecha*, *Concepto Banco*,
   *Partida*…). Se quedan fijos arriba aunque bajes por la hoja.
4. **Los asientos.** Cada fila es un movimiento de dinero, ordenados por fecha.
5. **Las pestañas.** Abajo del todo. El libro tiene varias hojas, y aquí se
   cambia de una a otra.

??? info "Celdas, filas y columnas"

    Una hoja de cálculo es una cuadrícula. Las **columnas** se nombran con
    letras (A, B, C…) y las **filas** con números (1, 2, 3…). Cada casilla es
    una **celda**, y se nombra por su columna y su fila: **E9** es la celda de
    la columna E y la fila 9.

    Para escribir en una celda, haz clic en ella, escribe y pulsa **Intro**.
    Si te equivocas, pulsa **Ctrl + Z** (en Mac, **⌘ + Z**) para deshacer.

### 3. Las pestañas del libro

| Pestaña | Para qué sirve |
|---|---|
| **Caja** | El libro de asientos: todos los movimientos. Es la que más vas a ver. |
| **Presupuesto** | Las partidas y lo que se espera ingresar y gastar en cada una. |
| **Cuentas** | Lo mismo que Presupuesto, pero con lo que se ha movido de verdad. Se rellena sola. |
| **Act · …** y **Fin · …** | Una por actividad (convivencia, campamento, lotería…), con su presupuesto y sus movimientos. |
| **Ajustes** | Datos del ejercicio: fechas, curso de la base de socios… Normalmente no se toca. |
| **Log** | Un registro de lo que ha hecho el sistema. Sirve para buscar qué pasó. |

### 4. El menú Tesorería

[![El menú Tesorería desplegado](../../assets/img/primeros-pasos/02.png)](../../assets/img/primeros-pasos/02.png)

Arriba del todo está el **traspaso entre banco y efectivo**, destacado porque
es lo que hay que apuntar *antes* de ingresar o sacar efectivo. Debajo, lo que
se usa a menudo: importar el extracto, pagar por transferencia, completar los
pagos con tarjeta, las facturas y el efectivo. Los submenús del final (*Caja*,
*Actividades*, *Ejercicio*, *Diagnóstico*) son para tareas menos frecuentes.

!!! warning "La primera vez pide permiso"

    La primera vez que uses una opción del menú, Google te pedirá
    **autorizar** el programa del libro. Elige tu cuenta del centro y pulsa
    **Permitir**. Solo pasa una vez por persona y por libro.

### 5. Los colores

El libro pinta las celdas para avisarte de lo que hay que mirar:

[![Columnas de Caja con celdas amarillas en Factura y una fila Pendiente en azul](../../assets/img/primeros-pasos/03.png)](../../assets/img/primeros-pasos/03.png)

| Color | Qué quiere decir | Qué hacer |
|---|---|---|
| **Amarillo** | Falta algo: la partida o la factura. | [Completar los pagos](completar-movimientos.md) o [subir la factura](facturas.md). |
| **Azul** (en *Fecha de pago*) | Transferencia apuntada que aún no ha salido del banco. | Nada: al importar el extracto que la trae, deja de estar pendiente. |
| **Naranja** | Algo raro que conviene mirar. | Ver [Si algo no cuadra](si-algo-no-cuadra.md). |
| **Rojo** | Algo está mal: el saldo no coincide con el del banco, un ID de socio mal escrito… | Ver [Si algo no cuadra](si-algo-no-cuadra.md). |
| **Gris** | Columnas que calcula el libro. | No se escriben a mano. |

Fíjate en la columna **Saldo**: cada fila enseña el saldo **de su caja**. Las
filas del banco llevan el saldo del banco, y las de efectivo (como la 6 o la
8), el del efectivo.

### 6. Lo que nunca hay que hacer

!!! danger "Para no romper el libro"

    - **No insertes, borres ni muevas columnas** en la hoja Caja. Todas las
      cuentas dependen de que cada dato esté en su columna.
    - **No escribas en la columna Saldo**, ni para borrarla: es una fórmula
      que calcula todos los saldos a la vez.
    - **No borres asientos que vienen del banco** (los que tienen *Concepto
      Banco*): el siguiente extracto los volvería a meter. Si sobra uno, mira
      [Si algo no cuadra](si-algo-no-cuadra.md).

    Si algo de esto pasa por accidente, **Ctrl + Z** lo deshace. Y si ya es
    tarde, el menú **Archivo → Historial de versiones → Ver historial de
    versiones** permite volver a cómo estaba el libro antes.

Algunas zonas del libro están **protegidas**: si intentas escribir en ellas,
Google te avisa antes. Es normal; casi siempre basta con cancelar.

<br>
