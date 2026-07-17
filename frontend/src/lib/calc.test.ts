import { describe, expect, it } from "vitest";
import {
  computeNetoPagar,
  computeSettlement,
  viaticosAFavor,
  viaticosNoComprobado,
} from "@/lib/calc";
import type { Driver, Trip } from "@/types/tlo";

const driver: Driver = {
  id: "driver-1",
  nombre: "Operador",
  telefono: "",
  licencia: "",
  fecha_ingreso: "2026-01-01",
  comision_tipo: "porcentaje",
  comision_valor: 10,
  comision_valor_local: 10,
  comision_valor_foraneo: 15,
  estatus: "activo",
};

const tripWithExpenses = (viaticos_entregados: number, monto_comprobado: number): Trip => ({
  id: "trip-1",
  folio: "T-1",
  driver_id: "driver-1",
  truck_id: "truck-1",
  client_id: "client-1",
  origen: "A",
  destino: "B",
  fecha_salida: "2026-07-01T12:00:00.000Z",
  tarifa: 1000,
  viaticos_entregados,
  tipo_viaje: "local",
  km_inicial: 0,
  km_final: 100,
  statuses: [],
  fuel: [],
  expenses: [
    {
      id: "e-1",
      categoria: "casetas",
      tipo: "gasto",
      descripcion: "Casetas",
      monto: monto_comprobado,
      monto_comprobado,
      visible_en_liquidacion: false,
      fecha: "2026-07-01T12:00:00.000Z",
    },
  ],
});

describe("viaticos helpers", () => {
  it("viaticosAFavor solo devuelve saldo positivo", () => {
    expect(viaticosAFavor(200)).toBe(200);
    expect(viaticosAFavor(-200)).toBe(0);
  });

  it("viaticosNoComprobado solo devuelve déficit", () => {
    expect(viaticosNoComprobado(-500)).toBe(500);
    expect(viaticosNoComprobado(500)).toBe(0);
  });
});

describe("computeNetoPagar", () => {
  it("resta saldo_viaticos negativo del neto", () => {
    expect(computeNetoPagar({ total_comisiones: 5000, saldo_viaticos: -500 })).toBe(4500);
  });
});

describe("computeSettlement viaticos", () => {
  it("descuenta automáticamente 500 cuando entregó 3000 y comprobó 2500", () => {
    const totals = computeSettlement(
      driver,
      [tripWithExpenses(3000, 2500)],
      new Date("2026-07-01T00:00:00.000Z"),
      new Date("2026-07-31T23:59:59.999Z"),
    );

    expect(totals.viaticos_entregados).toBe(3000);
    expect(totals.viaticos_comprobados).toBe(2500);
    expect(totals.saldo_viaticos).toBe(-500);
    expect(viaticosNoComprobado(totals.saldo_viaticos)).toBe(500);
    expect(totals.total_comisiones).toBe(100);
    expect(totals.neto_pagar).toBe(-400);
  });
});
