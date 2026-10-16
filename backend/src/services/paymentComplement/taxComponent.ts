export interface TaxComponent {
  tipo: "traslado" | "retencion";
  impuesto: string;
  tipoFactor: string;
  tasaOCuota: number;
  base: number;
  importe: number;
}
