import type { Client } from "@/types/tlo";

export type ClientFormErrors = Partial<
  Record<"razon_social" | "rfc" | "contacto" | "telefono" | "email", string>
>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function hasFormErrors(errors: Record<string, string | undefined>): boolean {
  return Object.keys(errors).length > 0;
}

export function validateClientForm(
  form: Pick<Client, "razon_social" | "rfc" | "contacto" | "telefono" | "email">,
): ClientFormErrors {
  const errors: ClientFormErrors = {};
  if (!form.razon_social.trim()) errors.razon_social = "La razón social es obligatoria";
  if (!form.rfc.trim()) errors.rfc = "El RFC es obligatorio";
  if (!form.contacto.trim()) errors.contacto = "El contacto es obligatorio";
  if (!form.telefono.trim()) errors.telefono = "El teléfono es obligatorio";
  const email = (form.email ?? "").trim();
  if (email && !EMAIL_RE.test(email)) errors.email = "Correo electrónico inválido";
  return errors;
}

export const CLIENT_FORM_REQUIRED_TOAST = "Completa razón social, RFC, contacto y teléfono";
