// ---------------------------------------------------------------------------
// Periodic review reminders — shared date helpers.
// A client's review date is set when an evaluation is saved (see
// CFG.debida_diligencia); a re-evaluation replaces it with a new one.
// ---------------------------------------------------------------------------

/** How many days before the review date a client starts showing as "upcoming". */
export const REVIEW_NOTICE_DAYS = 30;

const DAY_MS = 86_400_000;

const toUTC = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

/** Today's date in UTC, as YYYY-MM-DD (server-side "today"). */
export function utcTodayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDaysISO(iso: string, days: number): string {
  return new Date(toUTC(iso) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`; negative when `to` is in the past. */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUTC(to) - toUTC(from)) / DAY_MS);
}
