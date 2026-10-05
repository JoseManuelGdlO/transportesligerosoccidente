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

/** Códigos de validación del SAT en CFDI 4.0 y Carta Porte (CFDI40158, CP131, …). */
const SAT_ERROR_CODE = /\b(?:CFDI\d{3,}|CP\d{2,})\b/;

export type PacErrorOrigin = "sat" | "sicofi";

/**
 * Separa rechazos del SAT (código CFDI/CP) de fallos del PAC (auth, timeout, HTTP).
 * Quita prefijos previos para poder aplicarse más de una vez al mismo texto.
 */
export function classifyPacError(msg: string): { origin: PacErrorOrigin | null; text: string } {
  const clean = msg
    .replace(/^(?:SAT|Sicofi):\s*/i, "")
    .replace(/^Error:\s*/i, "")
    .trim();

  if (SAT_ERROR_CODE.test(clean)) {
    return { origin: "sat", text: clean };
  }
  if (/sicofi/i.test(clean)) {
    const text = clean.replace(/^Sicofi\s*/i, "").trim();
    return { origin: "sicofi", text: text || clean };
  }
  return { origin: null, text: clean };
}

/** Prefija el mensaje con `SAT:` o `Sicofi:` según `classifyPacError`. */
export function formatPacErrorMessage(msg: string): string {
  const { origin, text } = classifyPacError(msg);
  if (origin === "sat") return `SAT: ${text}`;
  if (origin === "sicofi") return `Sicofi: ${text}`;
  return text;
}
