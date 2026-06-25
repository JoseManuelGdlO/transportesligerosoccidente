/** URL de verificación SAT para el código QR del CFDI. */
export function buildSatQrUrl(params: {
  uuid: string;
  rfcEmisor: string;
  rfcReceptor: string;
  total: string;
  selloCfd: string;
}): string {
  const fe = params.selloCfd.slice(-8);
  const q = new URLSearchParams({
    id: params.uuid,
    re: params.rfcEmisor,
    rr: params.rfcReceptor,
    tt: params.total,
    fe,
  });
  return `https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx?${q.toString()}`;
}
