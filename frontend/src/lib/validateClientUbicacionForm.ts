import type { ClientUbicacion } from "@/types/tlo";

export type ClientUbicacionFormErrors = Partial<Record<"nombre" | "cp" | "pais", string>>;

export function validateClientUbicacionForm(
  form: Pick<ClientUbicacion, "nombre" | "cp" | "pais">,
): ClientUbicacionFormErrors {
  const errors: ClientUbicacionFormErrors = {};
  if (!form.nombre.trim()) errors.nombre = "El nombre es obligatorio";
  const cp = (form.cp ?? "").trim();
  if (cp.length > 5) errors.cp = "El C.P. no puede tener más de 5 caracteres";
  const pais = (form.pais ?? "").trim();
  if (pais.length > 3) errors.pais = "El país no puede tener más de 3 caracteres";
  return errors;
}

export const UBICACION_FORM_REQUIRED_TOAST = "Captura el nombre de la ubicación";
