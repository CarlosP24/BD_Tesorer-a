# Despliegue en los centros

Cada libro de cuentas («Ejercicio 26-27» de un centro) lleva **su propio
script**, con el código de este repositorio. Así lo pueden usar todas las
personas de tesorería, también las que entran con una cuenta **@gmail** a la
que la cuenta @jmvesp.org del centro da acceso.

Un complemento interno del dominio no les llegaría: solo funciona con cuentas
@jmvesp.org. Y publicarlo para cuentas externas exige a Google una verificación
con auditoría de seguridad anual.

Para que todos los centros usen **la misma versión**, el despliegue es central,
desde la cuenta de administración (que puede editar todos los libros de las
unidades compartidas):

| Pieza | Qué es |
|---|---|
| **Libro de cuentas** | Un Sheet por centro y ejercicio, en `Tesorería/` de su unidad compartida, con su script. Apunta el ID de su script en **Ajustes → Programa** la primera vez que alguien lo abre |
| **Configuración del centro** | Hoja **Ajustes** de cada libro (nombre, código, carpetas, BD Socios, IBAN). Casi todo se rellena solo |
| **Consola nacional** | Un Sheet con su script, en una unidad compartida de la administración: centros, estado, libros de cada año, informe nacional y la lista de scripts a los que desplegar |
| **Libro plantilla** | Un libro vacío con su script, en la misma unidad, que la consola copia para los centros sin libro del año anterior |
| **`despliegue/desplegar.js`** | Sube la versión del repositorio a todos los scripts de la lista |

> [!NOTE]
> **Despliegue progresivo.** La consola solo trabaja con los centros marcados
> **Activo = Sí**: son los del piloto. Ampliarlo es poner «Sí» a más centros.

---

## 1. Preparar la cuenta de administración (una vez)

1. Activa la **API de Apps Script** para tu cuenta en
   <https://script.google.com/home/usersettings>.
2. En esta carpeta del repositorio: `clasp login` con la cuenta de
   administración (no con la de un centro).
3. Guarda el `.clasp.json` actual (el del libro del centro que ya lo usaba):

    ```bash
    mv .clasp.json .clasp.centro-antiguo.json
    ```

## 2. La consola nacional (una vez)

La consola y la plantilla viven en una **unidad compartida de la
administración** (por ejemplo, la de Tesorería nacional), no en «Mi unidad»
de nadie: así no dependen de una cuenta concreta.

1. En esa unidad compartida, crea una hoja de cálculo vacía llamada **Consola
   nacional de Tesorería** y copia su ID (lo que va entre `/d/` y `/edit` en
   su dirección).
2. Vincúlale un script, desde una carpeta temporal **fuera del repositorio**:

    ```bash
    mkdir -p /tmp/consola && cd /tmp/consola
    clasp create --parentId <ID de la hoja> --title "Consola nacional de Tesorería"
    ```

    El ID del script queda en el `.clasp.json` de esa carpeta.
3. Pon ese ID en `despliegue/proyectos.txt` (`ID  # Consola nacional`) y
   ejecuta `node despliegue/desplegar.js`.
4. Abre la hoja y su editor de script (**Extensiones → Apps Script**), elige la
   función `crearConsolaNacional` y pulsa **Ejecutar**. Autoriza. La hoja pasa a
   ser la consola.
5. Recarga la hoja: en el menú **Tesorería** sale **Consola nacional**.

> [!TIP]
> Si ya la creaste en «Mi unidad» (con `clasp create --type sheets`), puedes
> moverla a la unidad compartida: el script va con la hoja y su ID no cambia.

**Quién puede usarla.** La consola abre los libros de los centros **con la
cuenta de quien la usa**. Para buscar centros, crear libros, reparar o sumar
el informe nacional, esa cuenta tiene que poder **editar las unidades
compartidas de los centros** (la tuya de administración puede). Quien solo
sea miembro de la unidad de la consola verá la hoja con lo último que se
actualizó, pero las opciones le fallarán en los centros a los que no tenga
acceso. La actualización nocturna corre con la cuenta de quien la instaló:
instálala con la tuya.

La consola resume las cuentas de todos los centros: deja en esa unidad solo
a quien deba verlas.

## 3. El libro plantilla (una vez)

1. Igual que la consola: una hoja vacía **Plantilla del libro de cuentas** en
   la misma unidad compartida, `clasp create --parentId <su ID> --title
   "Plantilla del libro de cuentas"` en otra carpeta temporal, su ID de script
   en la lista y `node despliegue/desplegar.js`.
