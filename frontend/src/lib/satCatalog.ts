import type { SatClaveProducto, SatMaterialPeligroso } from "@/types/tlo";

export type MaterialPeligrosoUiMode = "hidden" | "forced_yes" | "optional";

export function materialPeligrosoUiMode(mp: SatMaterialPeligroso): MaterialPeligrosoUiMode {
  if (mp === "1") return "forced_yes";
  if (mp === "0,1") return "optional";
  return "hidden";
}

export function materialPeligrosoForCatalog(
  catalog: SatClaveProducto,
  current: boolean,
): boolean {
  if (catalog.material_peligroso === "1") return true;
  if (catalog.material_peligroso === "0") return false;
  return current;
}
