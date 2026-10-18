/*******************************************************************
 * JMV — TESORERÍA · CONFIGURACIÓN DE ESTA INSTALACIÓN (PLANTILLA)
 *
 * Este archivo SÍ está en git, y es la plantilla del de verdad.
 *
 *   1. Cópialo:  cp Config.ejemplo.js Config.js
 *   2. Rellena los valores de Config.js
 *   3. clasp push
 *
 * Config.js está en .gitignore, así que no se publica, pero clasp sí
 * lo sube (clasp lee .claspignore, no .gitignore).
 *
 * AVISO: `clasp push` borra del proyecto los archivos que no existan
 * en local. Si haces push sin haber creado Config.js, te llevas por
 * delante el que hay en producción.
 *
 * Lo que cambia CADA EJERCICIO (fechas, curso, partidas de cuotas) no
 * va aquí: va en la hoja «Ajustes» del propio libro del ejercicio.
 *******************************************************************/

const CONFIG = {

  // ---------------------------------------------------------------
  // Datos del centro: salen en la cabecera de los informes.
  // ---------------------------------------------------------------
  NOMBRE_CENTRO: '',
  CODIGO_CENTRO: '',

  // ---------------------------------------------------------------
  // BD Socios: el ID del Google Sheet de socios (lo que va entre /d/ y
  // /edit en su URL). Hace falta para reconocer a los socios en los
  // extractos y para apuntar el pago de las cuotas en su pestaña Pagos.
  // ---------------------------------------------------------------
  ID_BD_SOCIOS: '',

  // ---------------------------------------------------------------
  // Carpetas de Drive (el ID va detrás de /folders/ en la URL). Dentro
  // de cada una se crea sola una subcarpeta por ejercicio ("2026-2027").
  // Ninguna debe estar compartida como "cualquiera con el enlace": los
  // extractos llevan nombres de familias y de menores.
  // ---------------------------------------------------------------

  // Facturas. Cada archivo se llama como el ID del asiento al que
  // pertenece (20261015-01.pdf), como pide la guía de la unidad
  // compartida.
  CARPETA_FACTURAS: '',

  // Copia de cada extracto bancario importado, tal cual llegó.
  CARPETA_EXTRACTOS: '',

  // Informes contables en PDF (la carpeta MEMORIAS de Tesorería).
  CARPETA_INFORMES: '',

  // ---------------------------------------------------------------
  // Cuenta bancaria. No son secretos (se dan a las familias para que
  // paguen). El IBAN sirve para avisar si se importa el extracto de
  // otra cuenta; el titular, para no tomar a la propia asociación por
  // la persona que paga cuando ingresa en cajero lo cobrado en mano.
  // Da igual cómo se escriba el IBAN (con espacios o seguido).
  // ---------------------------------------------------------------
  IBAN_CUENTA: '',
  TITULAR_CUENTA: '',

  // ---------------------------------------------------------------
  // Opcional: ID de un PNG o JPG en Drive para la cabecera de los
  // informes. Vacío = sin logo.
  // ---------------------------------------------------------------
  LOGO_INFORME: ''
};
