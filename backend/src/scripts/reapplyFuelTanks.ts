/**
 * Reabre y vuelve a confirmar el diésel con la regla del tanque.
 * Uso: npm run job:reapply-fuel-tanks -- --tenant <uuid> [--truck TL011] [--apply]
 */
import "dotenv/config";
import { Op } from "sequelize";
import { FuelTicket, Route, Trip, Truck, sequelize } from "../models";
import { applyTankReapply, planTankReapply, type TankReapplyLine } from "../services/reapplyFuelTanks";

function parseArgs(argv: string[]): { apply: boolean; tenantId: string; truck?: string } {
  const apply = argv.includes("--apply");
  const tenantAt = argv.indexOf("--tenant");
  const truckAt = argv.indexOf("--truck");
  const tenantId = tenantAt >= 0 ? argv[tenantAt + 1] : "";
  if (!tenantId) {
    throw new Error("Uso: npm run job:reapply-fuel-tanks -- --tenant <uuid> [--truck TL011] [--apply]");
  }
  const truck = truckAt >= 0 ? argv[truckAt + 1] : undefined;
  return { apply, tenantId, truck };
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
  for (const truck of selected) {
    const tickets = await FuelTicket.findAll({
      where: { tenant_id: args.tenantId, truck_id: truck.id },
    });
    const trips = await Trip.findAll({
      where: { tenant_id: args.tenantId, truck_id: truck.id },
      include: [{ model: Route, attributes: ["id", "nombre"], required: false }],
      order: [["fecha_salida", "ASC"]],
    });
    const planned = planTankReapply(
      { id: String(truck.id), numero_economico: truck.numero_economico },
      tickets,
      trips,
    );
    for (const line of planned) console.log(JSON.stringify(line));
    lines.push(...planned);
  }

  if (!args.apply) {
    console.log(JSON.stringify({ mode: "dry-run", tickets: lines.length }));
    return;
  }

  const result = await applyTankReapply(args.tenantId, lines);
  console.log(JSON.stringify({ mode: "apply", applied: result.applied, skipped: result.skipped }));
}

void main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
