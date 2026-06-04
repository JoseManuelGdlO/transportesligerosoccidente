import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as XLSX from "xlsx";
import { Truck } from "../models";
import {
  buildTruckIndexes,
  parseReportDateRangeFromSheet,
  validateTruckIndexes,
} from "./fuelImportService";

function mockTruck(partial: {
  id: string;
  numero_economico: string;
  folio_tag?: string | null;
}): Truck {
  return {
    id: partial.id,
    numero_economico: partial.numero_economico,
    folio_tag: partial.folio_tag ?? null,
  } as Truck;
}

function sheetFromRows(rows: unknown[][]): XLSX.WorkSheet {
  return XLSX.utils.aoa_to_sheet(rows);
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
