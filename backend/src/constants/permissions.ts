/** Aligned with frontend Permission union */
export const ALL_PERMISSIONS = [
  "viajes.ver",
  "viajes.crear",
  "viajes.cerrar",
  "viajes.eliminar",
  "liquidaciones.ver",
  "liquidaciones.cerrar",
  "catalogos.ver",
  "catalogos.editar",
  "reportes.ver",
  "usuarios.gestionar",
  "empresa.gestionar",
  "marca.gestionar",
  "documentos.ver",
  "documentos.editar",
  "tipos_documento.gestionar",
  "notificaciones.ver",
  "cartaporte.ver",
  "cartaporte.timbrar",
  "cartaporte.cancelar",
  "fiscal.configurar",
  "combustibles.ver",
  "combustibles.crear",
  "combustibles.importar",
  "combustibles.eliminar",
] as const;

export type PermissionSlug = (typeof ALL_PERMISSIONS)[number];

export const CAPTURISTA_DEFAULT_PERMISSIONS: PermissionSlug[] = [
  "viajes.ver",
  "viajes.crear",
  "viajes.cerrar",
  "liquidaciones.ver",
  "catalogos.ver",
  "reportes.ver",
  "combustibles.ver",
  "combustibles.crear",
  "combustibles.importar",
];

const ALL_SET = new Set<string>(ALL_PERMISSIONS);

/** Admin siempre tiene todos los permisos del sistema (incluye los agregados después del seed). */
export function permissionsForRole(roleSlug: string, fromDb: string[]): PermissionSlug[] {
  if (roleSlug === "admin") return [...ALL_PERMISSIONS];
  return fromDb.filter((p): p is PermissionSlug => ALL_SET.has(p));
}
