import { randomUUID } from "node:crypto";
import { Op } from "sequelize";
import {
  MaintenanceSchedule,
  MaintenanceRecord,
  Trip,
  FuelTicket,
  Truck,
  Notification,
} from "../models";
import type { MaintenanceType } from "../models/MaintenanceSchedule";
import { usersWithPermission } from "../utils/notifyUsers";
import { getClosedStatusIds } from "./tripStatusService";

const tipoLabel: Record<MaintenanceType, string> = {
  menor: "Menor",
  intermedio: "Intermedio",
  correctivo: "Correctivo",
};

function maintenancePendingKey(userId: string, truckId: string, tipo: string): string {
  return `${userId}:${truckId}:${tipo}`;
}

export async function getTruckOdometer(tenantId: string, truckId: string): Promise<number> {
  const closedIds = await getClosedStatusIds(tenantId);
  let kmTrip = 0;
  if (closedIds.length > 0) {
    const lastTrip = await Trip.findOne({
      where: { tenant_id: tenantId, truck_id: truckId, km_final: { [Op.ne]: null } },
      include: [
        {
          association: "statuses",
          where: { id: closedIds },
          required: true,
          through: { attributes: [] },
        },
      ],
      order: [["fecha_llegada", "DESC"]],
      attributes: ["km_final"],
    });
    kmTrip = lastTrip?.km_final ?? 0;
  }
  const lastFuel = await FuelTicket.findOne({
    where: { tenant_id: tenantId, truck_id: truckId },
    order: [["fecha", "DESC"], ["hora", "DESC"]],
    attributes: ["odometro"],
  });
  const kmFuel = lastFuel?.odometro ?? 0;
  return Math.max(kmTrip, kmFuel);
}

export async function listSchedules(tenantId: string, truckId?: string) {
  const where: Record<string, unknown> = { tenant_id: tenantId, activo: true };
  if (truckId) where.truck_id = truckId;
  return MaintenanceSchedule.findAll({ where, order: [["truck_id", "ASC"], ["tipo", "ASC"]] });
}

export async function upsertSchedule(
  tenantId: string,
  data: {
    truck_id: string;
    tipo: MaintenanceType;
    intervalo_km?: number | null;
    ultimo_km?: number;
    ultima_fecha?: string | null;
  },
) {
  const truck = await Truck.findOne({ where: { id: data.truck_id, tenant_id: tenantId } });
  if (!truck) {
    const err = new Error("Camión no encontrado");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }
  const existing = await MaintenanceSchedule.findOne({
    where: { tenant_id: tenantId, truck_id: data.truck_id, tipo: data.tipo },
  });
  if (existing) {
    await existing.update({
      intervalo_km: data.intervalo_km ?? null,
      ultimo_km: data.ultimo_km ?? existing.ultimo_km,
      ultima_fecha: data.ultima_fecha ?? existing.ultima_fecha,
      activo: true,
    } as never);
    return existing;
  }
  return MaintenanceSchedule.create({
    id: randomUUID(),
    tenant_id: tenantId,
    truck_id: data.truck_id,
    tipo: data.tipo,
    intervalo_km: data.intervalo_km ?? null,
    ultimo_km: data.ultimo_km ?? 0,
    ultima_fecha: data.ultima_fecha ?? null,
    activo: true,
  } as never);
}

export async function deleteSchedule(tenantId: string, truckId: string, tipo: MaintenanceType) {
  const schedule = await MaintenanceSchedule.findOne({
    where: { tenant_id: tenantId, truck_id: truckId, tipo, activo: true },
  });
  if (!schedule) {
    const err = new Error("Programación no encontrada");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }
  await schedule.update({ activo: false } as never);
}

export async function listRecords(tenantId: string, truckId?: string) {
  const where: Record<string, unknown> = { tenant_id: tenantId };
  if (truckId) where.truck_id = truckId;
  return MaintenanceRecord.findAll({
    where,
    order: [["fecha", "DESC"], ["km_odometro", "DESC"]],
  });
}

export async function createRecord(
  tenantId: string,
  data: {
    truck_id: string;
    tipo: MaintenanceType;
    km_odometro: number;
    fecha: string;
    costo: number;
    descripcion: string;
    taller?: string;
  },
) {
  const truck = await Truck.findOne({ where: { id: data.truck_id, tenant_id: tenantId } });
  if (!truck) {
    const err = new Error("Camión no encontrado");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }
  const record = await MaintenanceRecord.create({
    id: randomUUID(),
    tenant_id: tenantId,
    ...data,
  } as never);

  const schedule = await MaintenanceSchedule.findOne({
    where: { tenant_id: tenantId, truck_id: data.truck_id, tipo: data.tipo },
  });
  if (schedule) {
    await schedule.update({ ultimo_km: data.km_odometro, ultima_fecha: data.fecha } as never);
  }

  return record;
}

