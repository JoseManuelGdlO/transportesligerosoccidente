#!/usr/bin/env tsx
/**
 * Fusiona ubicaciones de cliente que son el mismo domicilio.
 *
 * Uso:
 *   npm run db:dedupe:ubicaciones
 *   npm run db:dedupe:ubicaciones -- --apply
 *
 * Sin --apply no escribe. Con --apply rellena huecos en la sobreviviente,
 * apunta trip_ubicaciones, trip_stops y route_stops a ese id,
 * y marca las repetidas como inactivas.
 */
import "dotenv/config";
import "../src/models/index";
import { ClientUbicacion, RouteStop, TripStop, TripUbicacion, sequelize } from "../src/models";
import { ambiguousRows, groupDuplicates, type UbicacionIdentityRow } from "../src/services/clientUbicacionIdentity";

function toIdentity(row: ClientUbicacion): UbicacionIdentityRow {
  const plain = row.get({ plain: true }) as UbicacionIdentityRow;
  return { ...plain, createdAt: row.createdAt };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const rows = await ClientUbicacion.findAll({ where: { estatus: "activo" } });
  const byClient = new Map<string, UbicacionIdentityRow[]>();
  for (const row of rows) {
    const identity = toIdentity(row);
    const key = `${identity.client_id}`;
    const list = byClient.get(key) ?? [];
    list.push(identity);
    byClient.set(key, list);
  }

  let merged = 0;
  let ambiguous = 0;
  for (const list of byClient.values()) {
    for (const group of groupDuplicates(list)) {
      merged += group.duplicates.length;
      const ids = group.duplicates.map((d) => d.id);
      console.log(
        `[fusion] queda ${group.survivor.id} ← inactiva ${ids.join(", ")}` +
          (Object.keys(group.patch).length ? ` parche ${JSON.stringify(group.patch)}` : ""),
      );
      if (!apply) continue;
      await sequelize.transaction(async (transaction) => {
        if (Object.keys(group.patch).length > 0) {
          await ClientUbicacion.update(group.patch, {
            where: { id: group.survivor.id },
            transaction,
          });
        }
        for (const id of ids) {
          if (!id || !group.survivor.id) continue;
          await TripUbicacion.update(
            { client_ubicacion_id: group.survivor.id },
            { where: { client_ubicacion_id: id }, transaction },
          );
          await TripStop.update(
            { client_ubicacion_id: group.survivor.id },
            { where: { client_ubicacion_id: id }, transaction },
          );
          await RouteStop.update(
            { client_ubicacion_id: group.survivor.id },
            { where: { client_ubicacion_id: id }, transaction },
          );
          await ClientUbicacion.update({ estatus: "inactivo" }, { where: { id }, transaction });
        }
      });
    }
    for (const row of ambiguousRows(list)) {
      ambiguous += 1;
      console.log(`[ambigua] ${row.id} cliente ${row.client_id} cp ${row.cp} calle ${row.calle} — no se toca`);
    }
  }

  console.log(`${apply ? "Aplicado" : "Simulación"}: ${merged} repetida(s), ${ambiguous} ambigua(s).`);
  await sequelize.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
