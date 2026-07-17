import { randomUUID } from "node:crypto";
import { Op, type Transaction } from "sequelize";
import {
  sequelize,
  Driver,
  DriverAccount,
  DriverAccountItem,
  DriverAccountMovement,
} from "../models";
import {
  previewAccountInstallments,
  roundMoney,
  type AccountApplication,
  type AccountItemBalance,
} from "./calc";
import { num } from "../utils/numbers";

export interface AccountMovementDto {
  id: string;
  tipo: "liquidacion" | "pago_directo" | string;
  monto: number;
  fecha: string;
  nota?: string;
  settlement_id?: string;
  saldo_despues: number;
  created_at?: string;
}

export interface AccountItemDto {
  id: string;
  tipo: "incidencia" | "prestamo" | string;
  concepto: string;
  monto_original: number;
  cuota_liquidacion: number;
  fecha: string;
  estatus: "activo" | "liquidado" | "cancelado" | string;
  abonado: number;
  saldo: number;
  movements: AccountMovementDto[];
  created_at?: string;
}

export interface DriverAccountSummaryDto {
  account_id: string;
  driver_id: string;
  saldo_total: number;
  total_abonado: number;
  total_original: number;
  adeudos_activos: number;
  items: AccountItemDto[];
}

function httpError(message: string, status: number) {
  const err = new Error(message) as Error & { status?: number };
  err.status = status;
  return err;
}

export async function assertDriver(tenantId: string, driverId: string) {
  const d = await Driver.findOne({ where: { id: driverId, tenant_id: tenantId } });
  if (!d) throw httpError("Operador no encontrado", 404);
  return d;
}

export async function getOrCreateDriverAccount(
  tenantId: string,
  driverId: string,
  t?: Transaction,
): Promise<DriverAccount> {
  const existing = await DriverAccount.findOne({
    where: { tenant_id: tenantId, driver_id: driverId },
    transaction: t,
    lock: t ? t.LOCK.UPDATE : undefined,
  });
  if (existing) return existing;
  return DriverAccount.create(
    {
      id: randomUUID(),
      tenant_id: tenantId,
      driver_id: driverId,
    } as never,
    { transaction: t },
  );
}

function paidTotal(movements: { monto: unknown }[]): number {
  return roundMoney(movements.reduce((a, m) => a + num(m.monto), 0));
}

export function itemBalance(
  item: DriverAccountItem,
  movements: { monto: unknown }[],
): number {
  return roundMoney(Math.max(0, num(item.monto_original) - paidTotal(movements)));
}

function toBalanceDto(
  item: DriverAccountItem,
  movements: { monto: unknown }[],
): AccountItemBalance {
  return {
    id: item.id,
    tipo: item.tipo,
    concepto: item.concepto,
    monto_original: num(item.monto_original),
    cuota_liquidacion: num(item.cuota_liquidacion),
    saldo: itemBalance(item, movements),
    fecha: String(item.fecha).slice(0, 10),
  };
}

export async function loadActiveAccountItemBalances(
  tenantId: string,
  driverId: string,
  opts?: { transaction?: Transaction; lock?: boolean },
): Promise<{ account: DriverAccount | null; items: AccountItemBalance[]; rows: DriverAccountItem[] }> {
  const t = opts?.transaction;
  const account = await DriverAccount.findOne({
    where: { tenant_id: tenantId, driver_id: driverId },
    transaction: t,
    lock: opts?.lock && t ? t.LOCK.UPDATE : undefined,
  });
  if (!account) return { account: null, items: [], rows: [] };

  const rows = await DriverAccountItem.findAll({
    where: { tenant_id: tenantId, driver_id: driverId, account_id: account.id, estatus: "activo" },
    include: [{ association: "movements" }],
    order: [
      ["fecha", "ASC"],
      ["created_at", "ASC"],
    ],
    transaction: t,
    lock: opts?.lock && t ? t.LOCK.UPDATE : undefined,
  });

  const items = rows
    .map((row) => {
      const movements = (row as DriverAccountItem & { movements?: DriverAccountMovement[] }).movements ?? [];
      return toBalanceDto(row, movements);
    })
    .filter((i) => i.saldo > 0);

  return { account, items, rows };
}

