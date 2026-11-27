export function notificationRevision(unread: number, latest: Date | string | null): string {
  if (latest == null) return `${unread}:`;
  const iso = latest instanceof Date ? latest.toISOString() : new Date(latest).toISOString();
  return `${unread}:${iso}`;
}
