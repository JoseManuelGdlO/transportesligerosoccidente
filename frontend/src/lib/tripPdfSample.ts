import type { Client, Driver, Trip, Truck } from "@/types/tlo";
import { SYSTEM_STATUS_CERRADO } from "@/lib/tripStatus";

export const SAMPLE_TRIP_DRIVER: Driver = {
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

export const SAMPLE_TRIP_TRUCK: Truck = {
  id: "sample-truck",
  numero_economico: "TLO-01",
  placas: "ABC-123-DEF",
  marca: "Freightliner",
  modelo: "Cascadia",
  anio: 2022,
  rendimiento_esperado: 3.5,
  costo_km_ref: 12,
  estatus: "activo",
};

export const SAMPLE_TRIP_CLIENT: Client = {
  id: "sample-client",
  razon_social: "Bimbo S.A. de C.V.",
  rfc: "BIM850101AAA",
  contacto: "Lic. Rodríguez",
  telefono: "3334567890",
};

export const SAMPLE_TRIP: Trip = {
  id: "sample-trip",
  folio: "T-1001",
  truck_id: "sample-truck",
  driver_id: "sample-driver",
  client_id: "sample-client",
  origen: "Guadalajara, JAL",
  destino: "Monterrey, NL",
  fecha_salida: "2025-05-12T08:00:00",
  fecha_llegada: "2025-05-13T14:00:00",
  km_inicial: 12000,
  km_final: 12780,
  tarifa: 24500,
  viaticos_entregados: 2500,
  num_factura: "F-2025-042",
  tipo_viaje: "foraneo",
  statuses: [SYSTEM_STATUS_CERRADO],
  fuel: [
    {
      id: "f1",
      litros: 180,
      precio_litro: 26.5,
      ubicacion: "Pemex Lagos",
      fecha: "2025-05-12T11:30:00",
      es_foraneo: false,
      estacion_nombre: "Estación empresa",
      es_estacion_empresa: true,
    },
    {
      id: "f2",
      litros: 90,
      precio_litro: 27.4,
      ubicacion: "Saltillo",
      fecha: "2025-05-13T05:00:00",
      es_foraneo: true,
      estacion_nombre: "Pemex Saltillo Norte",
    },
  ],
  expenses: [
    {
      id: "e1",
      categoria: "casetas",
      tipo: "gasto",
      descripcion: "Caseta La Joya",
      monto: 520,
      monto_comprobado: 520,
      visible_en_liquidacion: false,
      fecha: "2025-05-12T10:00:00",
    },
    {
      id: "e2",
      categoria: "comidas",
      tipo: "gasto",
      descripcion: "Comida en ruta",
      monto: 180,
      monto_comprobado: 0,
      visible_en_liquidacion: false,
      fecha: "2025-05-12T14:00:00",
    },
  ],
};