2. Ábrela: **Tesorería → Ejercicio → Crear estructura** (el año da igual: al
   copiarla, la consola pone el del ejercicio). Revisa el Presupuesto:
   llevará las partidas comunes.
3. Pega su enlace en la consola: hoja **Ajustes de la consola → Libro
   plantilla**.

Al copiarla para un centro, la consola vacía su configuración (carpetas,
cuenta, BD Socios) y el libro nuevo la busca en la unidad de ese centro, así
que da igual dónde esté la plantilla.

## 4. Los libros del piloto

En la consola, menú **Tesorería → Consola nacional**:

1. **Buscar los centros en las unidades compartidas.** Añade a **Centros** cada
   unidad compartida con una carpeta `Tesorería` en la raíz, con **Activo =
   No**, y encuentra su libro del ejercicio. Si tu cuenta ve muchas unidades,
   puede no darle tiempo a todas: lo dice, y al volver a pulsar sigue por donde
   iba. La base de socios no la busca aquí (es lento y casi ningún centro la
   tiene): la recoge «Actualizar el estado» de la hoja Ajustes de cada libro.
2. En **Centros**, pon **Activo = Sí** y su **Código** a los centros y áreas del
   piloto.
3. En **Ajustes de la consola**, el año en que empieza el ejercicio (2026 para el
   «Ejercicio 26-27»).
4. **Crear los libros que falten del ejercicio.** A cada centro activo sin
   libro se lo crea en su carpeta Tesorería: como continuación del anterior,
   si lo tiene, o copiando la plantilla. Les pone el código y el nombre.

Cada libro tiene su script, pero **no apunta su ID hasta que alguien lo
abre**. Abre tú cada libro nuevo una vez (o espera a que lo abran en el
centro) y después **Actualizar el estado de todos los centros**: la columna
**Programa** recoge los ID.

### Lo que tiene que hacer cada centro

Nada de instalar. La persona de tesorería abre el libro (con su cuenta @gmail
o la del centro), usa cualquier opción del menú **Tesorería** y **autoriza** el
programa:

1. Google dice «Se necesita autorización»: **Continuar** y elegir su cuenta.
2. Sale «**Google no ha verificado esta aplicación**». Es normal: el programa es
   de la asociación y no se ha publicado. Pulsa **Configuración avanzada** y
   luego **Ir a … (no seguro)**.
3. **Permitir.**

Se hace una vez por persona y por libro: cada septiembre, con el libro nuevo,
otra vez. Lo explica la guía de uso (Primeros pasos).

## 5. Publicar una versión nueva

1. En la consola: **Actualizar el estado de todos los centros** y **Lista de
   programas para desplegar…**. Copia el texto en `despliegue/proyectos.txt`
   (no va a git). Lleva la consola, la plantilla y los libros activos del
   ejercicio. Los libros que nadie ha abierto todavía salen como comentario.
2. Desde el repositorio:

    ```bash
    node despliegue/desplegar.js --prueba    # qué se subiría y a dónde
    node despliegue/desplegar.js             # pasa las pruebas y sube
    ```

    Si alguno falla (sin permiso, libro borrado…), lo dice y sigue con los
    demás. Para reintentarlos, una lista solo con esos.
3. Si la versión cambia la **estructura** de los libros (sube
   `VERSION_ESTRUCTURA` en `00_Estructura.js`: columnas, fórmulas,
   validaciones), en la consola: **Reparar la estructura de todos los
   libros**, mejor a una hora sin uso. Mientras tanto, el panel y el
   Diagnóstico de cada libro avisan.

Los **ejercicios cerrados** no están en la lista y conservan su código: un
año cerrado no debe cambiar porque el código de hoy haga algo distinto.

> [!IMPORTANT]
> `desplegar.js` sube solo los `NN_*.js`, los `.html` y `appsscript.json`.
> **Nunca** `Config.js`: daría a todos los centros los datos de uno. Si cambian
> los permisos de `appsscript.json` (`oauthScopes`), cada persona tendrá que
> volver a autorizar.

## 6. Cada septiembre

