import webpush from "web-push";
import { PushSubscription } from "../models";
import { logger } from "../utils/logger";

let vapidConfigured = false;

function configureVapid(): boolean {
  if (vapidConfigured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@tlo.mx";
  if (!pub || !priv) return false;
  webpush.setVapidDetails(subject, pub, priv);
  vapidConfigured = true;
  return true;
}

export async function sendUserPush(
  userId: string,
  tenantId: string,
  payload: { title: string; body: string; url: string },
): Promise<void> {
  if (!configureVapid()) return;

  const subs = await PushSubscription.findAll({ where: { user_id: userId, tenant_id: tenantId } });
  const body = JSON.stringify(payload);

  for (const s of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: s.endpoint,
          keys: { p256dh: s.p256dh, auth: s.auth },
        },
        body,
        { TTL: 86_400 },
      );
    } catch (err: unknown) {
      const sc =
        err && typeof err === "object" && "statusCode" in err ? (err as { statusCode?: number }).statusCode : 0;
      if (sc === 404 || sc === 410) {
        await s.destroy();
      } else {
        logger.warn(`[webpush] ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
}