export async function checkMaintenanceAlerts(tenantId: string) {
  const schedules = await MaintenanceSchedule.findAll({
    where: { tenant_id: tenantId, activo: true, tipo: { [Op.ne]: "correctivo" } },
  });
  const alerts: { truck_id: string; tipo: MaintenanceType; km_actual: number; km_proximo: number }[] = [];

  const [pending, users, trucks] = await Promise.all([
    Notification.findAll({
      where: { tenant_id: tenantId, tipo: "mantenimiento_km", leida: false },
    }),
    usersWithPermission(tenantId, "notificaciones.ver"),
    Truck.findAll({
      where: { tenant_id: tenantId },
      attributes: ["id", "numero_economico"],
    }),
  ]);

  const truckLabel = new Map(trucks.map((t) => [t.id, t.numero_economico]));
  const pendingKeys = new Set<string>();
  for (const n of pending) {
    const p = n.payload as { truck_id?: unknown; tipo?: unknown };
    if (typeof p.truck_id === "string" && typeof p.tipo === "string") {
      pendingKeys.add(maintenancePendingKey(n.user_id, p.truck_id, p.tipo));
    }
  }

  const alertDate = new Date().toISOString().slice(0, 10);

  for (const s of schedules) {
    if (!s.intervalo_km || s.intervalo_km <= 0) continue;
    const kmActual = await getTruckOdometer(tenantId, s.truck_id);
    const kmProximo = s.ultimo_km + s.intervalo_km;
    if (kmActual >= kmProximo) {
      alerts.push({ truck_id: s.truck_id, tipo: s.tipo, km_actual: kmActual, km_proximo: kmProximo });
      if (users.length === 0) continue;

      const unitLabel = truckLabel.get(s.truck_id) ?? s.truck_id;
      const servicio = tipoLabel[s.tipo];
      const title = `Mantenimiento vencido: ${servicio}`;
      const body = `${unitLabel} — odómetro ${kmActual} km (programado a ${kmProximo} km)`;

      for (const u of users) {
        const key = maintenancePendingKey(u.id, s.truck_id, s.tipo);
        if (pendingKeys.has(key)) continue;

        await Notification.create({
          id: randomUUID(),
          tenant_id: tenantId,
          user_id: u.id,
          tipo: "mantenimiento_km",
          document_id: null,
          payload: {
            truck_id: s.truck_id,
            tipo: s.tipo,
            km_actual: kmActual,
            km_proximo: kmProximo,
            title,
            body,
            url: "/mantenimiento",
          },
          alert_date: alertDate,
          leida: false,
        } as never);
        pendingKeys.add(key);
      }
    }
  }
  return alerts;
}

export async function maintenanceOverview(tenantId: string): Promise<
  {
    truck_id: string;
    numero_economico: string;
    placas: string;
    km_actual: number;
    proximos: { tipo: MaintenanceType; km_proximo: number; km_restantes: number; vencido: boolean }[];
    ultimos_registros: { id: string; tipo: MaintenanceType; fecha: string; km_odometro: number; descripcion: string }[];
  }[]
> {
  const trucks = await Truck.findAll({
    where: { tenant_id: tenantId, estatus: { [Op.ne]: "baja" } },
    order: [["numero_economico", "ASC"]],
  });
  const schedules = await listSchedules(tenantId);
  const records = await listRecords(tenantId);

  return Promise.all(
    trucks.map(async (truck) => {
      const km_actual = await getTruckOdometer(tenantId, truck.id);
      const truckSchedules = schedules.filter((s) => s.truck_id === truck.id);
      const proximos = truckSchedules
        .filter((s) => s.tipo !== "correctivo" && s.intervalo_km)
        .map((s) => ({
          tipo: s.tipo,
          km_proximo: s.ultimo_km + (s.intervalo_km ?? 0),
          km_restantes: Math.max(0, s.ultimo_km + (s.intervalo_km ?? 0) - km_actual),
          vencido: km_actual >= s.ultimo_km + (s.intervalo_km ?? 0),
        }));
      return {
        truck_id: truck.id,
        numero_economico: truck.numero_economico,
        placas: truck.placas,
        km_actual,
        proximos,
        ultimos_registros: records
          .filter((r) => r.truck_id === truck.id)
          .slice(0, 5)
          .map((r) => ({
            id: r.id,
            tipo: r.tipo,
            fecha: r.fecha,
            km_odometro: r.km_odometro,
            descripcion: r.descripcion,
          })),
      };
    }),
  );
}
