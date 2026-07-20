/** "¥1,340" — manual separator so we don't depend on Intl availability. */
export function formatYen(n: number): string {
  const rounded = Math.round(n);
  return `¥${String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

/** "45 min" / "1 h 32 min" */
export function formatDuration(min: number): string {
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h} h` : `${h} h ${rest} min`;
}
