export type RolUbicacionFactura = "origen" | "destino";

export type ParteFormulario = {
  rol: RolUbicacionFactura;
  rfc?: string | null;
  nombre?: string | null;
};

export type ParteDistinta = {
  rol: RolUbicacionFactura;
  rfc: string;
  nombre: string;
};

export function normRfc(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, "").toUpperCase();
}

export function normNombre(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toUpperCase();
}

/** Vacío no cuenta: el XML usa entonces el RFC y la razón social del receptor. */
export function identidadesDistintas(
  parte: { rfc?: string | null; nombre?: string | null },
  receptor: { rfc?: string | null; nombre?: string | null },
): boolean {
  const rfcP = normRfc(parte.rfc);
  const rfcR = normRfc(receptor.rfc);
  const nomP = normNombre(parte.nombre);
  const nomR = normNombre(receptor.nombre);
  if (rfcP && rfcR && rfcP !== rfcR) return true;
  if (nomP && nomR && nomP !== nomR) return true;
  return false;
}

export function partesConOtroNombre(
  partes: ParteFormulario[],
  receptor: { rfc?: string | null; nombre?: string | null },
): ParteDistinta[] {
  return partes.flatMap((parte) => {
    if (!identidadesDistintas(parte, receptor)) return [];
    return [
      {
        rol: parte.rol,
        rfc: (parte.rfc ?? "").trim(),
        nombre: (parte.nombre ?? "").trim(),
      },
    ];
  });
}

export function avisoParteDistinta(distintas: ParteDistinta[], receptorNombre: string): string {
  if (distintas.length === 0) return "";
  const frases = distintas.map((parte) => {
    const etiqueta = parte.rol === "origen" ? "El origen" : "El destino";
    const quien = parte.nombre || parte.rfc || "otro nombre";
    const detalle = parte.nombre && parte.rfc ? `${quien} (${parte.rfc})` : quien;
    return `${etiqueta} sigue a nombre de ${detalle}`;
  });
  const receptor = receptorNombre.trim() || "el cliente de esta factura";
  return `${frases.join(". ")}. El CFDI se cobra a ${receptor}. Esas filas viajan en el mismo comprobante.`;
}

export function aplicarParteEnFormulario<
  T extends { rfc: string; nombre: string; client_ubicacion_id?: string },
>(
  form: T,
  ubic: { rfc?: string | null; nombre?: string | null; client_ubicacion_id?: string | null },
): { form: T; cambioIdentidad: boolean } {
  const rfc = ubic.rfc?.trim() ? ubic.rfc.trim() : form.rfc;
  const nombre = ubic.nombre?.trim() ? ubic.nombre.trim() : form.nombre;
  const next: T = {
    ...form,
    rfc,
    nombre,
    client_ubicacion_id: ubic.client_ubicacion_id || undefined,
  };
  return {
    form: next,
    cambioIdentidad: normRfc(form.rfc) !== normRfc(rfc) || normNombre(form.nombre) !== normNombre(nombre),
  };
}
