import type { ModalidadCobro } from "@/types/tlo";

export const MODALIDADES_COBRO = ["factura", "efectivo", "sin_comision", "sin_cobro"] as const;
export type { ModalidadCobro };

export const MODALIDAD_COBRO_LABEL: Record<ModalidadCobro, string> = {
  factura: "Con factura",
  efectivo: "Efectivo",
  sin_comision: "Sin comisión",
  sin_cobro: "Sin cobro",
};

export const MODALIDAD_COBRO_TIPO_DOCTO: Record<ModalidadCobro, string> = {
  factura: "FACTURA",
  efectivo: "EFECTIVO",
  sin_comision: "SIN COMISION",
  sin_cobro: "SIN COBRO",
};

export function parseModalidadCobro(value: unknown): ModalidadCobro {
  return MODALIDADES_COBRO.includes(value as ModalidadCobro) ? (value as ModalidadCobro) : "factura";
}

export function generaCxcAutomatica(modalidad: ModalidadCobro): boolean {
  return modalidad === "efectivo";
}

export function permiteTimbrar(modalidad: ModalidadCobro): boolean {
  return modalidad === "factura";
}

export function tipoDoctoSaldos(modalidad: ModalidadCobro | null | undefined): string {
  if (!modalidad) return "FACTURA";
  return MODALIDAD_COBRO_TIPO_DOCTO[modalidad];
}
