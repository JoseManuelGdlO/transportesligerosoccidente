export function cxcSyncNotice(error: string | null | undefined): string | null {
  const msg = error?.trim();
  return msg ? msg : null;
}
