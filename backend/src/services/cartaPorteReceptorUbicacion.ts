export type ParteIdentidad = {
  rfc?: string | null;
  nombre?: string | null;
};

export type UbicacionParte = ParteIdentidad & {
  client_ubicacion_id?: string | null;
};

export type RelabelUbicacion = {
  changed: boolean;
  rfc: string | null;
  nombre: string | null;
  client_ubicacion_id: string | null;
};

export function normRfc(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, "").toUpperCase();
}

export function normNombre(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toUpperCase();
}

/**
 * La fila sigue siendo ese cliente si trae su RFC,
 * o si no trae RFC y la razón social es la de él.
 * Un RFC distinto es otro remitente o destinatario y no se toca.
 */
export function ubicacionIdentificaCliente(ubic: ParteIdentidad, cliente: ParteIdentidad): boolean {
  const rfcU = normRfc(ubic.rfc);
  const rfcC = normRfc(cliente.rfc);
  if (rfcU && rfcC && rfcU === rfcC) return true;
  if (!rfcU && normNombre(ubic.nombre) && normNombre(ubic.nombre) === normNombre(cliente.nombre)) {
    return true;
  }
  return false;
}

function sinCambio(ubic: UbicacionParte): RelabelUbicacion {
  return {
    changed: false,
    rfc: ubic.rfc ?? null,
    nombre: ubic.nombre ?? null,
    client_ubicacion_id: ubic.client_ubicacion_id ?? null,
  };
}

/**
 * Al cambiar el receptor, origen y destino que todavía dicen el cliente
 * anterior pasan a su RFC y razón social. La calle y el CP se quedan:
 * el domicilio del viaje no es el del comprobante.
 * Se suelta el catálogo para que no vuelva a pintar el nombre anterior.
 */
export function relabelUbicacionAlCambiarReceptor(
  ubic: UbicacionParte,
  anterior: ParteIdentidad,
  nuevo: ParteIdentidad,
): RelabelUbicacion {
  if (!ubicacionIdentificaCliente(ubic, anterior)) return sinCambio(ubic);
  const rfcNuevo = normRfc(nuevo.rfc);
  const nombreNuevo = (nuevo.nombre ?? "").trim().replace(/\s+/g, " ");
  if (!rfcNuevo && !nombreNuevo) return sinCambio(ubic);
  const rfc = rfcNuevo || (ubic.rfc ?? null);
  const nombre = nombreNuevo || (ubic.nombre ?? null);
  const changed =
    normRfc(ubic.rfc) !== normRfc(rfc) ||
    normNombre(ubic.nombre) !== normNombre(nombre) ||
    Boolean(ubic.client_ubicacion_id);
  return {
    changed,
    rfc,
    nombre,
    client_ubicacion_id: null,
  };
}
