import type { Request, Response } from "express";
import { Notification } from "../models";
import { notificationRevision } from "../services/notificationSummary";
import { asyncHandler } from "../utils/asyncHandler";
import { notificationToJson } from "../utils/documentSerialize";

const tid = (req: Request) => req.user!.tenantId;
const uid = (req: Request) => req.user!.id;

export const notificationSummary = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = tid(req);
  const userId = uid(req);
  const whereUser = { tenant_id: tenantId, user_id: userId };
  const [unread, latest] = await Promise.all([
    Notification.count({ where: { ...whereUser, leida: false } }),
    Notification.max("updatedAt", { where: whereUser }),
  ]);
  res.json({
    unread,
    revision: notificationRevision(unread, latest as Date | string | null),
  });
});

export const listNotifications = asyncHandler(async (req: Request, res: Response) => {
  const rows = await Notification.findAll({
    where: { tenant_id: tid(req), user_id: uid(req) },
    order: [["createdAt", "DESC"]],
    limit: 50,
  });
  res.json({ items: rows.map(notificationToJson) });
});

export const markNotificationRead = asyncHandler(async (req: Request, res: Response) => {
  const n = await Notification.findOne({
    where: { id: req.params.id, tenant_id: tid(req), user_id: uid(req) },
  });
  if (!n) {
    res.status(404).json({ error: "No encontrado" });
    return;
  }
  await n.update({ leida: true });
  res.json(notificationToJson(n));
});

export const markAllNotificationsRead = asyncHandler(async (req: Request, res: Response) => {
  await Notification.update({ leida: true }, { where: { tenant_id: tid(req), user_id: uid(req), leida: false } });
  res.json({ ok: true });
});
