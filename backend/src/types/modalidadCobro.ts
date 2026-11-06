export const MODALIDADES_COBRO = ["factura", "efectivo", "sin_comision", "sin_cobro"] as const;
export type ModalidadCobro = (typeof MODALIDADES_COBRO)[number];

export function isModalidadCobro(value: unknown): value is ModalidadCobro {
  return MODALIDADES_COBRO.includes(value as ModalidadCobro);
}

export function parseModalidadCobro(value: unknown): ModalidadCobro {
  return isModalidadCobro(value) ? value : "factura";
}

export function generaCxcAutomatica(modalidad: ModalidadCobro): boolean {
  return modalidad === "efectivo";
}

export function permiteTimbrar(modalidad: ModalidadCobro): boolean {
  return modalidad === "factura";
}

export function applyModalidadPersistencia(input: {
  modalidad: ModalidadCobro;
  tarifa?: number;
  comision_override?: number | null;
  num_factura?: string | null;
}): {
  tarifa?: number;
  comision_override?: number | null;
  num_factura?: string | null;
  error?: string;
} {
  const numFactura = input.num_factura?.trim() || null;
  if (input.modalidad !== "factura" && numFactura) {
    return { error: "Esta modalidad no admite número de factura" };
  }

  if (input.modalidad === "sin_cobro") {
    const override = input.comision_override;
    if (override == null || !(override > 0)) {
      return { error: "La comisión del operador es obligatoria y debe ser mayor a 0" };
    }
    return { tarifa: 0, comision_override: override, num_factura: null };
  }

  if (input.modalidad === "sin_comision" || generaCxcAutomatica(input.modalidad)) {
    const tarifa = input.tarifa ?? 0;
    if (!(tarifa > 0)) {
      return { error: "La tarifa debe ser mayor a 0" };
    }
    return {
      tarifa,
      comision_override: input.modalidad === "sin_comision" ? null : input.comision_override,
      num_factura: null,
    };
  }

  return {
    tarifa: input.tarifa,
    comision_override: input.comision_override,
    num_factura: numFactura,
  };
}
