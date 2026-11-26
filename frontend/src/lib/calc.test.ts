import { describe, expect, it } from "vitest";
import {
  computeCommission,
  computeNetoPagar,
  computeSettlement,
  computeTrip,
  outstandingDebtsForSettlement,
  previewAccountInstallments,
  tripClientesLabel,
  tripClientIds,
  tripFacturasLabel,
  tripFlete,
  viaticosAFavor,
  viaticosNoComprobado,
} from "@/lib/calc";
import type { CartaPorteRecord, Driver, Trip, TripCfdiConcepto } from "@/types/tlo";

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

describe("computeCommission", () => {
  it("en sin comisión es 0 aunque haya override", () => {
    const trip = tripWithExpenses(0, 0);
    trip.modalidad_cobro = "sin_comision";
    trip.comision_override = 760;
    expect(computeCommission(trip, driver)).toBe(0);
  });

  it("en sin cobro usa solo el override", () => {
    const trip = tripWithExpenses(0, 0);
    trip.modalidad_cobro = "sin_cobro";
    trip.tarifa = 5000;
    trip.comision_override = 350;
    expect(computeCommission(trip, driver)).toBe(350);
  });

  it("en sin cobro no suma la tarifa al ingreso", () => {
    const trip = tripWithExpenses(0, 0);
    trip.modalidad_cobro = "sin_cobro";
    trip.tarifa = 5000;
    trip.comision_override = 350;
    expect(computeTrip(trip, driver).ingreso).toBe(0);
  });

  it("en sin comisión no suma la tarifa al ingreso", () => {
    const trip = tripWithExpenses(0, 0);
    trip.modalidad_cobro = "sin_comision";
    trip.tarifa = 5000;
    expect(computeTrip(trip, driver).ingreso).toBe(0);
    expect(computeCommission(trip, driver)).toBe(0);
  });

  it("usa el monto manual y no el porcentaje del operador", () => {
    const trip = tripWithExpenses(0, 0);
    trip.comision_override = 760;
    expect(computeCommission(trip, driver)).toBe(760);
  });

  it("acepta el monto manual cuando el API lo manda como texto", () => {
    const trip = tripWithExpenses(0, 0);
    trip.comision_override = "760.00" as unknown as number;
    expect(computeCommission(trip, driver)).toBe(760);
  });
});

describe("viaje con varias facturas de ingreso", () => {
  const concepto = (valor: number): TripCfdiConcepto => ({
    clave_prod_serv: "78101802",
    cantidad: 1,
    clave_unidad: "E54",
    unidad: "Viaje",
    descripcion: "Flete",
    valor_unitario: valor,
  });

  const carta = (
    overrides: Partial<CartaPorteRecord> & { valor?: number; folio?: string },
  ): CartaPorteRecord => ({
    id: overrides.id ?? "c-1",
    trip_id: "trip-1",
    estatus: overrides.estatus ?? "timbrada",
    tipo_comprobante: overrides.tipo_comprobante ?? "ingreso",
    folio_cfdi: overrides.folio ?? overrides.folio_cfdi ?? "4833",
    timbrado_at: overrides.timbrado_at ?? "2026-11-25T10:00:00.000Z",
    client_id: overrides.client_id,
    cfdi_conceptos: overrides.cfdi_conceptos ?? (overrides.valor != null ? [concepto(overrides.valor)] : [concepto(4973)]),
  });

  const driver20: Driver = { ...driver, comision_valor: 20, comision_valor_local: 20 };

  it("con una factura timbrada sigue usando la tarifa del viaje", () => {
    const trip = tripWithExpenses(0, 0);
    trip.tarifa = 4973;
    trip.cartas_porte = [carta({ id: "c-1", valor: 4973, folio: "4833" })];
    expect(tripFlete(trip)).toBe(4973);
    expect(computeTrip(trip, driver20).ingreso).toBe(4973);
    expect(computeCommission(trip, driver20)).toBeCloseTo(994.6);
    expect(tripFacturasLabel(trip)).toBe("4833");
  });

  it("con dos facturas suma flete y comisión porcentual", () => {
    const trip = tripWithExpenses(0, 0);
    trip.tarifa = 4973;
    trip.cartas_porte = [
      carta({ id: "c-1", valor: 4973, folio: "4833", timbrado_at: "2026-11-25T10:00:00.000Z" }),
      carta({
        id: "c-2",
        valor: 2000,
        folio: "4840",
        timbrado_at: "2026-11-26T10:00:00.000Z",
        client_id: "client-2",
      }),
    ];
    const fin = computeTrip(trip, driver20);
    expect(tripFlete(trip)).toBe(6973);
    expect(fin.ingreso).toBe(6973);
    expect(fin.comision).toBeCloseTo(1394.6);
    expect(tripFacturasLabel(trip)).toBe("4833, 4840");
    expect(tripClientIds(trip)).toEqual(["client-1", "client-2"]);
    expect(
      tripClientesLabel(trip, [
        { id: "client-1", razon_social: "RECAL ACEROS" },
        { id: "client-2", razon_social: "OTRO CLIENTE" },
      ]),
    ).toBe("RECAL ACEROS, OTRO CLIENTE");
  });

  it("respeta comision_override aunque haya dos facturas", () => {
    const trip = tripWithExpenses(0, 0);
    trip.tarifa = 4973;
    trip.comision_override = 500;
    trip.cartas_porte = [
      carta({ id: "c-1", valor: 4973, folio: "4833" }),
      carta({ id: "c-2", valor: 2000, folio: "4840" }),
    ];
    expect(computeTrip(trip, driver20).ingreso).toBe(6973);
    expect(computeCommission(trip, driver20)).toBe(500);
  });

  it("no suma carta cancelada ni de traslado", () => {
    const trip = tripWithExpenses(0, 0);
    trip.tarifa = 4973;
    trip.cartas_porte = [
      carta({ id: "c-1", valor: 4973, folio: "4833" }),
      carta({ id: "c-2", valor: 2000, folio: "4840", estatus: "cancelada" }),
      carta({ id: "c-3", valor: 1500, folio: "4841", tipo_comprobante: "traslado" }),
    ];
    expect(tripFlete(trip)).toBe(4973);
    expect(computeCommission(trip, driver20)).toBeCloseTo(994.6);
    expect(tripFacturasLabel(trip)).toBe("4833");
  });
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

  it("resta total_cuenta_abonos", () => {
    expect(
      computeNetoPagar({
        total_comisiones: 5000,
        saldo_viaticos: 0,
        total_cuenta_abonos: 500,
      }),
    ).toBe(4500);
  });
});

