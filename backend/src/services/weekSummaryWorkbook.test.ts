import assert from "node:assert/strict";
import { describe, it } from "node:test";
import ExcelJS from "exceljs";
import {
  WEEK_EXPORT_CONCEPTS,
  buildWeekSummaryWorkbook,
  conceptsFromSnapshot,
  predominantUnitType,
  resumenPeriodTitle,
  totalEfectivo,
  type WeekExportConcept,
} from "./weekSummaryWorkbook";

const azahel = {
  total_ingresos: 43200,
  total_comisiones: 6090,
  viaticos_entregados: 3000,
  viaticos_comprobados: 1709,
  total_descuentos: 2240,
  total_compensaciones: 0,
  total_anticipos: 1000,
  total_cuenta_abonos: 0,
  discounts: [{ tipo: "nomina", monto: 2240, en_periodo: true }],
};

describe("conceptsFromSnapshot", () => {
  it("separa nómina, descuentos y deja el total efectivo del ejemplo", () => {
    const concepts = conceptsFromSnapshot(
      {
        ...azahel,
        discounts: [
          { tipo: "nomina", monto: 2240, en_periodo: true },
          { tipo: "otro", monto: 0, en_periodo: true },
        ],
      },
      "TORTON",
    );
    assert.equal(concepts.deposito_nomina, 2240);
    assert.equal(concepts.descuentos, 0);
    assert.equal(concepts.tipo_unidad, "TORTON");
    assert.equal(totalEfectivo(concepts, new Set(WEEK_EXPORT_CONCEPTS)), 1559);
    assert.equal(concepts.viaticos_no_comprobados, 1291);
    assert.equal(concepts.viaticos_a_favor, 0);
    assert.equal(concepts.subtotal, 1559);
  });

  it("toma el adeudo del PDF: saldo anterior, abono y saldo actual", () => {
    const concepts = conceptsFromSnapshot(
      {
        ...azahel,
        account_applications: [
          { item_id: "p1", tipo: "prestamo", monto: 500, saldo_antes: 2000, saldo_despues: 1500 },
        ],
        account_items: [{ id: "i1", tipo: "incidencia", saldo: 300 }],
      },
      "TORTON",
    );
    assert.equal(concepts.saldo_anterior, 2300);
    assert.equal(concepts.abono_cuenta, 500);
    assert.equal(concepts.saldo_actual, 1800);
  });

  it("suma un descuento distinto de nómina y los abonos a cuenta", () => {
    const concepts = conceptsFromSnapshot(
      {
        ...azahel,
        total_descuentos: 2740,
        total_cuenta_abonos: 100,
        discounts: [
          { tipo: "nomina", monto: 2240, en_periodo: true },
          { tipo: "multa", monto: 500, en_periodo: true },
        ],
      },
      "",
    );
    assert.equal(concepts.deposito_nomina, 2240);
    assert.equal(concepts.descuentos, 600);
  });

  it("ignora viáticos cuando el concepto no va en el resumen", () => {
    const concepts = conceptsFromSnapshot(azahel, "TORTON");
    const visible = new Set<WeekExportConcept>(WEEK_EXPORT_CONCEPTS.filter((key) => key !== "viaticos"));
    assert.equal(totalEfectivo(concepts, visible), 4559);
  });
});

describe("predominantUnitType", () => {
  it("usa el modelo de la unidad con más viajes incluidos", () => {
    const trucks = new Map([
      ["t1", "Torton"],
      ["t2", "Rabon"],
    ]);
    const tipo = predominantUnitType(
      [
        { truck_id: "t2", included: true },
        { truck_id: "t1", included: true },
        { truck_id: "t1", included: true },
        { truck_id: "t2", included: false },
      ],
      trucks,
    );
    assert.equal(tipo, "TORTON");
  });
});

describe("resumenPeriodTitle", () => {
  it("omite el mes final cuando el periodo cae en el mismo mes", () => {
    assert.equal(resumenPeriodTitle("2026-10-25", "2026-10-30"), "RESUMEN LIQUIDACIONES DEL 25 DE OCTUBRE AL 30");
  });
});

describe("buildWeekSummaryWorkbook", () => {
  it("arma título, columnas, total y conceptos extra", async () => {
    const concepts = conceptsFromSnapshot(azahel, "TORTON");
    const buffer = await buildWeekSummaryWorkbook({
      inicio: "2026-10-25",
      fin: "2026-10-30",
      fuente: "liquidacion",
      conceptos: [...WEEK_EXPORT_CONCEPTS],
      adicionales: ["viaticos_no_comprobados"],
      rows: [{ driver_nombre: "Azahel Virgen Becerra", origen: "liquidacion", concepts }],
      omitidos: [],
    });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const ws = wb.getWorksheet("Resumen");
    assert.ok(ws);
    assert.equal(ws.getCell("A1").value, "RESUMEN LIQUIDACIONES DEL 25 DE OCTUBRE AL 30");
    assert.equal(ws.getCell("A2").value, "Fuente: Liquidación");
    assert.equal(ws.getCell("A3").value, "OPERADOR");
    assert.equal(ws.getCell("B3").value, "TIPO UNIDAD");
    assert.equal(ws.getCell("E3").value, "VIATICOS");
    assert.equal(ws.getCell("A4").value, "AZAHEL VIRGEN BECERRA");
    assert.equal(ws.getCell("B4").value, "TORTON");
    assert.equal(ws.getCell("K4").value, 1559);
    assert.equal(ws.getCell("A5").value, "TOTALES");
    assert.equal(ws.getCell("K5").value, 1559);
    assert.equal(ws.getCell("L3").value, "VIATICOS NO COMPROBADOS");
    assert.equal(ws.getCell("L4").value, 1291);
    assert.equal(ws.getCell("L5").value, 1291);
  });

  it("no escribe la columna de viáticos si se quitó el concepto", async () => {
    const concepts = conceptsFromSnapshot(azahel, "TORTON");
    const buffer = await buildWeekSummaryWorkbook({
      inicio: "2026-10-25",
      fin: "2026-10-30",
      fuente: "preliquidacion",
      conceptos: WEEK_EXPORT_CONCEPTS.filter((key) => key !== "viaticos"),
      adicionales: [],
      rows: [{ driver_nombre: "Azahel", origen: "vivo", concepts }],
      omitidos: [],
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const ws = wb.getWorksheet("Resumen");
    assert.ok(ws);
    const headers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((col) => ws.getCell(3, col).value);
    assert.equal(headers.includes("VIATICOS"), false);
    assert.equal(ws.getCell("A2").value, "Fuente: Preliquidación");
    assert.equal(ws.getCell("A4").value, "AZAHEL *");
    assert.equal(ws.getCell("J4").value, 4559);
  });
});
