/** Patrón SAT t_RFC (CFDI 4.0). El último carácter solo puede ser dígito o la letra A. */
export const SAT_RFC_PATTERN =
  /^[A-Z&Ñ]{3,4}[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])[A-Z0-9]{2}[0-9A]$/;

export function isValidSatRfc(rfc: string | null | undefined): boolean {
  if (!rfc?.trim()) return false;
  return SAT_RFC_PATTERN.test(rfc.trim().toUpperCase());
}

export function satRfcIssue(label: string, rfc: string | null | undefined): string | null {
  if (!rfc?.trim()) return `${label}: falta RFC`;
  if (!isValidSatRfc(rfc)) {
    return `${label}: RFC "${rfc.trim()}" no cumple el formato SAT (homoclave debe terminar en dígito o A)`;
  }
  return null;
}
