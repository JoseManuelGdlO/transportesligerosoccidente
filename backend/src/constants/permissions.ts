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
] as const;

export type PermissionSlug = (typeof ALL_PERMISSIONS)[number];

export const CAPTURISTA_DEFAULT_PERMISSIONS: PermissionSlug[] = [
  "viajes.ver",
  "viajes.crear",
  "viajes.cerrar",
  "liquidaciones.ver",
  "catalogos.ver",
  "reportes.ver",
];
