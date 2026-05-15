import webpush from "web-push";
import cron from "node-cron";
import { Op } from "sequelize";
import { randomUUID } from "node:crypto";
import {
  Document,
  DocumentType,
  Driver,
  Notification,
  Permission,
  PushSubscription,
  Role,
  Truck,
  User,
} from "../models";

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

function localDateStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function usersWithPermission(tenantId: string, permissionSlug: string): Promise<User[]> {
  return User.findAll({
    where: { tenant_id: tenantId, estatus: "activo" },
    include: [
      {
        model: Role,
        required: true,
        include: [
          {
            model: Permission,
            required: true,
            attributes: [],
            through: { attributes: [] },
            where: { slug: permissionSlug },
          },
        ],
      },
    ],
  });
}

async function entityLabel(
  tenantId: string,
  documentableType: "driver" | "truck",
  documentableId: string,
): Promise<string> {
  if (documentableType === "driver") {
    const row = await Driver.findOne({ where: { id: documentableId, tenant_id: tenantId }, attributes: ["nombre"] });
    return row?.nombre ?? "Operador";
  }
  const row = await Truck.findOne({
    where: { id: documentableId, tenant_id: tenantId },
    attributes: ["numero_economico"],
  });
  return row?.numero_economico ?? "Unidad";
}

export function startDocumentExpirationJob(): void {
  const expr = process.env.CRON_DOC_CHECK || "0 7 * * *";
  configureVapid();

  cron.schedule(expr, () => {
    void runDocumentExpirationCheck().catch((e) => console.error("[cron documents]", e));
  });

  console.log(`[cron] Documentos: planificación "${expr}" (${process.env.TZ || "default TZ"})`);
}

export async function runDocumentExpirationCheck(): Promise<void> {
  const pushOk = configureVapid();
  const alertDateStr = localDateStr();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const docs = await Document.findAll({
    where: {
      vigencia_fin: { [Op.ne]: null },
    },
    include: [{ model: DocumentType, required: true, where: { requiere_vigencia: true, activo: true } }],
  });

  for (const d of docs) {
    const dt = d.DocumentType;
    if (!dt || !d.vigencia_fin) continue;

    const end = new Date(d.vigencia_fin);
    end.setHours(0, 0, 0, 0);
    const daysLeft = Math.round((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    const inAlertWindow = daysLeft < 0 || (daysLeft >= 0 && daysLeft <= dt.dias_aviso);
    if (!inAlertWindow) continue;

    const tipo = daysLeft < 0 ? "document.vencido" : "document.por_vencer";
    const tenantId = d.tenant_id;

    const users = await usersWithPermission(tenantId, "documentos.ver");
    const label = await entityLabel(tenantId, d.documentable_type, d.documentable_id);
    const title =
      tipo === "document.vencido"
        ? `Vencido: ${dt.nombre}`
        : `Por vencer: ${dt.nombre}`;
    const body =
      tipo === "document.vencido"
        ? `${label} — documento vencido (vigencia ${d.vigencia_fin})`
        : `${label} — faltan ${daysLeft} día(s) (vence ${d.vigencia_fin})`;

    for (const u of users) {
      const dup = await Notification.findOne({
        where: {
          user_id: u.id,
          document_id: d.id,
          alert_date: alertDateStr,
          tipo,
        },
      });
      if (dup) continue;

      try {
        await Notification.create({
          id: randomUUID(),
          tenant_id: tenantId,
          user_id: u.id,
          tipo,
          document_id: d.id,
          alert_date: alertDateStr,
          leida: false,
          payload: {
            document_id: d.id,
            document_type: dt.nombre,
            documentable_type: d.documentable_type,
            documentable_id: d.documentable_id,
            vigencia_fin: d.vigencia_fin,
            days_left: daysLeft,
            title,
            body,
          },
        });
      } catch (e: unknown) {
        const name = e && typeof e === "object" && "name" in e ? (e as { name: string }).name : "";
        if (name !== "SequelizeUniqueConstraintError") throw e;
      }

      if (!pushOk) continue;

      const subs = await PushSubscription.findAll({ where: { user_id: u.id, tenant_id: tenantId } });
      const payload = JSON.stringify({
        title,
        body,
        url:
          d.documentable_type === "driver"
            ? `/operadores?open=${d.documentable_id}`
            : `/camiones?open=${d.documentable_id}`,
      });

      for (const s of subs) {
        try {
          await webpush.sendNotification(
            {
              endpoint: s.endpoint,
              keys: { p256dh: s.p256dh, auth: s.auth },
            },
            payload,
            { TTL: 86_400 },
          );
        } catch (err: unknown) {
          const sc =
            err && typeof err === "object" && "statusCode" in err ? (err as { statusCode?: number }).statusCode : 0;
          if (sc === 404 || sc === 410) {
            await s.destroy();
          } else {
            console.warn("[webpush]", err);
          }
        }
      }
    }
  }
}
