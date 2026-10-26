/**
 * Date and timezone utilities for LabourSetu
 * Primary business timezone: Asia/Kolkata (IST, UTC+5:30)
 */

export const IST_TIMEZONE = 'Asia/Kolkata';

/**
 * Returns today's date formatted as YYYY-MM-DD in Asia/Kolkata timezone
 */
export function getTodayIST(): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date());
}

/**
 * Validates whether a YYYY-MM-DD string is in the future relative to Asia/Kolkata today
 */
export function isFutureDateIST(dateStr: string): boolean {
  const today = getTodayIST();
  return dateStr > today;
}

/**
 * Parses a YYYY-MM-DD string into a Date object representing UTC midnight for PostgreSQL @db.Date
 */
export function parseDateOnly(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

/**
 * Formats a Date object as YYYY-MM-DD
 */
export function formatDateOnly(date: Date): string {
  return date.toISOString().substring(0, 10);
}
