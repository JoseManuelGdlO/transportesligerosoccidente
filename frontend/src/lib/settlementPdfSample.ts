import type { Driver, Trip } from "@/types/tlo";
import type { SettlementSummary } from "@/lib/calc";

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
    estatus: "cerrado",
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
    estatus: "cerrado",
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
