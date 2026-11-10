import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeCommission,
  computeNetoPagar,
  computeSettlementTotals,
  computeTrip,
  previewAccountInstallments,
  viaticosAFavor,
  viaticosNoComprobado,
} from "./calc";
import type { Trip } from "../models/Trip";

const driver = {
  id: "driver-1",
  comision_tipo: "porcentaje",
  comision_valor: "10",
  comision_valor_local: "10",
  comision_valor_foraneo: "15",
} as never;

const tripWithExpenses = (
  viaticos_entregados: number,
  monto_comprobado: number,
): Trip & { fuel: []; expenses: { tipo: string; monto: number; monto_comprobado: number }[] } =>
  ({
    id: "trip-1",
    driver_id: "driver-1",
    tarifa: 1000,
    viaticos_entregados,
    tipo_viaje: "local",
    km_inicial: 0,
    km_final: 100,
    fuel: [],
    expenses: [
      {
        tipo: "gasto",
        monto: monto_comprobado,
        monto_comprobado,
      },
    ],
  }) as never;

describe("computeCommission por modalidad", () => {
  const trip = (overrides: Record<string, unknown> = {}) =>
    ({
      tarifa: 1000,
      tipo_viaje: "local",
      modalidad_cobro: "factura",
      ...overrides,
    }) as never;

  it("en sin comisión es 0 aunque haya tasa o override", () => {
    assert.equal(
      computeCommission(trip({ modalidad_cobro: "sin_comision", comision_override: 400 }), driver),
      0,
    );
  });

  it("en sin cobro usa solo el override", () => {
    assert.equal(
      computeCommission(trip({ modalidad_cobro: "sin_cobro", tarifa: 0, comision_override: 350 }), driver),
      350,
    );
  });

  it("en efectivo usa la tasa del operador", () => {
    assert.equal(computeCommission(trip({ modalidad_cobro: "efectivo" }), driver), 100);
  });
});

describe("computeTrip ingreso por modalidad", () => {
  it("en sin cobro no suma la tarifa al ingreso", () => {
    const fin = computeTrip(
      {
        tarifa: 5000,
        modalidad_cobro: "sin_cobro",
        comision_override: 200,
        tipo_viaje: "local",
        km_inicial: 0,
        km_final: 10,
        fuel: [],
        expenses: [],
      } as never,
      driver,
    );
    assert.equal(fin.ingreso, 0);
    assert.equal(fin.comision, 200);
  });

  it("en sin comisión no suma la tarifa al ingreso", () => {
    const fin = computeTrip(
      {
        tarifa: 5000,
        modalidad_cobro: "sin_comision",
        comision_override: 400,
        tipo_viaje: "local",
        km_inicial: 0,
        km_final: 10,
        fuel: [],
        expenses: [],
      } as never,
      driver,
    );
    assert.equal(fin.ingreso, 0);
    assert.equal(fin.comision, 0);
  });

  it("en efectivo sí cuenta la tarifa como ingreso", () => {
    const fin = computeTrip(
      {
        tarifa: 1000,
        modalidad_cobro: "efectivo",
        tipo_viaje: "local",
        km_inicial: 0,
        km_final: 10,
        fuel: [],
        expenses: [],
      } as never,
      driver,
    );
    assert.equal(fin.ingreso, 1000);
    assert.equal(fin.comision, 100);
  });
});

describe("computeNetoPagar", () => {
  it("suma saldo_viaticos positivo al neto", () => {
    assert.equal(
      computeNetoPagar({ total_comisiones: 5000, saldo_viaticos: 200 }),
      5200,
    );
  });

  it("resta saldo_viaticos negativo del neto", () => {
    assert.equal(
      computeNetoPagar({ total_comisiones: 5000, saldo_viaticos: -200 }),
      4800,
    );
  });

  it("resta total_cuenta_abonos del neto", () => {
    assert.equal(
      computeNetoPagar({
        total_comisiones: 5000,
        saldo_viaticos: 0,
        total_cuenta_abonos: 500,
      }),
      4500,
    );
  });
});

describe("viaticos helpers", () => {
  it("viaticosAFavor solo devuelve saldo positivo", () => {
    assert.equal(viaticosAFavor(200), 200);
    assert.equal(viaticosAFavor(-200), 0);
  });

  it("viaticosNoComprobado solo devuelve déficit", () => {
    assert.equal(viaticosNoComprobado(-200), 200);
    assert.equal(viaticosNoComprobado(200), 0);
  });
});