export async function getDriverAccountSummary(
  tenantId: string,
  driverId: string,
): Promise<DriverAccountSummaryDto> {
  await assertDriver(tenantId, driverId);
  const account = await getOrCreateDriverAccount(tenantId, driverId);

  const items = await DriverAccountItem.findAll({
    where: { tenant_id: tenantId, driver_id: driverId, account_id: account.id },
    include: [{ association: "movements" }],
    order: [
      ["fecha", "DESC"],
      ["created_at", "DESC"],
    ],
  });

  const mapped = items.map((item) => {
    const movements = (
      (item as DriverAccountItem & { movements?: DriverAccountMovement[] }).movements ?? []
    )
      .slice()
      .sort((a, b) => {
        const byFecha = String(a.fecha).localeCompare(String(b.fecha));
        if (byFecha !== 0) return byFecha;
        return a.createdAt.getTime() - b.createdAt.getTime();
      });

    let running = num(item.monto_original);
    const movementDtos = movements.map((m) => {
      const monto = num(m.monto);
      running = roundMoney(running - monto);
      return {
        id: m.id,
        tipo: m.tipo,
        monto,
        fecha: String(m.fecha).slice(0, 10),
        nota: m.nota ?? undefined,
        settlement_id: m.settlement_id ?? undefined,
        saldo_despues: Math.max(0, running),
        created_at: m.createdAt.toISOString(),
      };
    });

    const abonado = paidTotal(movements);
    const saldo = roundMoney(Math.max(0, num(item.monto_original) - abonado));

    return {
      id: item.id,
      tipo: item.tipo,
      concepto: item.concepto,
      monto_original: num(item.monto_original),
      cuota_liquidacion: num(item.cuota_liquidacion),
      fecha: String(item.fecha).slice(0, 10),
      estatus: item.estatus,
      abonado,
      saldo,
      movements: movementDtos,
      created_at: item.createdAt.toISOString(),
    };
  });

  const activos = mapped.filter((i) => i.estatus === "activo" && i.saldo > 0);
  const saldo_total = roundMoney(activos.reduce((a, i) => a + i.saldo, 0));
  const total_abonado = roundMoney(mapped.reduce((a, i) => a + i.abonado, 0));
  const total_original = roundMoney(mapped.reduce((a, i) => a + i.monto_original, 0));

  return {
    account_id: account.id,
    driver_id: driverId,
    saldo_total,
    total_abonado,
    total_original,
    adeudos_activos: activos.length,
    items: mapped,
  };
}

export async function createAccountItem(
  tenantId: string,
  driverId: string,
  data: {
    tipo: "incidencia" | "prestamo";
    concepto: string;
    monto_original: number;
    cuota_liquidacion: number;
    fecha: string;
  },
): Promise<AccountItemDto> {
  await assertDriver(tenantId, driverId);
  if (data.cuota_liquidacion > data.monto_original) {
    throw httpError("La cuota no puede ser mayor al importe original", 400);
  }

  return sequelize.transaction(async (t) => {
    const account = await getOrCreateDriverAccount(tenantId, driverId, t);
    const row = await DriverAccountItem.create(
      {
        id: randomUUID(),
        tenant_id: tenantId,
        account_id: account.id,
        driver_id: driverId,
        tipo: data.tipo,
        concepto: data.concepto.trim() || (data.tipo === "prestamo" ? "Préstamo" : "Incidencia"),
        monto_original: data.monto_original,
        cuota_liquidacion: data.cuota_liquidacion,
        fecha: data.fecha,
        estatus: "activo",
      } as never,
      { transaction: t },
    );

    return {
      id: row.id,
      tipo: row.tipo,
      concepto: row.concepto,
      monto_original: num(row.monto_original),
      cuota_liquidacion: num(row.cuota_liquidacion),
      fecha: String(row.fecha).slice(0, 10),
      estatus: row.estatus,
      abonado: 0,
      saldo: num(row.monto_original),
      movements: [],
    };
  });
}

