# PDF de liquidación más claro

## Objetivo

El PDF de liquidación se lee como la hoja de referencia: saldos de préstamos e incidencias a la izquierda, resumen del neto a la derecha y, abajo, la tabla de viajes. El neto no cambia.

## Alcance

- Solo el PDF de liquidación generado en el frontend (`frontend/src/lib/pdfRender.ts`, a partir de `buildSettlementPdf`).
- Solo cifras que la liquidación ya calcula.
- Hoja horizontal.
- Encabezado y pie siguen la plantilla: logo, título, datos de la empresa, periodo, operador, unidad, pie, fecha de generación y número de página.

## Fuera de alcance

- Líneas de nómina (prima vacacional, ISR, IMSS, INFONAVIT, FONACOT, nómina).
- Cambios al cálculo del neto, a la API o al PDF de viaje.
- Pruebas nuevas. La verificación del PDF la hace el usuario en la vista previa de liquidación.

## Página

El cuerpo se dibuja siempre en este orden, sin importar el orden de bloques guardado en Personalización de PDF.

1. Dos columnas arriba.
   - Izquierda: caja **Préstamos** y caja **Incidencias**.
   - Derecha: caja **Resumen**.
2. Tabla **Viajes** abajo.

Cada caja de saldo muestra saldo anterior, abono del periodo y saldo actual. Varios conceptos van un renglón por concepto y un total. Si no hay conceptos, la caja sale en ceros. Un concepto que se liquida en el periodo sigue en la hoja con saldo actual en cero.

La tabla de viajes tiene: folio, unidad, ruta, tipo, salida, flete y comisión, más fila de totales. Los viáticos por viaje no van en la tabla; el periodo queda en el resumen.

## Cifras

Una función pura arma el modelo de la hoja desde `SettlementSummary`. El dibujo solo imprime ese modelo.

**Préstamos:** conceptos `tipo === "prestamo"`. **Incidencias:** `tipo === "incidencia"`.

Por concepto:

- Si hay aplicación en el periodo: saldo anterior, abono y saldo actual son `saldo_antes`, `monto` y `saldo_despues`.
- Si no hay aplicación y el saldo es mayor que cero: abono 0 y ambos saldos iguales al saldo vigente.
- Si el saldo es cero y no hubo abono: no se imprime.

**Resumen**, siempre con estas líneas (ceros incluidos). Compensaciones y viáticos a favor se imprimen en positivo. Descuentos, anticipos, viáticos no comprobados y abonos se imprimen en negativo.

| Línea | Origen |
| --- | --- |
| Comisión | `total_comisiones` |
| Compensaciones | `total_compensaciones` |
| Viáticos a favor | `max(0, saldo_viaticos)` |
| Descuentos | `total_descuentos` |
| Anticipos | `total_anticipos` |
| Viáticos no comprobados | `max(0, -saldo_viaticos)` |
| Subtotal | comisión + compensaciones + saldo de viáticos − descuentos − anticipos |
| Abono a préstamos | suma de aplicaciones `prestamo` |
| Abono a incidencias | suma de aplicaciones `incidencia` |
| Neto a pagar | ver abajo |

Si hubo abono a un concepto que no es préstamo ni incidencia (pendiente de semanas anteriores), esa línea se imprime solo cuando el monto es mayor que cero, entre los abonos y el neto, para que la resta cuadre con `total_cuenta_abonos`.

El número destacado es el neto a pagar: `neto_pagar` cuando `pendiente_arrastrado` es 0. Si `pendiente_arrastrado` es mayor que cero, el neto a pagar se imprime en 0 y debajo se indica ese pendiente como saldo que queda en la cuenta para la siguiente liquidación.

Montos ausentes se tratan como 0. Sin viajes, la tabla dice que no hay viajes en el periodo. Sin catálogo de unidades, la celda de unidad queda en «—».

## Personalización

Logo, colores, título, texto de la empresa y pie siguen editables. El cuerpo de la liquidación deja de seguir los bloques `trips_table`, `viaticos_summary` y `net_box`.

## Verificación

No se agregan pruebas. Las dos pruebas actuales de `frontend/src/lib/settlementPdf.test.ts` buscan el texto de la tabla vieja; se actualizan a las etiquetas nuevas para que la suite no falle. El usuario revisa el PDF en la vista previa.