describe("previewAccountInstallments", () => {
  const items = [
    {
      id: "a",
      tipo: "incidencia",
      concepto: "Llanta",
      monto_original: 3000,
      cuota_liquidacion: 500,
      saldo: 3000,
      fecha: "2026-01-01",
    },
    {
      id: "b",
      tipo: "prestamo",
      concepto: "Préstamo",
      monto_original: 1000,
      cuota_liquidacion: 400,
      saldo: 1000,
      fecha: "2026-02-01",
    },
  ];

  it("aplica cuotas FIFO cuando hay neto suficiente", () => {
    const { applications, total } = previewAccountInstallments(2000, items);
    assert.equal(total, 900);
    assert.equal(applications.length, 2);
    assert.equal(applications[0]?.item_id, "a");
    assert.equal(applications[0]?.monto, 500);
    assert.equal(applications[0]?.saldo_despues, 2500);
    assert.equal(applications[1]?.item_id, "b");
    assert.equal(applications[1]?.monto, 400);
  });

  it("reparte neto parcial al adeudo más antiguo", () => {
    const { applications, total } = previewAccountInstallments(300, items);
    assert.equal(total, 300);
    assert.equal(applications.length, 1);
    assert.equal(applications[0]?.item_id, "a");
    assert.equal(applications[0]?.monto, 300);
  });

  it("no aplica nada si el neto es cero o negativo", () => {
    assert.equal(previewAccountInstallments(0, items).total, 0);
    assert.equal(previewAccountInstallments(-100, items).total, 0);
  });

  it("el último abono puede ser menor que la cuota", () => {
    const almostDone = [
      {
        id: "a",
        tipo: "incidencia",
        concepto: "Llanta",
        monto_original: 3000,
        cuota_liquidacion: 500,
        saldo: 200,
        fecha: "2026-01-01",
      },
    ];
    const { applications, total } = previewAccountInstallments(1000, almostDone);
    assert.equal(total, 200);
    assert.equal(applications[0]?.monto, 200);
    assert.equal(applications[0]?.saldo_despues, 0);
  });

  it("omite adeudos con descuento pausado", () => {
    const paused = [
      {
        id: "a",
        tipo: "incidencia",
        concepto: "Llanta",
        monto_original: 3000,
        cuota_liquidacion: 500,
        saldo: 3000,
        fecha: "2026-01-01",
        descuento_activo: false,
      },
      {
        id: "b",
        tipo: "prestamo",
        concepto: "Préstamo",
        monto_original: 1000,
        cuota_liquidacion: 400,
        saldo: 1000,
        fecha: "2026-02-01",
        descuento_activo: true,
      },
    ];
    const { applications, total } = previewAccountInstallments(2000, paused);
    assert.equal(total, 400);
    assert.equal(applications.length, 1);
    assert.equal(applications[0]?.item_id, "b");
  });
});

describe("computeSettlementTotals viaticos", () => {
  it("suma saldo a favor cuando comprobó más viáticos de los entregados", () => {
    const totals = computeSettlementTotals(driver, [tripWithExpenses(500, 700)]);

    assert.equal(totals.viaticos_entregados, 500);
    assert.equal(totals.viaticos_comprobados, 700);
    assert.equal(totals.saldo_viaticos, 200);
    assert.equal(totals.total_comisiones, 100);
    assert.equal(totals.neto_pagar, 300);
  });

  it("resta viáticos no comprobados cuando comprobó menos de lo entregado", () => {
    const totals = computeSettlementTotals(driver, [tripWithExpenses(500, 300)]);

    assert.equal(totals.saldo_viaticos, -200);
    assert.equal(totals.total_comisiones, 100);
    assert.equal(totals.neto_pagar, -100);
  });

  it("descuenta automáticamente 500 cuando entregó 3000 y comprobó 2500", () => {
    const totals = computeSettlementTotals(driver, [tripWithExpenses(3000, 2500)]);

    assert.equal(totals.viaticos_entregados, 3000);
    assert.equal(totals.viaticos_comprobados, 2500);
    assert.equal(totals.saldo_viaticos, -500);
    assert.equal(viaticosNoComprobado(totals.saldo_viaticos), 500);
    assert.equal(totals.total_comisiones, 100);
    assert.equal(totals.neto_pagar, -400);
  });
});
