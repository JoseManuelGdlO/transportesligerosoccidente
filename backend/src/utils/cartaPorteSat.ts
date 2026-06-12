/** Claves CFDI de *servicio* de transporte (c_ClaveProdServ). No van en BienesTransp. */
export const CFDI_TRANSPORT_CLAVE_PROD_SERV = new Set(["78101800", "78101801", "78101802"]);

/** Valor genérico válido en c_ClaveProdServCP para pruebas (Botanas). */
export const DEFAULT_BIENES_TRANSP_CP = "50192100";

/** c_ClaveProdServCP: 8 dígitos. La validación XSD completa la hace el PAC. */
export const BIENES_TRANSP_CP_PATTERN = /^\d{8}$/;

export function isLikelyCfdiTransportClave(clave: string): boolean {
  const c = clave.trim();
  return CFDI_TRANSPORT_CLAVE_PROD_SERV.has(c) || /^7810\d{4}$/.test(c);
}

export function isValidBienesTranspCpClave(clave: string | null | undefined): boolean {
  if (!clave?.trim()) return false;
  const c = clave.trim();
  if (!BIENES_TRANSP_CP_PATTERN.test(c)) return false;
  if (isLikelyCfdiTransportClave(c)) return false;
  return true;
}

export function bienesTranspCpIssue(label: string, clave: string | null | undefined): string | null {
  if (!clave?.trim()) {
    return `${label}: falta clave de bienes transportados (catálogo c_ClaveProdServCP)`;
  }
  if (!BIENES_TRANSP_CP_PATTERN.test(clave.trim())) {
    return `${label}: clave "${clave.trim()}" debe ser 8 dígitos del catálogo c_ClaveProdServCP (Carta Porte)`;
  }
  if (isLikelyCfdiTransportClave(clave.trim())) {
    return `${label}: "${clave.trim()}" es clave CFDI de servicio de transporte (781018xx), no de mercancía. Use c_ClaveProdServCP (ej. ${DEFAULT_BIENES_TRANSP_CP})`;
  }
  return null;
}

/** c_TipoPermiso (PermSCT). TPAF01–TPAF14, TPTM01, TPXX00, etc. */
export const PERM_SCT_PATTERN = /^TP[A-Z]{2}(0[0-9]|[1-9][0-9])$/;

/** Corrige confusión O/0 en TPAF0x (ej. TPAFO1 → TPAF01). */
export function normalizePermSct(value: string): string {
  const v = value.trim().toUpperCase();
  return v.replace(/^TPAFO(\d)$/, "TPAF0$1");
}

export function isValidPermSct(value: string | null | undefined): boolean {
  if (!value?.trim()) return false;
  return PERM_SCT_PATTERN.test(normalizePermSct(value));
}

export function permSctIssue(label: string, value: string | null | undefined): string | null {
  if (!value?.trim()) return `${label}: falta permiso SCT (c_TipoPermiso, ej. TPAF01)`;
  const normalized = normalizePermSct(value);
  if (!PERM_SCT_PATTERN.test(normalized)) {
    return `${label}: permiso SCT "${value.trim()}" no es clave válida de c_TipoPermiso (ej. TPAF01)`;
  }
  return null;
}

/** c_ConfigAutotransporte: alfanumérico (C2, VL, T3S2…), no numérico puro. */
export const CONFIG_VEHICULAR_PATTERN = /^[A-Z0-9]{2,6}$/;

export function isValidConfigVehicular(value: string | null | undefined): boolean {
  if (!value?.trim()) return false;
  const v = value.trim().toUpperCase();
  if (/^\d+$/.test(v)) return false;
  return CONFIG_VEHICULAR_PATTERN.test(v);
}

export function configVehicularIssue(label: string, value: string | null | undefined): string | null {
  if (!value?.trim()) {
    return `${label}: falta configuración vehicular SAT (c_ConfigAutotransporte, ej. C2)`;
  }
  const v = value.trim().toUpperCase();
  if (/^\d+$/.test(v)) {
    return `${label}: "${v}" no es clave de c_ConfigAutotransporte (use ej. C2, VL, T3S2)`;
  }
  if (!CONFIG_VEHICULAR_PATTERN.test(v)) {
    return `${label}: configuración vehicular "${v}" no cumple formato c_ConfigAutotransporte`;
  }
  return null;
}
