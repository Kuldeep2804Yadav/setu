/**
 * Helper utilities for Asia/Kolkata timezone dates
 */

export function getTodayIST(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function formatDateDisplay(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return 'N/A';
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

export function formatDateTimeDisplay(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return 'N/A';
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(d);
}

export function isFutureDateIST(dateStr: string): boolean {
  const today = getTodayIST();
  return dateStr > today;
}
