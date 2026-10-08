# Extractos bancarios a Excel

Convierte resúmenes de cuenta en PDF (Banco Nación) en un Excel clasificado y listo para filtrar. Todo se procesa en el navegador: los PDF no se suben a ningún servidor.

## Qué hace

- Lee los movimientos de uno o varios PDF y los une en un solo Excel.
- Decide si cada movimiento es débito o crédito comparando el saldo con el renglón anterior, y marca en rojo los renglones donde el saldo no cierra.
- Compara el saldo final calculado con el del banco, y los totales de Ley 25413, SIRCREB e IBTC con los que informa el banco al pie del resumen.
- Clasifica cada movimiento según `reglas.js`.

## El Excel

- **Movimientos**: un renglón por movimiento, con autofiltro. La fila 1 muestra el total de lo que esté visible según el filtro.
- **Resumen**: créditos y débitos por imputación y mes. Usa fórmulas, así que si corregís una imputación en Movimientos, el resumen se actualiza.
- **Impuestos**: Ley 25413, SIRCREB, IVA y percepciones por mes, netos de reintegros.
- **Control**: conciliación de cada extracto.

## Importante sobre los PDF

Usá los PDF originales descargados del home banking. Un PDF escaneado, unido con iLovePDF o impreso con "Microsoft Print to PDF" queda como imagen y no se puede leer. No hace falta unirlos: se pueden subir varios a la vez.

## Cambiar la clasificación

Editá `reglas.js`. Cada regla dice qué textos debe contener la descripción y qué imputación asignar. Gana la primera que coincide, así que las reglas más específicas van arriba.

## Publicar en GitHub Pages

1. Creá un repositorio nuevo y subí todos los archivos.
2. En Settings → Pages, elegí la rama `main` y la carpeta `/ (root)`.
3. En un minuto queda disponible en `https://TU-USUARIO.github.io/NOMBRE-DEL-REPO/`.
