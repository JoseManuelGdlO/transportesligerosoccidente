import { z } from "zod";
import type { Request, Response } from "express";
import { Trip, Truck, Driver, Client } from "../models";
import { asyncHandler } from "../utils/asyncHandler";
import { computeTrip } from "../services/calc";

const querySchema = z.object({
  desde: z.string().optional(),
  hasta: z.string().optional(),
});

function inRange(iso: string, desde?: string, hasta?: string): boolean {
  const d = new Date(iso);
  if (desde && d < new Date(`${desde}T00:00:00`)) return false;
  if (hasta && d > new Date(`${hasta}T23:59:59`)) return false;
  return true;
}

export const getAggregates = asyncHandler(async (req: Request, res: Response) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const desde = parsed.data.desde;
  const hasta = parsed.data.hasta;
  const tenantId = req.user!.tenantId;

  const [trips, trucks, drivers, clients] = await Promise.all([
    Trip.findAll({
      where: { tenant_id: tenantId },
      include: [
        { association: "fuel" },
        { association: "expenses" },
        { model: Driver, attributes: ["id", "nombre", "comision_tipo", "comision_valor"] },
      ],
    }),
    Truck.findAll({ where: { tenant_id: tenantId } }),
    Driver.findAll({ where: { tenant_id: tenantId } }),
    Client.findAll({ where: { tenant_id: tenantId } }),
  ]);

  const closed = trips.filter((t) => {
    if (t.estatus !== "cerrado") return false;
    const fs = t.fecha_salida instanceof Date ? t.fecha_salida.toISOString() : String(t.fecha_salida);
    return inRange(fs, desde, hasta);
  });

  const driverById = (id: string) => drivers.find((d) => d.id === id);

  const byTruck = trucks.map((tk) => {
    const ts = closed.filter((t) => t.truck_id === tk.id);
    let ingreso = 0;
    let utilidad = 0;
    let km = 0;
    for (const t of ts) {
      const f = computeTrip(t, driverById(t.driver_id) ?? null);
      ingreso += f.ingreso;
      utilidad += f.utilidad;
      km += f.km_recorridos;
    }
    return {
      truck_id: tk.id,
      numero_economico: tk.numero_economico,
      viajes: ts.length,
      ingreso,
      utilidad,
      km,
      margen: ingreso > 0 ? (utilidad / ingreso) * 100 : 0,
    };
  });

  const byDriver = drivers.map((d) => {
    const ts = closed.filter((t) => t.driver_id === d.id);
    let ingreso = 0;
    let utilidad = 0;
    let comision = 0;
    for (const t of ts) {
      const f = computeTrip(t, d);
      ingreso += f.ingreso;
      utilidad += f.utilidad;
      comision += f.comision;
    }
    return {
      driver_id: d.id,
      nombre: d.nombre,
      viajes: ts.length,
      ingreso,
      utilidad,
      comision,
      margen: ingreso > 0 ? (utilidad / ingreso) * 100 : 0,
    };
  });

  const byClient = clients.map((c) => {
    const ts = closed.filter((t) => t.client_id === c.id);
    let ingreso = 0;
    let utilidad = 0;
    for (const t of ts) {
      const f = computeTrip(t, driverById(t.driver_id) ?? null);
      ingreso += f.ingreso;
      utilidad += f.utilidad;
    }
    return {
      client_id: c.id,
      razon_social: c.razon_social,
      viajes: ts.length,
      ingreso,
      utilidad,
      margen: ingreso > 0 ? (utilidad / ingreso) * 100 : 0,
    };
  });

  res.json({
    filtros: { desde: desde ?? null, hasta: hasta ?? null },
    by_truck: byTruck.sort((a, b) => b.utilidad - a.utilidad),
    by_driver: byDriver.sort((a, b) => b.utilidad - a.utilidad),
    by_client: byClient.sort((a, b) => b.utilidad - a.utilidad),
  });
});
