/**
 * Añade contexto accionable a mensajes de error SAT/Sicofi frecuentes.
 *
 * Códigos enriquecidos:
 * - **CP107** — traslado: receptor CFDI debe coincidir con RFC del CSD en Sicofi.
 * - **CFDI40106** — CSD del PAC no corresponde al emisor del comprobante.
 * - **CP131** — falta o inconsistencia en `CantidadTransporta` de mercancías.
 *
 * @param msg - Mensaje original de Sicofi o del parseo.
 * @returns Mensaje con guía de corrección, o el original si no hay match.
 */
export function enhanceSicofiErrorMessage(msg: string): string {
  if (msg.includes("CP107")) {
    return (
      `${msg} — Traslado (T): el receptor CFDI debe ser el mismo RFC que el emisor del CSD en Sicofi ` +
      `(RFC, razón social y CP fiscal). Verifique que los datos fiscales del tenant coincidan con el certificado ` +
      `cargado en Sicofi (Administración → SAT) y que la serie esté dada de alta para tipo Traslado.`
    );
  }
  if (msg.includes("CFDI40106")) {
    return (
      `${msg} — El CSD configurado en Sicofi no corresponde al emisor del comprobante. ` +
      `Alinee tenant.rfc / razón social / cp_fiscal con el certificado del PAC o vuelva a cargar el CSD correcto.`
    );
  }
  if (msg.includes("CP131")) {
    return (
      `${msg} — Revise CantidadTransporta en mercancías (Cantidad, IDOrigen, IDDestino) y que coincidan con idubicacion de origen/destino.`
    );
  }
  return msg;
}
