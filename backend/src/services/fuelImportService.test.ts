import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import * as XLSX from "xlsx";
import { FuelTicket, Truck } from "../models";
import {
  buildTruckIndexes,
  parseReportDateRangeFromSheet,
  previewFuelTicketsFromBuffer,
  validateTruckIndexes,
} from "./fuelImportService";

function mockTruck(partial: {
  id: string;
  numero_economico: string;
  folio_tag?: string | null;
  placas?: string;
}): Truck {
  return {
    id: partial.id,
    numero_economico: partial.numero_economico,
    folio_tag: partial.folio_tag ?? null,
    placas: partial.placas ?? "XYZ-123",
  } as Truck;
}

function sheetFromRows(rows: unknown[][]): XLSX.WorkSheet {
  return XLSX.utils.aoa_to_sheet(rows);
}

function xlsxBuffer(rows: unknown[][]): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

describe("parseReportDateRangeFromSheet", () => {
  it("parsea Reporte del … al … en filas previas al encabezado", () => {
    const sheet = sheetFromRows([
      ["Reporte del 26/05/2026 al 04/06/2026"],
      [],
      ["Folio", "Fecha", "Odometro", "Litros", "Precio por litro"],
      ["1", "27/05/2026", "100", "10", "20"],
    ]);
    const range = parseReportDateRangeFromSheet(sheet);
    assert.deepEqual(range, { inicio: "2026-05-26", fin: "2026-06-04" });
  });

  it("devuelve null si no hay título de reporte", () => {
    const sheet = sheetFromRows([
      ["Folio", "Fecha", "Odometro", "Litros", "Precio por litro"],
      ["1", "27/05/2026", "100", "10", "20"],
    ]);
    assert.equal(parseReportDateRangeFromSheet(sheet), null);
  });
});

describe("validateTruckIndexes", () => {
  it("detecta TAG duplicado", () => {
    const indexes = buildTruckIndexes([
      mockTruck({ id: "1", numero_economico: "TLO04", folio_tag: "ABC" }),
      mockTruck({ id: "2", numero_economico: "TN05", folio_tag: "ABC" }),
    ]);
    const conflicts = validateTruckIndexes(indexes);
    assert.equal(conflicts.length, 1);
    assert.match(conflicts[0]!.mensaje, /TAG "ABC" duplicado/);
  });

  it("detecta número económico exacto duplicado", () => {
    const indexes = buildTruckIndexes([
      mockTruck({ id: "1", numero_economico: "TLO04" }),
      mockTruck({ id: "2", numero_economico: "TLO04" }),
    ]);
    const conflicts = validateTruckIndexes(indexes);
    assert.ok(conflicts.some((c) => /Número económico "TLO04" duplicado/.test(c.mensaje)));
  });

  it("detecta clave flexible ambigua", () => {
    const indexes = buildTruckIndexes([
      mockTruck({ id: "1", numero_economico: "TLO04" }),
      mockTruck({ id: "2", numero_economico: "TN04" }),
    ]);
    const conflicts = validateTruckIndexes(indexes);
    assert.equal(conflicts.length, 1);
    assert.match(conflicts[0]!.mensaje, /Clave flexible "4" ambigua/);
  });
});

describe("previewFuelTicketsFromBuffer", () => {
  it("parsea filas válidas e inválidas sin insertar en base de datos", async () => {
    const truckFindAll = mock.method(Truck, "findAll", async () => [
      mockTruck({ id: "truck-1", numero_economico: "TN04", folio_tag: "00B1E80D" }),
    ] as never);
    const fuelFindAll = mock.method(FuelTicket, "findAll", async () => [] as never);
    const bulkCreate = mock.method(FuelTicket, "bulkCreate", async () => {
      throw new Error("preview no debe insertar");
    });

    const buffer = xlsxBuffer([
      ["Folio", "Tag", "Numero Econ", "Fecha", "Odometro", "Litros", "Precio por litro", "Importe"],
      ["2758", "00B1E80D", "TN04", "2025-05-27", "589912", "259.101", "29.46", "7633.12"],
      ["", "00B1E80D", "TN04", "2025-05-28", "100", "10", "20", "200"],
    ]);

    const result = await previewFuelTicketsFromBuffer("tenant-1", buffer);

    assert.equal(result.tickets.length, 1);
    assert.equal(result.tickets[0]!.folio, "2758");
    assert.equal(result.tickets[0]!.truck_id, "truck-1");
    assert.equal(result.tickets[0]!.posible_duplicado, false);
    assert.equal(result.errores.length, 1);
    assert.match(result.errores[0]!.mensaje, /Folio faltante/);
    assert.equal(bulkCreate.mock.callCount(), 0);

    truckFindAll.mock.restore();
    fuelFindAll.mock.restore();
    bulkCreate.mock.restore();
  });

  it("marca posible_duplicado cuando el folio ya existe", async () => {
    const truckFindAll = mock.method(Truck, "findAll", async () => [
      mockTruck({ id: "truck-1", numero_economico: "TN04", folio_tag: "00B1E80D" }),
    ] as never);
    const fuelFindAll = mock.method(FuelTicket, "findAll", async () => [
      {
        folio: "2758",
        truck_id: "truck-1",
        fecha: "2025-05-27",
        odometro: 589912,
        litros: "259.101",
      },
    ] as never);

    const buffer = xlsxBuffer([
      ["Folio", "Tag", "Numero Econ", "Fecha", "Odometro", "Litros", "Precio por litro", "Importe"],
      ["2758", "00B1E80D", "TN04", "2025-05-27", "589912", "259.101", "29.46", "7633.12"],
    ]);

    const result = await previewFuelTicketsFromBuffer("tenant-1", buffer);

    assert.equal(result.tickets.length, 1);
    assert.equal(result.tickets[0]!.posible_duplicado, true);

    truckFindAll.mock.restore();
    fuelFindAll.mock.restore();
  });
});
