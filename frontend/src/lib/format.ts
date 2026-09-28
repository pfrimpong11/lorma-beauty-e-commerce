import { getConfig } from './runtime-config';

/**
 * Money arrives from the API as a fixed-scale string ("280.00") and is
 * formatted for display here. It is never summed on the client — totals are
 * computed server-side in DECIMAL (see backend docs/adr/0002-money.md).
 */
export function formatMoney(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const { currency, currencyLocale } = getConfig();
  const amount = typeof value === 'string' ? Number.parseFloat(value) : value;
  if (Number.isNaN(amount)) return '—';

  try {
    return new Intl.NumberFormat(currencyLocale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(amount);
  } catch {
    // An unknown locale or currency code must not blank out the POS.
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/** Currency symbol plus the raw string, for dense table cells. */
export function formatAmount(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '' || value === '—') return '—';
  const { currency } = getConfig();
  const amount = typeof value === 'string' ? Number.parseFloat(value) : value;
  if (Number.isNaN(amount)) return '—';
  return `${currency} ${amount.toFixed(2)}`;
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatRelative(value: string | Date | null | undefined): string {
  if (!value) return 'never';
  const date = typeof value === 'string' ? new Date(value) : value;
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  return formatDate(date);
}

export function initials(first: string, last: string): string {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

/** "MOBILE_MONEY" -> "Mobile Money" */
export function humanise(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