El procedimiento completo, para el equipo nacional, está en la guía de uso:
[Consola nacional → Cerrar un ejercicio y abrir el
siguiente](https://jmv-espana.github.io/BD_Tesoreria/Tesorer%C3%ADa/Libro%20de%20cuentas/consola-nacional/#cerrar-un-ejercicio-y-abrir-el-siguiente).
Lo que toca a la administración:

1. En la consola, **Ajustes de la consola**: el año nuevo.
2. **Crear los libros que falten del ejercicio.** Cada centro activo tiene su
   «Ejercicio 27-28», como continuación del anterior (saldos finales de ese
   momento; el centro los actualiza con «Traer los saldos iniciales» al
   cerrar el viejo).
3. Cuando los centros los vayan abriendo: **Actualizar el estado** y §5 con la
   lista nueva. Los libros viejos salen de la lista y conservan su código.
4. El informe nacional de cierre se puede sacar después de cambiar el año:
   con fecha de corte 31/08, la consola llega a cada libro cerrado por su
   «Ejercicio anterior» (`libroDelEjercicio()`).

## 7. El centro que ya usaba el libro

Su libro sigue siendo el mismo archivo: **no se toca ningún dato**
(asientos, presupuesto, actividades, facturas). Lo que cambia es el programa
de su script, que ya tiene (es el de `.clasp.centro-antiguo.json`). Hazlo en
este orden, en un momento en que nadie lo esté usando:

1. **Pasa a Ajustes lo de `Config.js`**, antes que nada:

    ```bash
    node despliegue/config-a-ajustes.js
    ```

    Copia las filas que salen y pégalas en la hoja **Ajustes** del libro,
    debajo de la última (Sheets avisará de que es un rango protegido: es solo
    un aviso). Es importante hacerlo antes de reparar: el despliegue **borra**
    `Config.js` del script, y sin esas filas «Reparar» buscaría las carpetas
    junto al libro y, si las tuyas están en otro sitio o se llaman distinto,
    crearía otras vacías.
2. **Despliega a ese libro**: su ID de script (el de `.clasp.centro-antiguo.json`)
   en `despliegue/proyectos.txt` y `node despliegue/desplegar.js`.
3. **Repara**: en el libro, **Tesorería → Ejercicio → Reparar fórmulas,
   formatos y protecciones**. Hace esto:
    - pone la estructura al día: la columna nueva de Caja (*Asunto
      transferencia*), el saldo que no cuenta las transferencias pendientes y
      los desplegables con nombre;
    - añade a Ajustes las filas que falten y rellena solo las vacías (nombre
      del centro, carpetas que no estuvieran en `Config.js`);
    - añade al Presupuesto las partidas comunes que le falten (con la siembra
      actual, solo «I14 Otros ingresos de operaciones») y las pone en negrita.
      Las que ya tenía se quedan como están.
4. **Pasa el Diagnóstico** y revisa Ajustes.
5. La primera vez que alguien use el menú puede pedir **autorizar** otra vez,
   porque el programa declara ahora sus permisos.
6. En la consola, ese centro con **Activo = Sí**. Si el libro está en la
   carpeta `Tesorería` de su unidad compartida y se llama «Ejercicio 26-27»,
   «Buscar los centros» ya lo habrá encontrado. Si no, pega su enlace en la
   columna **Libro**.

La sincronización automática con BD Socios, si estaba puesta, sigue
funcionando: es el mismo script. Cuando todo esté en orden, tu `Config.js`
local ya no hace falta.

## Centros sin base de datos de socios

La mayoría de los centros todavía no la tienen. No pasa nada:

- el libro funciona igual, salvo el reconocimiento de cuotas: los ingresos
  llegan sin socio, y la partida se pone a mano (o desde la ventana);
- en **Ingreso o gasto en efectivo → Cuotas cobradas en mano** se apunta quién
  paga, su tramo y el importe, sin conciliar nada;
- el Diagnóstico lo indica con una ℹ, no como error, y ni el panel ni la
  importación enseñan nada de sincronizar.

Cuando un centro tenga su BD Socios, basta con pegar su enlace en **Ajustes →
BD Socios (archivo)**. «Reparar» también la busca sola en la unidad compartida.

## Plan de partidas común

Todos los libros tienen las partidas de `PRESUPUESTO.INGRESOS` y
`PRESUPUESTO.GASTOS` (`00_Estructura.js`): son el **plan común de JMV
España**. «Reparar» añade las que falten y las pone en negrita en el
Presupuesto. Cada centro añade encima las suyas (una actividad, una campaña).
En el informe nacional, cada partida propia cuenta en la común de su sección
(`NACIONAL.POR_DEFECTO`, `09_Nacional.js`): una convivencia en «G21
Actividades de centro», una lotería en «I31 Campañas de financiación».

> [!WARNING]
> **A validar por el equipo nacional.** La lista actual es la siembra genérica
> del primer libro (más «I14 Otros ingresos de operaciones»). Cambiarla cambia
> el plan de todos los centros a la vez: hazlo antes de que el piloto tenga
> muchos asientos, y repara todos los libros después.
