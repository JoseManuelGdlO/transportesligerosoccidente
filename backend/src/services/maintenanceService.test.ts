import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { Op } from "sequelize";
import {
  MaintenanceSchedule,
  Notification,
  Truck,
  TripStatus,
  FuelTicket,
  User,
} from "../models";
import { checkMaintenanceAlerts } from "./maintenanceService";

const tenantId = "tenant-1";
const truckId = "truck-1";

const hoy = () => new Date().toISOString().slice(0, 10);

function isoDaysFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

type ScheduleStub = {
  truck_id: string;
  tipo: string;
  intervalo_km: number | null;
  intervalo_dias: number | null;
  ultimo_km: number;
  ultima_fecha: string | null;
};

function schedule(overrides: Partial<ScheduleStub> = {}): ScheduleStub {
  return {
    truck_id: truckId,
    tipo: "preventivo",
    intervalo_km: null,
    intervalo_dias: null,
    ultimo_km: 0,
    ultima_fecha: null,
    ...overrides,
  };
}

const mockUser = { id: "user-1" };

/**
 * Prepara los mocks comunes de checkMaintenanceAlerts.
 * El odómetro se simula solo con FuelTicket (TripStatus.findAll vacío
 * evita la consulta de viajes cerrados).
 */
function setup(opts: {
  schedules: ScheduleStub[];
  odometro?: number;
  pending?: { user_id: string; tipo: string; payload: Record<string, unknown> }[];
  users?: { id: string }[];
}) {
  const scheduleFindAll = mock.method(
    MaintenanceSchedule,
    "findAll",
    async () => opts.schedules as never,
  );
  const notificationFindAll = mock.method(
    Notification,
    "findAll",
    async () => (opts.pending ?? []) as never,
  );
  const userFindAll = mock.method(User, "findAll", async () => (opts.users ?? [mockUser]) as never);
  const truckFindAll = mock.method(
    Truck,
    "findAll",
    async () => [{ id: truckId, numero_economico: "TLO-01" }] as never,
  );
  const tripStatusFindAll = mock.method(TripStatus, "findAll", async () => [] as never);
  const fuelFindOne = mock.method(
    FuelTicket,
    "findOne",
    async () => ({ odometro: opts.odometro ?? 0 }) as never,
  );
  const notificationCreate = mock.method(
    Notification,
    "create",
    async (data: unknown) => data as never,
  );
  return { scheduleFindAll, notificationCreate };
}

