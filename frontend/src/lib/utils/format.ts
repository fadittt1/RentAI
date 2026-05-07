export function formatTnd(amount: number | string | any) {
  // Handle string numbers from Decimal types
  const parsed = typeof amount === 'number' ? amount : parseFloat(String(amount));
  const value = isFinite(parsed) ? parsed : 0;
  return `${value.toFixed(2)} TND`;
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

export function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat('fr-TN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(date));
}

export function formatDateTime(date: string | Date | null | undefined) {
  if (!date) return '-';
  return new Intl.DateTimeFormat('fr-TN', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(date));
}
