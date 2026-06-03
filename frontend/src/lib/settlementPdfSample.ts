import type { Driver, Trip, Truck } from "@/types/tlo";
import type { SettlementSummary } from "@/lib/calc";
import { formatSettlementUnitLabel } from "@/lib/settlementPdf";
import { SYSTEM_STATUS_CERRADO } from "@/lib/tripStatus";

/** Unidad de ejemplo (id alineado con `truck_id` de los viajes de muestra). */
export const SAMPLE_TRUCK: Truck = {
  id: "tr1",
  numero_economico: "T-101",
  placas: "JAL-4521-A",
  marca: "Kenworth",
  modelo: "T680",
  anio: 2021,
  rendimiento_esperado: 3.2,
  costo_km_ref: 18,
  estatus: "activo",
};

export const SAMPLE_TRUCKS: Truck[] = [SAMPLE_TRUCK];

export const SAMPLE_DRIVER: Driver = {
  id: "sample-driver",
  nombre: "Juan Pérez García",
  telefono: "3312345678",
  licencia: "ABC123",
  fecha_ingreso: "2024-01-15",
  comision_tipo: "porcentaje",
  comision_valor: 12,
  comision_valor_local: 12,
  comision_valor_foraneo: 15,
  estatus: "activo",
};

const sampleTrips: Trip[] = [
  {
    id: "t1",
    folio: "1001",
    driver_id: "sample-driver",
    truck_id: "tr1",
    client_id: "c1",
    origen: "Guadalajara",
    destino: "León",
    fecha_salida: "2025-05-12T08:00:00",
    tarifa: 18500,
    km_inicial: 12000,
    km_final: 12450,
    tipo_viaje: "foraneo",
    statuses: [SYSTEM_STATUS_CERRADO],
    fuel: [],
    expenses: [],
    viaticos_entregados: 2000,
  },
  {
    id: "t2",
    folio: "1002",
    driver_id: "sample-driver",
    truck_id: "tr1",
    client_id: "c2",
    origen: "León",
    destino: "Zapopan",
    fecha_salida: "2025-05-14T08:00:00",
    tarifa: 8200,
    km_inicial: 12450,
    km_final: 12680,
    tipo_viaje: "local",
    statuses: [SYSTEM_STATUS_CERRADO],
    num_factura: "F-2025-042",
    fuel: [],
    expenses: [],
    viaticos_entregados: 800,
  },
];

export const SAMPLE_SETTLEMENT_SUMMARY: SettlementSummary = {
  trips: sampleTrips,
  total_ingresos: 26700,
  total_comisiones: 3420,
  total_km: 630,
  viaticos_entregados: 2800,
  viaticos_comprobados: 2100,
  saldo_viaticos: -700,
  total_descuentos: 500,
  total_anticipos: 1000,
  neto_pagar: 1220,
  advances: [
    {
      id: "a1",
      fecha: "2025-05-10",
      descripcion: "Anticipo efectivo",
      monto: 1000,
      en_periodo: true,
    },
  ],
  discounts: [
    {
      id: "d1",
      tipo: "otro",
      fecha: "2025-05-11",
      descripcion: "Retraso en entrega",
      monto: 500,
      en_periodo: true,
    },
  ],
};

export const SAMPLE_PERIOD = { inicio: "2025-05-12", fin: "2025-05-18" };

export const SAMPLE_UNIT_LABEL = formatSettlementUnitLabel(
  SAMPLE_SETTLEMENT_SUMMARY.trips,
  SAMPLE_TRUCKS,
);
