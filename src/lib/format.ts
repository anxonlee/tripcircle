/** "$18" / "$1,340" — manual separator so we don't depend on Intl availability. */
export function formatUsd(n: number): string {
  const rounded = Math.round(n);
  return `$${String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

/** "820" / "1.8k" / "3.1k" — compact counts for feed stats. */
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
