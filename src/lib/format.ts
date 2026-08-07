import type { PriceBand } from '../domain/types';

/**
 * "$18" / "$1,340" — manual separator so we don't depend on Intl
 * availability. Whole dollars only: every cost in this app is an estimate,
 * and cents would imply a precision the model does not have.
 */
export function formatUsd(n: number): string {
  const rounded = Math.round(n);
  const sign = rounded < 0 ? '-' : '';
  const abs = Math.abs(rounded);
  return `${sign}$${String(abs).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

/**
 * Day totals, to the nearest dollar.
 *
 * A day's cost is an estimate assembled from other estimates, so the last
 * digit is not meaningful and rounding says so. The bucket is $1 rather than
 * anything wider because Bay Area fares are $2.20–$5.10 a leg: a $5 bucket —
 * which is what the Hong Kong build used, at roughly US$0.64 — would swallow
 * a whole BART ride and make two genuinely different days read alike.
 *
 * Rounding happens here, at display time, and nowhere else. Per-leg fares
 * stay exact, and the optimiser's internal scoring never sees a rounded
 * number.
 */
export function formatDayTotal(usd: number): string {
  return formatUsd(usd);
}

/**
 * "Free" / "$" / "$$" / "$$$" — our own price band (PRD §12.2 curation), not
 * Google's price level.
 *
 * This is what a place costs, wherever that is shown. The numeric
 * `avgCostUsd` is not: it is an estimate on an unverified fixture, and
 * printing it as money claims a precision the data has not got. A band says
 * the same thing at the accuracy actually available.
 */
export function formatPriceBand(band: PriceBand): string {
  return band === 'free' ? 'Free' : band;
}

/** "820" / "1.8k" / "3.1k" — compact counts. */
export function formatCount(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

/** "45 min" / "1 h 32 min" */
export function formatDuration(min: number): string {
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h} h` : `${h} h ${rest} min`;
}

/**
 * Coarse "how long ago" for a day count. Deliberately vague past a week —
 * a diary reads better as "3w ago" than a date nobody can place.
 */
export function relativeDays(days: number): string {
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

/** 1st, 2nd, 3rd, 4th… for visit counts. */
export function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
