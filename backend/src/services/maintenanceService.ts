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
import { num } from "../utils/numbers";
import { usersWithPermission } from "../utils/notifyUsers";
import { getClosedStatusIds } from "./tripStatusService";

const tipoLabel: Record<MaintenanceType, string> = {
  preventivo: "Preventivo",
  menor: "Menor",
  intermedio: "Intermedio",
  mayor: "Mayor",
  correctivo: "Correctivo",
};

function maintenancePendingKey(userId: string, truckId: string, tipo: string, criterion: string): string {
  return `${userId}:${truckId}:${tipo}:${criterion}`;
}

function addDays(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T12:00:00`).getTime();
  const to = new Date(`${toIso}T12:00:00`).getTime();
  return Math.floor((to - from) / (24 * 60 * 60 * 1000));
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
      attributes: ["km_final", "fecha_llegada"],
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
    intervalo_dias?: number | null;
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
      intervalo_dias: data.intervalo_dias ?? null,
      ultimo_km: data.ultimo_km ?? existing.ultimo_km,
      ultima_fecha: data.ultima_fecha !== undefined ? data.ultima_fecha : existing.ultima_fecha,
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
    intervalo_dias: data.intervalo_dias ?? null,
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

/** Suma costos de mantenimiento por camión en un rango de fechas (inclusive). */
export function aggregateMaintenanceCostByTruck(
  records: { truck_id: string; fecha: string; costo: unknown }[],
  desde?: string,
  hasta?: string,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of records) {
    const fecha = String(r.fecha).slice(0, 10);
    if (desde && fecha < desde) continue;
    if (hasta && fecha > hasta) continue;
    map.set(r.truck_id, (map.get(r.truck_id) ?? 0) + num(r.costo));
  }
  return map;
}

/** Suma costos de mantenimiento por mes (YYYY-MM) y camión. */
export function aggregateMaintenanceCostByMonthTruck(
  records: { truck_id: string; fecha: string; costo: unknown }[],
  desde?: string,
  hasta?: string,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of records) {
    const fecha = String(r.fecha).slice(0, 10);
    if (desde && fecha < desde) continue;
    if (hasta && fecha > hasta) continue;
    const month = fecha.slice(0, 7);
    const key = `${month}|||${r.truck_id}`;
    map.set(key, (map.get(key) ?? 0) + num(r.costo));
  }
  return map;
}

export async function listRecordsInRange(tenantId: string, desde?: string, hasta?: string) {
  const where: Record<string, unknown> = { tenant_id: tenantId };
  if (desde || hasta) {
    where.fecha = {
      ...(desde ? { [Op.gte]: desde } : {}),
      ...(hasta ? { [Op.lte]: hasta } : {}),
    };
  }
  return MaintenanceRecord.findAll({
    where,
    attributes: ["truck_id", "fecha", "costo"],
    order: [["fecha", "ASC"]],
  });
}

export async function maintenanceCostByTruck(
  tenantId: string,
  desde?: string,
  hasta?: string,
): Promise<Map<string, number>> {
  const records = await listRecordsInRange(tenantId, desde, hasta);
  return aggregateMaintenanceCostByTruck(records, desde, hasta);
}

export async function maintenanceCostByMonthTruck(
  tenantId: string,
  desde?: string,
  hasta?: string,
): Promise<Map<string, number>> {
  const records = await listRecordsInRange(tenantId, desde, hasta);
  return aggregateMaintenanceCostByMonthTruck(records, desde, hasta);
}

/** Una sola consulta: costos por camión y por mes×camión. */
export async function maintenanceCostMaps(
  tenantId: string,
  desde?: string,
  hasta?: string,
): Promise<{ byTruck: Map<string, number>; byMonthTruck: Map<string, number> }> {
  const records = await listRecordsInRange(tenantId, desde, hasta);
  return {
    byTruck: aggregateMaintenanceCostByTruck(records, desde, hasta),
    byMonthTruck: aggregateMaintenanceCostByMonthTruck(records, desde, hasta),
  };
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
  const alerts: {
    truck_id: string;
    tipo: MaintenanceType;
    criterion: "km" | "tiempo";
    km_actual?: number;
    km_proximo?: number;
    fecha_proxima?: string;
  }[] = [];

  const [pending, users, trucks] = await Promise.all([
    Notification.findAll({
      where: {
        tenant_id: tenantId,
        tipo: { [Op.in]: ["mantenimiento_km", "mantenimiento_tiempo"] },
        leida: false,
      },
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
    const criterion = n.tipo === "mantenimiento_tiempo" ? "tiempo" : "km";
    if (typeof p.truck_id === "string" && typeof p.tipo === "string") {
      pendingKeys.add(maintenancePendingKey(n.user_id, p.truck_id, p.tipo, criterion));
    }
  }

  const alertDate = new Date().toISOString().slice(0, 10);

  for (const s of schedules) {
    const unitLabel = truckLabel.get(s.truck_id) ?? s.truck_id;
    const servicio = tipoLabel[s.tipo];

    if (s.intervalo_km && s.intervalo_km > 0) {
      const kmActual = await getTruckOdometer(tenantId, s.truck_id);
      const kmProximo = s.ultimo_km + s.intervalo_km;
      if (kmActual >= kmProximo) {
        alerts.push({
          truck_id: s.truck_id,
          tipo: s.tipo,
          criterion: "km",
          km_actual: kmActual,
          km_proximo: kmProximo,
        });
        if (users.length > 0) {
          const title = `Mantenimiento vencido por km: ${servicio}`;
          const body = `${unitLabel} — odómetro ${kmActual} km (programado a ${kmProximo} km)`;
          for (const u of users) {
            const key = maintenancePendingKey(u.id, s.truck_id, s.tipo, "km");
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
    }

    if (s.intervalo_dias && s.intervalo_dias > 0 && s.ultima_fecha) {
      const fechaProxima = addDays(s.ultima_fecha, s.intervalo_dias);
      if (alertDate >= fechaProxima) {
        alerts.push({
          truck_id: s.truck_id,
          tipo: s.tipo,
          criterion: "tiempo",
          fecha_proxima: fechaProxima,
        });
        if (users.length > 0) {
          const title = `Mantenimiento vencido por tiempo: ${servicio}`;
          const body = `${unitLabel} — programado para ${fechaProxima} (cada ${s.intervalo_dias} días)`;
          for (const u of users) {
            const key = maintenancePendingKey(u.id, s.truck_id, s.tipo, "tiempo");
            if (pendingKeys.has(key)) continue;
            await Notification.create({
              id: randomUUID(),
              tenant_id: tenantId,
              user_id: u.id,
              tipo: "mantenimiento_tiempo",
              document_id: null,
              payload: {
                truck_id: s.truck_id,
                tipo: s.tipo,
                fecha_proxima: fechaProxima,
                intervalo_dias: s.intervalo_dias,
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
    proximos: {
      tipo: MaintenanceType;
      km_proximo: number | null;
      km_restantes: number | null;
      fecha_proxima: string | null;
      dias_restantes: number | null;
      vencido: boolean;
      vencido_km: boolean;
      vencido_tiempo: boolean;
    }[];
    ultimos_registros: { id: string; tipo: MaintenanceType; fecha: string; km_odometro: number; descripcion: string }[];
  }[]
> {
  const trucks = await Truck.findAll({
    where: { tenant_id: tenantId, estatus: { [Op.ne]: "baja" } },
    order: [["numero_economico", "ASC"]],
  });
  const schedules = await listSchedules(tenantId);
  const records = await listRecords(tenantId);
  const hoy = new Date().toISOString().slice(0, 10);

  return Promise.all(
    trucks.map(async (truck) => {
      const km_actual = await getTruckOdometer(tenantId, truck.id);
      const truckSchedules = schedules.filter((s) => s.truck_id === truck.id);
      const proximos = truckSchedules
        .filter((s) => s.tipo !== "correctivo" && (s.intervalo_km || s.intervalo_dias))
        .map((s) => {
          const hasKm = !!(s.intervalo_km && s.intervalo_km > 0);
          const hasDias = !!(s.intervalo_dias && s.intervalo_dias > 0 && s.ultima_fecha);
          const km_proximo = hasKm ? s.ultimo_km + (s.intervalo_km ?? 0) : null;
          const km_restantes = km_proximo != null ? Math.max(0, km_proximo - km_actual) : null;
          const vencido_km = km_proximo != null && km_actual >= km_proximo;
          const fecha_proxima = hasDias ? addDays(s.ultima_fecha!, s.intervalo_dias!) : null;
          const dias_restantes =
            fecha_proxima != null ? Math.max(0, daysBetween(hoy, fecha_proxima)) : null;
          const vencido_tiempo = fecha_proxima != null && hoy >= fecha_proxima;
          return {
            tipo: s.tipo,
            km_proximo,
            km_restantes,
            fecha_proxima,
            dias_restantes,
            vencido: vencido_km || vencido_tiempo,
            vencido_km,
            vencido_tiempo,
          };
        });
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
