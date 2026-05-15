import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Request, Response } from "express";
import { PushSubscription } from "../models";
import { asyncHandler } from "../utils/asyncHandler";

const tid = (req: Request) => req.user!.tenantId;
const uid = (req: Request) => req.user!.id;

export const getPushPublicKey = asyncHandler(async (_req: Request, res: Response) => {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) {
    res.status(503).json({ error: "Web push no configurado (faltan VAPID_* en el servidor)" });
    return;
  }
  res.json({ publicKey: key });
});

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export const postSubscribe = asyncHandler(async (req: Request, res: Response) => {
  const parsed = subscribeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { endpoint, keys } = parsed.data;
  const ua = typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : null;

  const existing = await PushSubscription.findOne({ where: { endpoint } });
  if (existing) {
    await existing.update({
      tenant_id: tid(req),
      user_id: uid(req),
      p256dh: keys.p256dh,
      auth: keys.auth,
      user_agent: ua,
    });
    res.status(200).json({ ok: true, id: existing.id });
    return;
  }

  const row = await PushSubscription.create({
    id: randomUUID(),
    tenant_id: tid(req),
    user_id: uid(req),
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    user_agent: ua,
  });
  res.status(201).json({ ok: true, id: row.id });
});

const unsubSchema = z.object({
  endpoint: z.string().url(),
});

export const postUnsubscribe = asyncHandler(async (req: Request, res: Response) => {
  const parsed = unsubSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  await PushSubscription.destroy({
    where: { endpoint: parsed.data.endpoint, user_id: uid(req), tenant_id: tid(req) },
  });
  res.json({ ok: true });
});
