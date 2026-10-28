/**
 * Reabre y vuelve a confirmar el diésel con la regla del tanque.
 * Uso:
 *   npm run job:reapply-fuel-tanks -- --tenant <uuid> [--truck TL011] [--inicio YYYY-MM-DD] [--fin YYYY-MM-DD]
 *   Escribe un Excel con `Rendimiento 4.50 km/L / 3.0 esp.` (actual vs si se aplica).
 *   npm run job:reapply-fuel-tanks -- --tenant <uuid> --apply
 *   npm run job:reapply-fuel-tanks -- --tenant <uuid> --apply --yes
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { Op } from "sequelize";
import * as XLSX from "xlsx";
import { FuelLoad, FuelProrationAssignment, FuelTicket, Route, Trip, Truck, sequelize } from "../models";
import {
  applyTankReapply,
  compareTankReapplyMetrics,
  planTankReapply,
  tankMetricReportRows,
  type TankMetricSnapshot,
  type TankReapplyLine,
} from "../services/reapplyFuelTanks";
import { buildTankBlocks } from "../services/fuelProrationService";
import { num } from "../utils/numbers";

function parseArgs(argv: string[]): {
  apply: boolean;
  yes: boolean;
  tenantId: string;
  truck?: string;
  inicio?: string;
  fin?: string;
  out?: string;
} {
  const apply = argv.includes("--apply");
  const yes = argv.includes("--yes");
  const tenantAt = argv.indexOf("--tenant");
  const truckAt = argv.indexOf("--truck");
  const inicioAt = argv.indexOf("--inicio");
  const finAt = argv.indexOf("--fin");
  const outAt = argv.indexOf("--out");
  const tenantId = tenantAt >= 0 ? argv[tenantAt + 1] : "";
  if (!tenantId) {
    throw new Error(
      "Uso: npm run job:reapply-fuel-tanks -- --tenant <uuid> [--truck TL011] [--inicio YYYY-MM-DD] [--fin YYYY-MM-DD] [--out archivo.xlsx] [--apply] [--yes]",
    );
  }
  return {
    apply,
    yes,
    tenantId,
    truck: truckAt >= 0 ? argv[truckAt + 1] : undefined,
    inicio: inicioAt >= 0 ? argv[inicioAt + 1] : undefined,
    fin: finAt >= 0 ? argv[finAt + 1] : undefined,
    out: outAt >= 0 ? argv[outAt + 1] : undefined,
  };
}

function writeMetricWorkbook(
  filePath: string,
  opts: { inicio?: string; fin?: string; metrics: TankMetricSnapshot[] },
): void {
  const rows = tankMetricReportRows(opts.metrics);
  const periodo = [opts.inicio ?? "inicio", opts.fin ?? "fin"].join(" a ");
  const sheet = XLSX.utils.aoa_to_sheet([
    ["Periodo", periodo],
    [],
    [
      "Unidad",
      "Viajes",
      "Km",
      "Litros actuales",
      "Litros si se aplica",
      "Rendimiento actuales",
      "Rendimiento si se aplica",
      "Estado actuales",
      "Estado si se aplica",
    ],
    ...rows.map((row) => [
      row.unidad,
      row.viajes,
      row.km,
      row.litros_antes,
      row.litros_despues,
      row.rendimiento_antes,
      row.rendimiento_despues,
      row.estado_antes,
      row.estado_despues,
    ]),
  ]);
  sheet["!cols"] = [
    { wch: 12 },
    { wch: 8 },
    { wch: 10 },
    { wch: 16 },
    { wch: 18 },
    { wch: 36 },
    { wch: 36 },
    { wch: 16 },
    { wch: 16 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "Rendimiento");
  writeFileSync(filePath, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer);
}

function tripDate(trip: { fecha_salida: Date }): string {
  return trip.fecha_salida.toISOString().slice(0, 10);
}

async function askCommitOrReject(): Promise<"commit" | "reject"> {
  if (!input.isTTY) {
    throw new Error("Sin TTY: pasa --yes para confirmar la escritura, o corre sin --apply para solo ver métricas.");
  }
  const rl = readline.createInterface({ input, output });
  try {
    const raw = (await rl.question('Escribe "commit" para guardar, o "reject" para abortar sin tocar la BD: '))
      .trim()
      .toLowerCase();
    return raw === "commit" ? "commit" : "reject";
  } finally {
    rl.close();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await sequelize.authenticate();

  const trucks = await Truck.findAll({
    where: { tenant_id: args.tenantId, estatus: { [Op.ne]: "baja" } },
    order: [["numero_economico", "ASC"]],
  });
  const selected = args.truck ? trucks.filter((truck) => truck.numero_economico === args.truck) : trucks;

  const lines: TankReapplyLine[] = [];
  const metrics: TankMetricSnapshot[] = [];

  for (const truck of selected) {
    const tickets = await FuelTicket.findAll({
      where: { tenant_id: args.tenantId, truck_id: truck.id },
    });
    const trips = await Trip.findAll({
      where: { tenant_id: args.tenantId, truck_id: truck.id },
      include: [{ model: Route, attributes: ["id", "nombre"], required: false }],
      order: [["fecha_salida", "ASC"]],
    });
    const periodTrips = trips.filter((trip) => {
      const day = tripDate(trip);
      if (args.inicio && day < args.inicio) return false;
      if (args.fin && day > args.fin) return false;
      return true;
    });
    const planned = planTankReapply(
      { id: String(truck.id), numero_economico: truck.numero_economico },
      tickets,
      trips,
    );
    for (const line of planned) console.log(JSON.stringify(line));
    lines.push(...planned);

    const confirmedIds = tickets
      .filter((ticket) => ticket.prorrateo_confirmado_at != null)
      .map((ticket) => String(ticket.id));
    const pendingIds = new Set(
      tickets.filter((ticket) => ticket.prorrateo_confirmado_at == null).map((ticket) => String(ticket.id)),
    );
    const assignments = confirmedIds.length
      ? await FuelProrationAssignment.findAll({
          where: { tenant_id: args.tenantId, fuel_ticket_id: { [Op.in]: confirmedIds } },
        })
      : [];
    const tripIds = periodTrips.map((trip) => String(trip.id));
    const orphanRows = tripIds.length
      ? await FuelLoad.findAll({
          where: {
            tenant_id: args.tenantId,
            trip_id: { [Op.in]: tripIds },
            fuel_ticket_id: null,
          },
        })
      : [];
    const snapshot = compareTankReapplyMetrics({
      truck: {
        id: String(truck.id),
        numero_economico: truck.numero_economico,
        rendimiento_esperado: num(truck.rendimiento_esperado),
      },
      trips: periodTrips,
      lines: planned,
      confirmedLitros: assignments
        .filter((row) => row.litros_asignados != null)
        .map((row) => ({ trip_id: String(row.trip_id), litros: num(row.litros_asignados) })),
      pendingBlocks: buildTankBlocks(tickets, trips).filter((block) => pendingIds.has(block.ticket_id)),
      orphanLoads: orphanRows.map((load) => ({ trip_id: String(load.trip_id), litros: num(load.litros) })),
    });
    console.log(JSON.stringify({ metric: snapshot }));
    metrics.push(snapshot);
  }

  const outPath = path.resolve(
    args.out ??
      `reapply-fuel-tanks-rendimiento${args.inicio || args.fin ? `-${args.inicio ?? "inicio"}-${args.fin ?? "fin"}` : ""}.xlsx`,
  );
  writeMetricWorkbook(outPath, { inicio: args.inicio, fin: args.fin, metrics });

  console.log(
    JSON.stringify({
      mode: args.apply ? "preview" : "dry-run",
      tickets: lines.length,
      unidades: metrics.length,
      report: outPath,
    }),
  );

  if (!args.apply) return;

  const decision = args.yes ? "commit" : await askCommitOrReject();
  if (decision !== "commit") {
    console.log(JSON.stringify({ mode: "reject", written: false }));
    return;
  }

  const result = await sequelize.transaction(async (transaction) => {
    return applyTankReapply(args.tenantId, lines, transaction);
  });
  console.log(JSON.stringify({ mode: "commit", applied: result.applied, skipped: result.skipped }));
}

void main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
