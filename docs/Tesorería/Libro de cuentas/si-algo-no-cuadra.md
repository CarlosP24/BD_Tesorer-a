# Si algo no cuadra

El libro avisa de los problemas con colores y con notas. Aquí tienes los más
habituales y cómo arreglarlos. Si no encuentras el tuyo, empieza por el
**diagnóstico**: menú **Tesorería → Diagnóstico → Diagnóstico del sistema**
repasa el libro entero y dice qué está mal, sin cambiar nada.

## Me he equivocado

- **Justo ahora**: pulsa **Ctrl + Z** (en Mac, **⌘ + Z**) para deshacer.
- **Hace rato**: menú **Archivo → Historial de versiones → Ver historial de
  versiones**. A la derecha salen las versiones del libro por fecha y hora;
  elige una para verla y pulsa **Restaurar esta versión** si quieres volver a
  ella.

!!! warning "Restaurar deshace todo lo posterior"

    Restaurar una versión vuelve **todo el libro** a como estaba, también lo
    que se apuntó después. Si solo necesitas un dato, cópialo de la versión
    antigua y pégalo en la actual.

## El saldo sale en rojo

En las columnas **Saldo** y **Saldo extracto**, el rojo quiere decir que el
saldo que calcula el libro **no coincide con el que dice el banco** después de
ese movimiento. Lo normal es que:

- **falte un movimiento del banco**: importa el extracto de esas fechas otra
  vez (lo repetido no se duplica);
- **sobre un movimiento**: un pago apuntado a mano que también ha llegado con
  el extracto. El libro suele detectarlo y dejar una nota en el *Concepto
  Banco* del nuevo. Pasa los datos que falten a la fila del banco y **borra la
  apuntada a mano** (nunca la del banco);
- **el saldo inicial esté mal** (celda B1), o haya algo del curso pasado que
  ya contaste en él: ver
  [Movimientos del curso pasado](cambio-de-ejercicio.md#movimientos-del-curso-pasado-que-llegan-ahora).

La **primera** fila roja es la que importa: a partir de ahí, todas las demás
arrastran el mismo error.

## Una fecha de pago sale en naranja

La hoja no está ordenada por fecha de pago. Menú **Tesorería → Caja → Ordenar
por fecha de pago**.

## La columna BD Socios sale en naranja

El libro no ha podido apuntar esa cuota en la base de socios, y el texto de la
celda dice por qué. Ver [Cuotas de socio](cuotas.md#la-columna-bd-socios).

## Un ingreso del cajero se ha tomado por una cuota (o al revés)

Pasa si se ingresó efectivo en el banco sin apuntar antes el traspaso. Ver
[Efectivo y traspasos](efectivo.md#traspaso-entre-banco-y-efectivo), al final.

## Una transferencia sigue pendiente

Si ya ha pasado tiempo desde que la hiciste:

1. Comprueba que has **importado un extracto** posterior al día del pago.
2. Busca en Caja si ha entrado como un movimiento nuevo con una nota en el
   *Concepto Banco*. Pasa cuando el banco ha cortado el concepto (y con él el
   ID) o cuando el importe pagado no es el apuntado. Pasa los datos que falten
   a esa fila y **anula la pendiente** desde **Transferencias pendientes**.
3. Si no está en ningún extracto, comprueba en la app del banco que la
   transferencia se hizo.

## El menú Tesorería no aparece

- Espera unos segundos: tarda un poco en cargar.
- Recarga la página (tecla **F5**).
- Comprueba que has entrado con tu cuenta del centro, y que tienes permiso de
  edición sobre el libro.

## «Hay otra importación o sincronización en marcha»

Alguien (o la sincronización automática) está usando el libro en ese momento.
Espera un minuto y vuelve a intentarlo.

## Una ventana se queda en blanco o da error

Ciérrala y vuelve a abrirla desde el menú. Si el error se repite, anota el
mensaje exacto y avisa a quien mantenga el programa del libro.

<br>