export async function createDirectPayment(
  tenantId: string,
  driverId: string,
  itemId: string,
  data: { monto: number; fecha: string; nota?: string },
): Promise<{
  id: string;
  item_id: string;
  tipo: string;
  monto: number;
  fecha: string;
  nota?: string;
  saldo_despues: number;
}> {
  await assertDriver(tenantId, driverId);

  return sequelize.transaction(async (t) => {
    const item = await DriverAccountItem.findOne({
      where: { id: itemId, tenant_id: tenantId, driver_id: driverId, estatus: "activo" },
      include: [{ association: "movements" }],
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!item) throw httpError("Adeudo no encontrado o no activo", 404);

    const movements =
      (item as DriverAccountItem & { movements?: DriverAccountMovement[] }).movements ?? [];
    const saldo = itemBalance(item, movements);
    if (data.monto > saldo + 0.001) {
      throw httpError(`El abono excede el saldo pendiente (${saldo})`, 400);
    }

    const movement = await DriverAccountMovement.create(
      {
        id: randomUUID(),
        tenant_id: tenantId,
        account_id: item.account_id,
        item_id: item.id,
        driver_id: driverId,
        tipo: "pago_directo",
        monto: data.monto,
        fecha: data.fecha,
        nota: data.nota?.trim() || "Abono directo",
        settlement_id: null,
      } as never,
      { transaction: t },
    );

    const nuevoSaldo = roundMoney(saldo - data.monto);
    if (nuevoSaldo <= 0) {
      await item.update({ estatus: "liquidado" } as never, { transaction: t });
    }

    return {
      id: movement.id,
      item_id: item.id,
      tipo: movement.tipo,
      monto: num(movement.monto),
      fecha: String(movement.fecha).slice(0, 10),
      nota: movement.nota ?? undefined,
      saldo_despues: Math.max(0, nuevoSaldo),
    };
  });
}

export async function getAccountItemDetail(
  tenantId: string,
  driverId: string,
  itemId: string,
): Promise<AccountItemDto> {
  const summary = await getDriverAccountSummary(tenantId, driverId);
  const item = summary.items.find((i) => i.id === itemId);
  if (!item) throw httpError("Adeudo no encontrado", 404);
  return item;
}

export async function cancelAccountItem(
  tenantId: string,
  driverId: string,
  itemId: string,
): Promise<{ id: string; estatus: "cancelado" }> {
  await assertDriver(tenantId, driverId);
  const item = await DriverAccountItem.findOne({
    where: { id: itemId, tenant_id: tenantId, driver_id: driverId },
    include: [{ association: "movements" }],
  });
  if (!item) throw httpError("Adeudo no encontrado", 404);
  if (item.estatus === "cancelado") throw httpError("El adeudo ya está cancelado", 400);
  const movements =
    (item as DriverAccountItem & { movements?: DriverAccountMovement[] }).movements ?? [];
  if (movements.length > 0) {
    throw httpError("No se puede cancelar un adeudo con abonos registrados", 400);
  }
  await item.update({ estatus: "cancelado" } as never);
  return { id: item.id, estatus: "cancelado" as const };
}

/** Previsualiza cuotas a aplicar sobre un neto base (sin cuenta). */
export function computeAccountApplicationsForNeto(
  netoBase: number,
  items: AccountItemBalance[],
): { applications: AccountApplication[]; total_cuenta_abonos: number; neto_pagar: number } {
  const { applications, total } = previewAccountInstallments(netoBase, items);
  return {
    applications,
    total_cuenta_abonos: total,
    neto_pagar: roundMoney(netoBase - total),
  };
}

export async function applySettlementAccountInstallments(
  tenantId: string,
  driverId: string,
  settlementId: string,
  fechaFin: string,
  applications: AccountApplication[],
  t: Transaction,
): Promise<void> {
  if (applications.length === 0) return;

  const account = await getOrCreateDriverAccount(tenantId, driverId, t);
  const itemIds = applications.map((a) => a.item_id);

  const existing = await DriverAccountMovement.findAll({
    where: {
      tenant_id: tenantId,
      settlement_id: settlementId,
      item_id: { [Op.in]: itemIds },
    },
    transaction: t,
    lock: t.LOCK.UPDATE,
  });
  if (existing.length > 0) {
    // Idempotente: ya aplicados en este cierre.
    return;
  }

  const items = await DriverAccountItem.findAll({
    where: {
      id: { [Op.in]: itemIds },
      tenant_id: tenantId,
      driver_id: driverId,
    },
    include: [{ association: "movements" }],
    transaction: t,
    lock: t.LOCK.UPDATE,
  });
  const byId = new Map(items.map((i) => [i.id, i]));

  for (const app of applications) {
    const item = byId.get(app.item_id);
    if (!item || item.estatus !== "activo") continue;
    const movements =
      (item as DriverAccountItem & { movements?: DriverAccountMovement[] }).movements ?? [];
    const saldo = itemBalance(item, movements);
    const monto = roundMoney(Math.min(app.monto, saldo));
    if (monto <= 0) continue;

    await DriverAccountMovement.create(
      {
        id: randomUUID(),
        tenant_id: tenantId,
        account_id: account.id,
        item_id: item.id,
        driver_id: driverId,
        tipo: "liquidacion",
        monto,
        fecha: fechaFin,
        nota: `Abono liquidación`,
        settlement_id: settlementId,
      } as never,
      { transaction: t },
    );

    if (roundMoney(saldo - monto) <= 0) {
      await item.update({ estatus: "liquidado" } as never, { transaction: t });
    }
  }
}
