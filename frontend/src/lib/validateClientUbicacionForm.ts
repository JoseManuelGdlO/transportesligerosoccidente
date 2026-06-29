import type { ClientUbicacion } from "@/types/tlo";

export type ClientUbicacionFormErrors = Partial<
  Record<"nombre" | "rfc" | "razon_social" | "cp" | "pais", string>
>;

export function validateClientUbicacionForm(
  form: Pick<ClientUbicacion, "nombre" | "rfc" | "razon_social" | "cp" | "pais">,
): ClientUbicacionFormErrors {
  const errors: ClientUbicacionFormErrors = {};
  if (!form.nombre.trim()) errors.nombre = "El nombre es obligatorio";
  const rfc = (form.rfc ?? "").trim();
  if (rfc.length > 13) errors.rfc = "El RFC no puede tener más de 13 caracteres";
  const razonSocial = (form.razon_social ?? "").trim();
  if (razonSocial.length > 255) errors.razon_social = "La razón social no puede tener más de 255 caracteres";
  const cp = (form.cp ?? "").trim();
  if (cp.length > 5) errors.cp = "El C.P. no puede tener más de 5 caracteres";
  const pais = (form.pais ?? "").trim();
  if (pais.length > 3) errors.pais = "El país no puede tener más de 3 caracteres";
  return errors;
}

export const UBICACION_FORM_REQUIRED_TOAST = "Captura el nombre de la ubicación";
