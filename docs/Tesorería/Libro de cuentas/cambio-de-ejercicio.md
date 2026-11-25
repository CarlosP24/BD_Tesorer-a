# Cambio de ejercicio

Cada **septiembre** empieza un ejercicio nuevo, y con él un libro nuevo. El del
curso que termina no se borra: se queda en la carpeta de Tesorería como las
cuentas cerradas de ese año.

### 1. Cierra el ejercicio que termina

Antes de crear el libro nuevo, deja el viejo completo hasta el **31 de
agosto**:

1. [Importa el extracto](importar-extracto.md) hasta el 31 de agosto.
2. [Completa los movimientos](completar-movimientos.md) y sube las
   [facturas](facturas.md) que falten.
3. Cuenta el efectivo y comprueba que coincide con el saldo de efectivo del
   libro.
4. Saca el [informe de cierre](informes.md).

### 2. Crea el libro del ejercicio siguiente

!!! info "Si tu centro está en el piloto, este paso no es tuyo"

    En los centros y áreas del piloto, el libro nuevo lo crea el equipo
    nacional desde la [consola nacional](consola-nacional.md), para todos a la
    vez, a primeros de septiembre. Antes de crear nada, mira en tu carpeta
    Tesorería si ya está **Ejercicio 27-28**. Si está, salta al paso 3. Si
    está y tú aún no has cerrado el viejo, termina el paso 1 igualmente y
    después **trae los saldos iniciales** (paso 3).

1. **En el libro que termina**, menú **Tesorería → Ejercicio → Crear el
   ejercicio siguiente…**
2. El libro te dice con qué saldos empezará el nuevo (los del 31 de agosto) y
   te avisa si hay algo que no cuenta en ellos, como transferencias aún
   pendientes. Pulsa **Sí**.
3. Se crea un archivo nuevo, **Ejercicio 27-28**, en la misma carpeta, con:
    - los saldos finales como **saldos iniciales**;
    - las **mismas partidas** del presupuesto, sin importes;
    - sin asientos y sin hojas de actividad.

### 3. Pon en marcha el libro nuevo

1. Abre **Ejercicio 27-28**. Lleva el mismo programa que el anterior, pero es
   otro archivo: la primera vez que uses el menú **Tesorería**, cada persona
   tendrá que **autorizarlo** otra vez (ver
   [Primeros pasos](primeros-pasos.md#5-la-primera-vez-autorizar-el-programa)).
2. Si el libro nuevo se creó **antes** de que terminaras de cerrar el viejo
   (por ejemplo, porque lo creó la consola nacional a primeros de
   septiembre), menú **Tesorería → Ejercicio → Traer los saldos iniciales del
   ejercicio anterior**. Así empieza con los saldos del 31 de agosto
   definitivos.
3. Menú **Tesorería → Diagnóstico → Diagnóstico del sistema**. Tiene que acabar
   sin ningún ✖.
4. Rellena el **Presupuesto** del curso nuevo y crea las hojas de las
   actividades.

!!! warning "La sincronización automática"

    Si usabas la sincronización automática con la base de socios, quítala en
    el libro viejo (**Tesorería → Diagnóstico → Quitar sincronización
    automática**) e instálala en el nuevo.

### Si después hay que tocar el ejercicio viejo

A veces aparece en septiembre una factura de agosto, o hay que corregir algo
del curso pasado. Hazlo en el libro **viejo**, y después, en el **nuevo**:
**Tesorería → Ejercicio → Traer los saldos iniciales del ejercicio anterior**.
El libro nuevo recalcula sus saldos iniciales.

## Movimientos del curso pasado que llegan ahora

Puede pasar que un cobro o un pago **del curso pasado** llegue al banco ya en
septiembre u octubre: una cuota que se pagó tarde, un recibo de agosto que el
banco cargó en septiembre…

Si ese dinero **ya lo contaste en el saldo inicial** del ejercicio nuevo, al
importar el extracto aparecerá otra vez y descuadrará. Para que no cuente dos
veces:

1. Busca la fila en Caja.
2. Ponle la partida **Ejercicio anterior** (está al final de la lista).

La fila se pone en gris y deja de contar para todo: saldo, cuentas, informes y
base de socios. **No la borres**: el siguiente extracto la volvería a meter.

!!! info "Al importar el primer extracto de septiembre"

    Si sabes que trae cosas del curso pasado, desmarca **Al terminar, apuntar en
    BD Socios las cuotas reconocidas** antes de subirlo, marca esas filas como
    *Ejercicio anterior*, y después **Tesorería → Sincronizar cuotas con BD
    Socios**. Así no se apuntan cuotas del curso pasado en el nuevo.

<br>
