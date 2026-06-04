import type { Truck } from "@/types/tlo";
import { hasFormErrors } from "@/lib/validateClientForm";

export { hasFormErrors };

export type TruckFormErrors = Partial<
  Record<
    | "numero_economico"
    | "placas"
    | "marca"
    | "modelo"
    | "anio"
    | "rendimiento_esperado"
    | "costo_km_ref",
    string
  >
>;

const MIN_YEAR = 1980;

export const TRUCK_FORM_REQUIRED_TOAST =
  "Completa número económico, placas, marca y modelo";

export function validateTruckForm(
  form: Pick<
    Truck,
    | "numero_economico"
    | "placas"
    | "marca"
    | "modelo"
    | "anio"
    | "rendimiento_esperado"
    | "costo_km_ref"
  >,
): TruckFormErrors {
  const errors: TruckFormErrors = {};
  const maxYear = new Date().getFullYear() + 1;

  if (!form.numero_economico.trim()) {
    errors.numero_economico = "El número económico es obligatorio";
  }
  if (!form.placas.trim()) errors.placas = "Las placas son obligatorias";
  if (!form.marca.trim()) errors.marca = "La marca es obligatoria";
  if (!form.modelo.trim()) errors.modelo = "El modelo es obligatorio";

  const anio = form.anio;
  if (!Number.isInteger(anio) || anio < MIN_YEAR || anio > maxYear) {
    errors.anio = `Indica un año válido (${MIN_YEAR}–${maxYear})`;
  }

  const rend = form.rendimiento_esperado;
  if (!Number.isFinite(rend) || rend <= 0) {
    errors.rendimiento_esperado = "Indica un rendimiento mayor a 0";
  }

  const costo = form.costo_km_ref;
  if (!Number.isFinite(costo) || costo < 0) {
    errors.costo_km_ref = "Indica un costo por km válido (0 o más)";
  }

  return errors;
}
