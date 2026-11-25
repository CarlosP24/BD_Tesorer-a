# JMV — Tesorería

Libro de cuentas de los centros y áreas de JMV España en Google Sheets. Su
menú **Tesorería** (y un panel lateral) hace lo siguiente:

- importa los extractos del banco;
- prepara los pagos por transferencia;
- recoge los pagos con tarjeta, el efectivo y las facturas;
- reconoce las cuotas de socio y las apunta en BD Socios, donde el centro la
  tiene;
- lleva el presupuesto de cada actividad;
- genera los informes contables en PDF.

Un Google Sheet por centro y ejercicio («Ejercicio 26-27», del 1 de septiembre
al 31 de agosto), en la carpeta Tesorería de la unidad compartida del centro.
Sus hojas:

- **Caja**: los asientos.
- **Presupuesto**: con el plan de partidas común de JMV España.
- **Cuentas**: lo real; se rellena solo.
- Una hoja por actividad.
- **Ajustes**: incluida la configuración del centro.
- **Log**: el registro de lo que hace el programa.

Una **consola nacional** reúne todos los centros. Desde ella se crean los
libros de cada año, se ve cómo va cada centro y se suma el informe nacional.

## Guía de uso

La guía completa, paso a paso y con capturas, para quien lleve la tesorería:
**<https://jmv-espana.github.io/BD_Tesoreria/>**. Se publica sola al cambiar
algo en [`docs/`](docs/Tesorería/Libro%20de%20cuentas/index.md) en `main`.

Está preparada para incorporarse a la
[web de documentación de JMV España](https://github.com/JMV-Espana/documentacion-publica):
basta con copiar esa carpeta a su `docs/Tesorería/` (en lugar de
`libro-cuentas.md`) y las imágenes de `docs/assets/img/` a su
`docs/assets/img/`.

## Despliegue

Para la administración: [DESPLIEGUE.md](DESPLIEGUE.md). Cada libro lleva su
propio script, para que lo puedan usar también las personas de tesorería que
entran con una cuenta @gmail. La administración sube cada versión a todos los
libros del piloto de una vez (`node despliegue/desplegar.js`), con la lista que
le da la consola. La guía también explica cómo se crean la consola y el libro
plantilla y cómo se pasa al sistema nuevo el centro que ya usaba el libro.

En los centros no hay nada que instalar: la consola les crea el libro, la
hoja Ajustes se rellena casi sola y cada persona autoriza el programa la
primera vez. La base de datos de socios es opcional: sin ella, las cuotas se
apuntan sin conciliar.

## Para quien mantenga el código

Ver [CLAUDE.md](CLAUDE.md). Pruebas: `node pruebas/ejecutar.js`. Capturas de
la guía: `node pruebas/capturas/generar.js` (CLAUDE.md §8).