describe("previewAccountInstallments", () => {
  it("aplica FIFO y respeta neto disponible", () => {
    const { applications, total } = previewAccountInstallments(600, [
      {
        id: "old",
        tipo: "incidencia",
        concepto: "Llanta",
        monto_original: 3000,
        cuota_liquidacion: 500,
        saldo: 3000,
        fecha: "2026-01-01",
      },
      {
        id: "new",
        tipo: "prestamo",
        concepto: "Préstamo",
        monto_original: 1000,
        cuota_liquidacion: 400,
        saldo: 1000,
        fecha: "2026-02-01",
      },
    ]);
    expect(total).toBe(600);
    expect(applications).toHaveLength(2);
    expect(applications[0]?.item_id).toBe("old");
    expect(applications[0]?.monto).toBe(500);
    expect(applications[1]?.item_id).toBe("new");
    expect(applications[1]?.monto).toBe(100);
  });

  it("omite adeudos con descuento pausado", () => {
    const { applications, total } = previewAccountInstallments(2000, [
      {
        id: "paused",
        tipo: "incidencia",
        concepto: "Llanta",
        monto_original: 3000,
        cuota_liquidacion: 500,
        saldo: 3000,
        fecha: "2026-01-01",
        descuento_activo: false,
      },
      {
        id: "active",
        tipo: "prestamo",
        concepto: "Préstamo",
        monto_original: 1000,
        cuota_liquidacion: 400,
        saldo: 1000,
        fecha: "2026-02-01",
      },
    ]);
    expect(total).toBe(400);
    expect(applications).toHaveLength(1);
    expect(applications[0]?.item_id).toBe("active");
  });
});

describe("outstandingDebtsForSettlement", () => {
  const paused = {
    id: "paused",
    tipo: "incidencia",
    concepto: "Llanta",
    monto_original: 3000,
    cuota_liquidacion: 500,
    saldo: 3000,
    fecha: "2026-01-01",
    descuento_activo: false,
  };
  const active = {
    id: "active",
    tipo: "prestamo",
    concepto: "Préstamo",
    monto_original: 1000,
    cuota_liquidacion: 400,
    saldo: 1000,
    fecha: "2026-02-01",
    descuento_activo: true,
  };

  it("incluye adeudos pausados aunque no se descuenten", () => {
    const rows = outstandingDebtsForSettlement({
      account_items: [paused, active],
      account_applications: [
        {
          item_id: "active",
          tipo: "prestamo",
          concepto: "Préstamo",
          monto: 400,
          saldo_antes: 1000,
          saldo_despues: 600,
        },
      ],
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      id: "paused",
      concepto: "Llanta",
      saldo: 3000,
      descuento_activo: false,
      abono_periodo: 0,
    });
    expect(rows[1]).toMatchObject({
      id: "active",
      saldo: 600,
      descuento_activo: true,
      abono_periodo: 400,
    });
  });

  it("omite adeudos liquidados en el periodo", () => {
    const rows = outstandingDebtsForSettlement({
      account_items: [{ ...active, saldo: 400 }],
      account_applications: [
        {
          item_id: "active",
          tipo: "prestamo",
          concepto: "Préstamo",
          monto: 400,
          saldo_antes: 400,
          saldo_despues: 0,
        },
      ],
    });
    expect(rows).toHaveLength(0);
  });

  it("devuelve vacío si no hay cuenta del operador", () => {
    expect(outstandingDebtsForSettlement({})).toEqual([]);
  });

  it("reconstruye el saldo vigente desde las cuotas si no hay account_items", () => {
    const rows = outstandingDebtsForSettlement({
      account_applications: [
        {
          item_id: "p1",
          tipo: "pendiente",
          concepto: "Pendiente liquidación",
          monto: 40,
          saldo_despues: 200,
        },
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "p1",
      tipo: "pendiente",
      concepto: "Pendiente liquidación",
      saldo: 200,
      abono_periodo: 40,
    });
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
