# La contabilidad, sin miedo

Llevar las cuentas de un centro no tiene más misterio que apuntar, de cada
euro, **cuándo** se movió, **cuánto**, **para qué** y **dónde está el
justificante**. Esta página explica las pocas palabras que vas a ver en el
libro. No hace falta memorizarlas: vuelve aquí cuando te surja una duda.

## El asiento: una línea por cada movimiento

Un **asiento** es una fila del libro que apunta un movimiento de dinero. Por
ejemplo:

> El 5 de septiembre se pagaron **45,90 €** con la tarjeta en la papelería,
> para **material** del centro.

Cada asiento tiene un **ID de transacción** que pone el libro solo, con la
fecha y un número de orden: `20260905-01` es el primer asiento del 5 de
septiembre de 2026. Ese ID sirve para encontrar el asiento, para nombrar su
factura y para reconocer luego la transferencia en el banco. **No cambia
nunca**, aunque después corrijas la fecha.

## Ingreso o gasto: el signo

En la columna **Cantidad**:

- un número **positivo** es dinero que **entra** (una cuota, una donación):
  `20,00 €`;
- un número **negativo** es dinero que **sale** (una compra, un pago):
  `-45,90 €`.

Las ventanas ya ponen el signo por ti. Solo tienes que pensar en él si
escribes a mano en la hoja.

## La partida: para qué es el dinero

Cada asiento se clasifica en una **partida**, que dice de qué es ese ingreso o
gasto. Las partidas tienen un código corto y un nombre:

| Código | Qué es |
|---|---|
| `I11` | Cuotas infantiles (10-15) |
| `G12` | Material |
| `G23` | Convivencia de otoño |

El código se lee así:

- **I** si es un **I**ngreso, **G** si es un **G**asto.
- El primer número es la **sección**: 1 Operaciones (el día a día), 2
  Actividades, 3 Financiación (lotería, rastrillo…) y 4 Donaciones.
- El resto es el número de la partida dentro de su sección.

No hace falta saberse los códigos: en el libro **puedes buscar la partida por
su nombre** («conviv» encuentra «G23 · Convivencia de otoño»).

Una **subpartida** afina más dentro de una partida. La convivencia, por
ejemplo, se divide en alojamiento (`G23A`), comida (`G23M`), transporte
(`G23T`) y material (`G23MT`). Es opcional, pero ayuda mucho a saber en qué se
ha ido el dinero de cada actividad.

## Presupuesto y real

Al empezar el curso, el equipo decide cuánto espera ingresar y gastar en cada
partida: es el **presupuesto**. Durante el curso, el libro suma lo que de
verdad se ha movido en cada una: es el **real**. Comparar los dos te dice si
una actividad se está pasando de lo previsto. Lo verás en las pestañas
**Presupuesto**, **Cuentas** y en la hoja de cada actividad
([Actividades y presupuesto](actividades.md)).

## Banco y efectivo: dos cajas

El centro tiene el dinero en dos sitios, y el libro lleva el **saldo** (lo que
hay) de cada uno por separado:

- **Banco**: la cuenta del centro. Lo que se paga con transferencia, tarjeta o
  Bizum, y los recibos.
- **Efectivo**: el dinero en mano, la caja. Lo que se cobra o paga en billetes
  y monedas.

## El traspaso: mover dinero de una caja a otra

Si cobras 90 € de cuotas en mano y luego los **ingresas en el banco**, eso no
es un ingreso nuevo: el dinero ya era del centro, solo ha cambiado de sitio.
Lo mismo al **sacar dinero del cajero**. Eso es un **traspaso**: no es ingreso
ni gasto, y se apunta con dos filas (una que sale de una caja y otra que entra
en la otra). La ventana de traspasos las crea las dos a la vez
([Efectivo y traspasos](efectivo.md)).

!!! warning "Por qué importa apuntarlo antes"

    En el extracto del banco, un ingreso en cajero de tesorería es idéntico al
    de una familia que paga su cuota en el cajero. Si no has apuntado antes el
    traspaso, el libro lo tomará por una cuota.

## La factura: el justificante

Cada gasto tiene que tener su **factura** o ticket: es la prueba de en qué se
gastó el dinero, y la pide cualquier revisión de cuentas. En el libro se sube
como PDF o foto y queda guardada en la carpeta de facturas del ejercicio, con
el ID del asiento como nombre ([Facturas](facturas.md)). Las únicas
excepciones son los movimientos entre cuentas de JMV y las devoluciones a
familias o particulares, que se marcan como que **no requieren** factura.

## El ejercicio: el año de las cuentas

Las cuentas van por **ejercicios**, igual que el curso: del **1 de septiembre
al 31 de agosto**. Cada ejercicio tiene su propio libro («Ejercicio 26-27»). Al
terminar, el dinero que queda pasa como **saldo inicial** al siguiente
([Cambio de ejercicio](cambio-de-ejercicio.md)).

## Fecha y fecha de pago

Cada asiento tiene dos fechas, que casi siempre coinciden:

- **Fecha**: la del gasto o la factura.
- **Fecha de pago**: cuando el dinero se movió de verdad.

El libro ordena los asientos, calcula los saldos y hace los informes por la
**fecha de pago**. A esto se le llama *criterio de caja*: cuenta lo que ha
pasado por el banco o por la caja, no lo prometido.

Un pago que ya has apuntado pero que todavía no ha salido del banco tiene la
fecha de pago **Pendiente**. Mientras está así, cuenta en el presupuesto de su
partida (ese dinero ya está comprometido), pero **no** en el saldo.

## Glosario rápido

| Palabra | Qué es |
|---|---|
| Asiento | Una fila del libro: un movimiento de dinero. |
| Extracto | La lista de movimientos que da el banco. Se descarga de su web y se importa en el libro. |
| ID de transacción | El código de cada asiento (`20260905-01`). No cambia nunca. |
| Partida / subpartida | Para qué es el dinero (`G23`) y, dentro de eso, en qué (`G23T`). |
| Saldo | El dinero que hay en el banco o en efectivo en un momento dado. |
| Traspaso | Pasar dinero del banco al efectivo o al revés. No es ingreso ni gasto. |
| Pendiente | Un pago apuntado que aún no ha salido del banco. |

<br>
