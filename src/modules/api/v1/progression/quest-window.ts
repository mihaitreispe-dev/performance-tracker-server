/**
 * Quest window helpers (shared by the coaching assign path + the quests cron).
 * Windows are plain calendar dates ('YYYY-MM-DD'); weekly boundaries are
 * server-tz (UTC) Mon–Sun.
 */
export function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Current Mon–Sun window (UTC) as inclusive 'YYYY-MM-DD' strings. */
export function currentWeekWindow(): { start: string; end: string } {
  const now = new Date();
  const dow = now.getUTCDay(); // 0=Sun..6=Sat
  const sinceMonday = (dow + 6) % 7;
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - sinceMonday));
  const sunday = new Date(Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate() + 6));
  return { start: monday.toISOString().slice(0, 10), end: sunday.toISOString().slice(0, 10) };
}
