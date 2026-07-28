/** Línea editable de concepto CFDI de ingreso asociada a un viaje. */
export type TripCfdiConcepto = {
  clave_prod_serv: string;
  cantidad: number;
  clave_unidad: string;
  unidad: string;
  descripcion: string;
  valor_unitario: number;
  objeto_imp?: "01" | "02";
};

export const DEFAULT_CFDI_CLAVE_PROD_SERV = "78101802";
export const DEFAULT_CFDI_CLAVE_UNIDAD = "E54";
export const DEFAULT_CFDI_UNIDAD = "Viaje";
