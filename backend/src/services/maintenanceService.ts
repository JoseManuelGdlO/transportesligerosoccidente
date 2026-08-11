import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Op } from "sequelize";
import {
  MaintenanceSchedule,
  MaintenanceRecord,
  Trip,
  FuelTicket,
  Truck,
  Notification,
  Supplier,
  MaintenanceCategory,
} from "../models";
import type { MaintenanceType } from "../models/MaintenanceSchedule";
import { num } from "../utils/numbers";
import { usersWithPermission } from "../utils/notifyUsers";
import { getClosedStatusIds } from "./tripStatusService";
import { uploadRootDir } from "../middlewares/uploadDocument";

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
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateIso).trim());
  if (!m) return dateIso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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

/** Registros de mantenimiento en rango con campos para reportes. */
export async function listRecordsInRangeFull(tenantId: string, desde: string, hasta: string) {
  return MaintenanceRecord.findAll({
    where: {
      tenant_id: tenantId,
      fecha: { [Op.gte]: desde, [Op.lte]: hasta },
    },
    attributes: [
      "id",
      "truck_id",
      "supplier_id",
      "taller",
      "tipo",
      "fecha",
      "costo",
      "descripcion",
      "category_id",
      "km_odometro",
    ],
    order: [["fecha", "ASC"], ["km_odometro", "ASC"]],
  });
}

export type MaintenanceReportSummary = {
  periodo: { desde: string; hasta: string };
  totales: { registros: number; costo: number };
  by_truck: {
    truck_id: string;
    numero_economico: string;
    placas: string;
    registros: number;
    costo: number;
  }[];
  by_supplier: {
    supplier_id: string | null;
    nombre: string;
    registros: number;
    costo: number;
  }[];
  by_time: { fecha: string; registros: number; costo: number }[];
  timeline: {
    id: string;
    fecha: string;
    truck_id: string;
    numero_economico: string;
    placas: string;
    supplier_id: string | null;
    proveedor: string;
    tipo: MaintenanceType;
    costo: number;
    descripcion: string;
    km_odometro: number;
  }[];
};

function supplierAggKey(supplierId: string | null | undefined, taller: string | null | undefined): string {
  if (supplierId) return `s:${supplierId}`;
  const t = (taller ?? "").trim();
  if (t) return `t:${t.toLowerCase()}`;
  return "none";
}

function supplierAggNombre(
  supplierId: string | null | undefined,
  taller: string | null | undefined,
  supplierNames: Map<string, string>,
): string {
  if (supplierId) {
    return supplierNames.get(supplierId) || (taller ?? "").trim() || "Sin proveedor";
  }
  const t = (taller ?? "").trim();
  return t || "Sin proveedor";
}

