import { Op } from "sequelize";
import { SatClaveProducto } from "../models";
import type { TripMercancia } from "../models";
import {
  bienesTranspCpIssue,
  materialPeligrosoCoherenceIssue,
  resolveMaterialPeligrosoBoolean,
  type SatMaterialPeligroso,
} from "../utils/cartaPorteSat";

export type SatClaveProductoDto = {
  clave: string;
  descripcion: string;
  material_peligroso: SatMaterialPeligroso;
};

function toDto(row: SatClaveProducto): SatClaveProductoDto {
  return {
    clave: row.clave,
    descripcion: row.descripcion,
    material_peligroso: row.material_peligroso,
  };
}

export async function loadSatMaterialPeligrosoByClaves(
  claves: string[],
): Promise<Record<string, SatMaterialPeligroso>> {
  const normalized = [...new Set(claves.map((c) => c.trim()).filter((c) => /^\d{8}$/.test(c)))];
  if (normalized.length === 0) return {};

  const rows = await SatClaveProducto.findAll({
    where: { clave: { [Op.in]: normalized } },
    attributes: ["clave", "material_peligroso"],
  });

  return Object.fromEntries(rows.map((r) => [r.clave, r.material_peligroso]));
}

export async function getClaveProducto(clave: string): Promise<SatClaveProductoDto | null> {
  const normalized = clave.trim();
  if (!/^\d{8}$/.test(normalized)) return null;
  const row = await SatClaveProducto.findByPk(normalized);
  return row ? toDto(row) : null;
}

export async function searchClavesProducto(q: string, limit = 20): Promise<SatClaveProductoDto[]> {
  const term = q.trim();
  if (!term) return [];

  const capped = Math.min(Math.max(limit, 1), 50);
  const where =
    /^\d+$/.test(term)
      ? { clave: { [Op.like]: `${term}%` } }
      : term.length < 2
        ? null
        : {
            [Op.or]: [
              { descripcion: { [Op.like]: `%${term}%` } },
              { palabras_similares: { [Op.like]: `%${term}%` } },
              { clave: { [Op.like]: `${term}%` } },
            ],
          };

  if (!where) return [];

  const rows = await SatClaveProducto.findAll({
    where,
    order: [["clave", "ASC"]],
    limit: capped,
  });
  return rows.map(toDto);
}

export async function assertClaveProductoExists(clave: string): Promise<SatClaveProductoDto> {
  const row = await getClaveProducto(clave);
  if (!row) {
    throw new Error(`Clave "${clave.trim()}" no existe en catálogo c_ClaveProdServCP`);
  }
  return row;
}

export function assertMaterialPeligrosoCoherente(
  label: string,
  catalog: SatMaterialPeligroso,
  materialPeligrosoUsuario: boolean,
): void {
  const issue = materialPeligrosoCoherenceIssue(label, catalog, materialPeligrosoUsuario);
  if (issue) throw new Error(issue);
}

export async function resolveMercanciaCatalog(
  clave: string,
  materialPeligrosoUsuario: boolean | undefined,
  descripcion?: string,
): Promise<{ clave_prod_serv: string; material_peligroso: boolean; descripcion?: string }> {
  const label = descripcion ? `Mercancía "${descripcion}"` : `Clave ${clave.trim()}`;
  const catalog = await assertClaveProductoExists(clave);
  const bienesIssue = bienesTranspCpIssue(label, catalog.clave);
  if (bienesIssue) throw new Error(bienesIssue);

  const material_peligroso = resolveMaterialPeligrosoBoolean(
    catalog.material_peligroso,
    materialPeligrosoUsuario,
  );
  assertMaterialPeligrosoCoherente(label, catalog.material_peligroso, material_peligroso);

  return {
    clave_prod_serv: catalog.clave,
    material_peligroso,
  };
}

export async function validateMercanciasCatalog(mercancias: TripMercancia[]): Promise<string[]> {
  const issues: string[] = [];
  const claves = [...new Set(mercancias.map((m) => m.clave_prod_serv?.trim()).filter(Boolean))] as string[];
  if (claves.length === 0 && mercancias.length > 0) {
    for (const m of mercancias) {
      const label = `Mercancía "${m.descripcion}"`;
      const bienesIssue = bienesTranspCpIssue(label, m.clave_prod_serv);
      if (bienesIssue) issues.push(bienesIssue);
    }
    return issues;
  }

  const rows = await SatClaveProducto.findAll({
    where: { clave: { [Op.in]: claves } },
  });
  const byClave = new Map(rows.map((r) => [r.clave, r]));

  for (const m of mercancias) {
    const label = `Mercancía "${m.descripcion}"`;
    const bienesIssue = bienesTranspCpIssue(label, m.clave_prod_serv);
    if (bienesIssue) {
      issues.push(bienesIssue);
      continue;
    }

    const clave = m.clave_prod_serv!.trim();
    const catalog = byClave.get(clave);
    if (!catalog) {
      issues.push(`${label}: clave "${clave}" no existe en catálogo c_ClaveProdServCP`);
      continue;
    }

    const coherence = materialPeligrosoCoherenceIssue(
      label,
      catalog.material_peligroso,
      !!m.material_peligroso,
    );
    if (coherence) issues.push(coherence);
  }

  return issues;
}