describe("checkMaintenanceAlerts", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("genera alerta y notificación por km cuando el odómetro alcanza el próximo servicio", async () => {
    const { notificationCreate } = setup({
      schedules: [schedule({ tipo: "menor", intervalo_km: 10000, ultimo_km: 40000 })],
      odometro: 50000,
    });

    const alerts = await checkMaintenanceAlerts(tenantId);

    assert.equal(alerts.length, 1);
    assert.deepEqual(alerts[0], {
      truck_id: truckId,
      tipo: "menor",
      criterion: "km",
      km_actual: 50000,
      km_proximo: 50000,
    });

    assert.equal(notificationCreate.mock.callCount(), 1);
    const created = notificationCreate.mock.calls[0].arguments[0] as Record<string, unknown>;
    assert.equal(created.tipo, "mantenimiento_km");
    assert.equal(created.tenant_id, tenantId);
    assert.equal(created.user_id, mockUser.id);
    const payload = created.payload as Record<string, unknown>;
    assert.equal(payload.truck_id, truckId);
    assert.equal(payload.km_proximo, 50000);
  });

  it("no genera alerta por km cuando aún falta kilometraje", async () => {
    const { notificationCreate } = setup({
      schedules: [schedule({ tipo: "menor", intervalo_km: 10000, ultimo_km: 40000 })],
      odometro: 49999,
    });

    const alerts = await checkMaintenanceAlerts(tenantId);

    assert.equal(alerts.length, 0);
    assert.equal(notificationCreate.mock.callCount(), 0);
  });

  it("genera alerta y notificación por tiempo cuando la fecha programada ya venció", async () => {
    const { notificationCreate } = setup({
      schedules: [
        schedule({ tipo: "mayor", intervalo_dias: 30, ultima_fecha: isoDaysFromToday(-31) }),
      ],
    });

    const alerts = await checkMaintenanceAlerts(tenantId);

    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].tipo, "mayor");
    assert.equal(alerts[0].criterion, "tiempo");
    assert.ok(alerts[0].fecha_proxima && alerts[0].fecha_proxima <= hoy());

    assert.equal(notificationCreate.mock.callCount(), 1);
    const created = notificationCreate.mock.calls[0].arguments[0] as Record<string, unknown>;
    assert.equal(created.tipo, "mantenimiento_tiempo");
  });

  it("no genera alerta por tiempo antes de la fecha programada", async () => {
    const { notificationCreate } = setup({
      schedules: [
        schedule({ tipo: "mayor", intervalo_dias: 30, ultima_fecha: isoDaysFromToday(-5) }),
      ],
    });

    const alerts = await checkMaintenanceAlerts(tenantId);

    assert.equal(alerts.length, 0);
    assert.equal(notificationCreate.mock.callCount(), 0);
  });

  it("genera ambas alertas cuando vencen los criterios de km y tiempo a la vez", async () => {
    const { notificationCreate } = setup({
      schedules: [
        schedule({
          tipo: "preventivo",
          intervalo_km: 5000,
          ultimo_km: 10000,
          intervalo_dias: 90,
          ultima_fecha: isoDaysFromToday(-120),
        }),
      ],
      odometro: 16000,
    });

    const alerts = await checkMaintenanceAlerts(tenantId);

    assert.equal(alerts.length, 2);
    assert.deepEqual(
      alerts.map((a) => a.criterion).sort(),
      ["km", "tiempo"],
    );
    assert.equal(notificationCreate.mock.callCount(), 2);
    const tipos = notificationCreate.mock.calls
      .map((c) => (c.arguments[0] as Record<string, unknown>).tipo)
      .sort();
    assert.deepEqual(tipos, ["mantenimiento_km", "mantenimiento_tiempo"]);
  });

  it("no duplica la notificación si ya existe una pendiente sin leer del mismo criterio", async () => {
    const { notificationCreate } = setup({
      schedules: [schedule({ tipo: "menor", intervalo_km: 10000, ultimo_km: 40000 })],
      odometro: 55000,
      pending: [
        {
          user_id: mockUser.id,
          tipo: "mantenimiento_km",
          payload: { truck_id: truckId, tipo: "menor" },
        },
      ],
    });

    const alerts = await checkMaintenanceAlerts(tenantId);

    // La alerta se reporta pero no se crea otra notificación
    assert.equal(alerts.length, 1);
    assert.equal(notificationCreate.mock.callCount(), 0);
  });

  it("una notificación pendiente por km no bloquea la alerta por tiempo del mismo servicio", async () => {
    const { notificationCreate } = setup({
      schedules: [
        schedule({
          tipo: "preventivo",
          intervalo_km: 5000,
          ultimo_km: 10000,
          intervalo_dias: 30,
          ultima_fecha: isoDaysFromToday(-60),
        }),
      ],
      odometro: 16000,
      pending: [
        {
          user_id: mockUser.id,
          tipo: "mantenimiento_km",
          payload: { truck_id: truckId, tipo: "preventivo" },
        },
      ],
    });

    const alerts = await checkMaintenanceAlerts(tenantId);

    assert.equal(alerts.length, 2);
    assert.equal(notificationCreate.mock.callCount(), 1);
    const created = notificationCreate.mock.calls[0].arguments[0] as Record<string, unknown>;
    assert.equal(created.tipo, "mantenimiento_tiempo");
  });

  it("reporta la alerta sin crear notificaciones cuando no hay usuarios con permiso", async () => {
    const { notificationCreate } = setup({
      schedules: [schedule({ tipo: "intermedio", intervalo_km: 10000, ultimo_km: 0 })],
      odometro: 12000,
      users: [],
    });

    const alerts = await checkMaintenanceAlerts(tenantId);

    assert.equal(alerts.length, 1);
    assert.equal(notificationCreate.mock.callCount(), 0);
  });

  it("excluye las programaciones de tipo correctivo de la consulta", async () => {
    const { scheduleFindAll } = setup({ schedules: [] });

    await checkMaintenanceAlerts(tenantId);

    const where = (
      scheduleFindAll.mock.calls[0].arguments[0] as { where: Record<string, unknown> }
    ).where;
    assert.deepEqual(where.tipo, { [Op.ne]: "correctivo" });
  });

  it("ignora programaciones sin intervalos configurados", async () => {
    const { notificationCreate } = setup({
      schedules: [schedule({ tipo: "menor", intervalo_km: null, intervalo_dias: null })],
      odometro: 999999,
    });

    const alerts = await checkMaintenanceAlerts(tenantId);

    assert.equal(alerts.length, 0);
    assert.equal(notificationCreate.mock.callCount(), 0);
  });
});