/** Resumen de reportes de mantenimiento para un rango de fechas. */
export async function maintenanceReportSummary(
  tenantId: string,
  desde: string,
  hasta: string,
): Promise<MaintenanceReportSummary> {
  const records = await listRecordsInRangeFull(tenantId, desde, hasta);
  const truckIds = [...new Set(records.map((r) => r.truck_id))];
  const supplierIds = [
    ...new Set(records.map((r) => r.supplier_id).filter((id): id is string => Boolean(id))),
  ];

  const [trucks, suppliers] = await Promise.all([
    truckIds.length
      ? Truck.findAll({
          where: { tenant_id: tenantId, id: truckIds },
          attributes: ["id", "numero_economico", "placas"],
        })
      : Promise.resolve([]),
    supplierIds.length
      ? Supplier.findAll({
          where: { tenant_id: tenantId, id: supplierIds },
          attributes: ["id", "razon_social"],
        })
      : Promise.resolve([]),
  ]);

  const truckMap = new Map(trucks.map((t) => [t.id, t]));
  const supplierNames = new Map(suppliers.map((s) => [s.id, s.razon_social]));

  let totalCosto = 0;
  const byTruck = new Map<string, { registros: number; costo: number }>();
  const bySupplier = new Map<
    string,
    { supplier_id: string | null; nombre: string; registros: number; costo: number }
  >();
  const byTime = new Map<string, { registros: number; costo: number }>();

  for (const r of records) {
    const costo = num(r.costo);
    const fecha = String(r.fecha).slice(0, 10);
    totalCosto += costo;

    const truckAgg = byTruck.get(r.truck_id) ?? { registros: 0, costo: 0 };
    truckAgg.registros += 1;
    truckAgg.costo += costo;
    byTruck.set(r.truck_id, truckAgg);

    const sKey = supplierAggKey(r.supplier_id, r.taller);
    const existing = bySupplier.get(sKey);
    if (existing) {
      existing.registros += 1;
      existing.costo += costo;
    } else {
      bySupplier.set(sKey, {
        supplier_id: r.supplier_id ?? null,
        nombre: supplierAggNombre(r.supplier_id, r.taller, supplierNames),
        registros: 1,
        costo,
      });
    }

    const day = byTime.get(fecha) ?? { registros: 0, costo: 0 };
    day.registros += 1;
    day.costo += costo;
    byTime.set(fecha, day);
  }

  const by_truck = [...byTruck.entries()]
    .map(([truck_id, agg]) => {
      const truck = truckMap.get(truck_id);
      return {
        truck_id,
        numero_economico: truck?.numero_economico ?? truck_id,
        placas: truck?.placas ?? "",
        registros: agg.registros,
        costo: agg.costo,
      };
    })
    .sort((a, b) => b.costo - a.costo || a.numero_economico.localeCompare(b.numero_economico));

  const by_supplier = [...bySupplier.values()].sort(
    (a, b) => b.costo - a.costo || a.nombre.localeCompare(b.nombre),
  );

  const by_time = [...byTime.entries()]
    .map(([fecha, agg]) => ({ fecha, registros: agg.registros, costo: agg.costo }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  const timeline = [...records]
    .sort((a, b) => {
      const fa = String(a.fecha).slice(0, 10);
      const fb = String(b.fecha).slice(0, 10);
      if (fa !== fb) return fa.localeCompare(fb);
      return (a.km_odometro ?? 0) - (b.km_odometro ?? 0);
    })
    .map((r) => {
      const truck = truckMap.get(r.truck_id);
      return {
        id: r.id,
        fecha: String(r.fecha).slice(0, 10),
        truck_id: r.truck_id,
        numero_economico: truck?.numero_economico ?? r.truck_id,
        placas: truck?.placas ?? "",
        supplier_id: r.supplier_id ?? null,
        proveedor: supplierAggNombre(r.supplier_id, r.taller, supplierNames),
        tipo: r.tipo,
        costo: num(r.costo),
        descripcion: r.descripcion,
        km_odometro: r.km_odometro,
      };
    });

  return {
    periodo: { desde, hasta },
    totales: { registros: records.length, costo: totalCosto },
    by_truck,
    by_supplier,
    by_time,
    timeline,
  };
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

export async function getRecordOrThrow(tenantId: string, id: string) {
  const record = await MaintenanceRecord.findOne({ where: { id, tenant_id: tenantId } });
  if (!record) {
    const err = new Error("Registro de mantenimiento no encontrado");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }
  return record;
}

function unlinkFacturaIfExists(relPath: string | null | undefined) {
  if (!relPath) return;
  const abs = path.isAbsolute(relPath) ? relPath : path.join(uploadRootDir(), relPath);
  try {
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
  } catch {
    /* ignore */
  }
}

export async function setRecordFactura(
  tenantId: string,
  recordId: string,
  file: { path: string; originalname: string; mimetype: string },
) {
  const record = await getRecordOrThrow(tenantId, recordId);
  unlinkFacturaIfExists(record.factura_path);
  const absPath = file.path;
  const rel = path.relative(uploadRootDir(), absPath).replace(/\\/g, "/");
  await record.update({
    factura_path: rel,
    factura_nombre: file.originalname.slice(0, 255),
    factura_mime: file.mimetype.slice(0, 100),
  } as never);
  return record;
}

export async function clearRecordFactura(tenantId: string, recordId: string) {
  const record = await getRecordOrThrow(tenantId, recordId);
  unlinkFacturaIfExists(record.factura_path);
  await record.update({
    factura_path: null,
    factura_nombre: null,
    factura_mime: null,
  } as never);
  return record;
}

export function resolveFacturaAbsolutePath(record: MaintenanceRecord): string | null {
  if (!record.factura_path) return null;
  return path.isAbsolute(record.factura_path)
    ? record.factura_path
    : path.join(uploadRootDir(), record.factura_path);
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
    supplier_id?: string | null;
    category_id?: string | null;
  },
) {
  const truck = await Truck.findOne({ where: { id: data.truck_id, tenant_id: tenantId } });
  if (!truck) {
    const err = new Error("Camión no encontrado");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }

  let taller = data.taller?.trim() || undefined;
  let supplierId = data.supplier_id ?? null;
  if (supplierId) {
    const supplier = await Supplier.findOne({ where: { id: supplierId, tenant_id: tenantId } });
    if (!supplier) {
      const err = new Error("Proveedor no encontrado");
      (err as Error & { status?: number }).status = 404;
      throw err;
    }
    taller = supplier.razon_social;
  }

  let categoryId = data.category_id ?? null;
  if (categoryId) {
    const category = await MaintenanceCategory.findOne({
      where: { id: categoryId, tenant_id: tenantId },
    });
    if (!category) {
      const err = new Error("Categoría no encontrada");
      (err as Error & { status?: number }).status = 404;
      throw err;
    }
  }

  const record = await MaintenanceRecord.create({
    id: randomUUID(),
    tenant_id: tenantId,
    truck_id: data.truck_id,
    tipo: data.tipo,
    km_odometro: data.km_odometro,
    fecha: data.fecha,
    costo: data.costo,
    descripcion: data.descripcion,
    taller: taller ?? null,
    supplier_id: supplierId,
    category_id: categoryId,
  } as never);

  const schedule = await MaintenanceSchedule.findOne({
    where: { tenant_id: tenantId, truck_id: data.truck_id, tipo: data.tipo },
  });
  if (schedule) {
    await schedule.update({ ultimo_km: data.km_odometro, ultima_fecha: data.fecha } as never);
  }

  try {
    const { upsertFromMaintenance } = await import("./accountDocumentService");
    await upsertFromMaintenance(record);
  } catch (syncErr) {
    console.warn(
      "[maintenance] Registro creado pero falló sync de documento CXP:",
      syncErr instanceof Error ? syncErr.message : syncErr,
    );
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
