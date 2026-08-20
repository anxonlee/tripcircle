/**
 * Who owes what after a day out (PRD F16, §3.7).
 *
 * Tracking only. §487 settled this and the reason is not squeamishness:
 * moving money between users triggers money-transmission licensing, so the
 * app records the arithmetic and people settle up however they already do.
 * Nothing here touches a payment rail, holds a balance, or knows a card
 * number, and nothing downstream of it should either.
 *
 * There are no accounts in this app, so the people in a split are names
 * someone typed on their own phone. That is a real limit and it shapes the
 * whole feature: the split lives on one device, is shared as text if it is
 * shared at all, and nobody is notified of anything.
 *
 * Everything is in integer cents. Splitting three ways is the arithmetic
 * most likely to drift, and money that does not reconcile is worse than no
 * feature: a settle-up whose transfers do not sum to what was spent will be
 * spotted by whoever is out of pocket.
 */

export interface Payer {
  id: string;
  name: string;
  /** What this person actually put in, in cents. */
  paidCents: number;
}

export interface Transfer {
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  cents: number;
}

/**
 * Each person's fair share, in cents, summing exactly to the total.
 *
 * A total that does not divide evenly leaves a remainder of a few cents.
 * Those go to the earliest people in the list rather than being dropped or
 * given to everyone: dropping them makes the shares sum to less than was
 * spent, and rounding each share up makes them sum to more. Someone has to
 * carry the odd penny, and the rule for who is at least stable.
 */
export function fairShares(totalCents: number, people: number): number[] {
  if (people <= 0) return [];
  const base = Math.floor(totalCents / people);
  let remainder = totalCents - base * people;
  return Array.from({ length: people }, () => {
    if (remainder > 0) {
      remainder -= 1;
      return base + 1;
    }
    return base;
  });
}

/**
 * The transfers that settle a day, fewest first.
 *
 * Greedy: net everyone against their fair share, then repeatedly send the
 * largest debt to the largest credit. That is not provably the minimum
 * number of transfers — that problem is NP-hard — but it produces at most
 * one fewer transfer than there are people, which is the bound anyone
 * actually cares about, and it is stable enough to test.
 *
 * A negative `paidCents` is treated as zero rather than rejected: a typed
 * amount can be anything, and refusing to settle a day because one field is
 * odd helps nobody.
 */
export function settleUp(payers: Payer[]): Transfer[] {
  if (payers.length < 2) return [];
  const paid = payers.map((p) => Math.max(0, Math.round(p.paidCents)));
  const total = paid.reduce((s, c) => s + c, 0);
  if (total === 0) return [];

  const shares = fairShares(total, payers.length);
  // Positive: put in more than their share, so they are owed.
  const balances = payers.map((p, i) => ({
    id: p.id,
    name: p.name,
    net: paid[i] - shares[i],
  }));

  const creditors = balances
    .filter((b) => b.net > 0)
    .sort((a, b) => b.net - a.net || a.id.localeCompare(b.id));
  const debtors = balances
    .filter((b) => b.net < 0)
    .sort((a, b) => a.net - b.net || a.id.localeCompare(b.id));

  const out: Transfer[] = [];
  let ci = 0;
  let di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const c = creditors[ci];
    const d = debtors[di];
    const cents = Math.min(c.net, -d.net);
    if (cents > 0) {
      out.push({
        fromId: d.id,
        fromName: d.name,
        toId: c.id,
        toName: c.name,
        cents,
      });
    }
    c.net -= cents;
    d.net += cents;
    // Advance whoever is settled. Both may be, which is why these are two
    // separate checks rather than an else.
    if (c.net === 0) ci += 1;
    if (d.net === 0) di += 1;
  }
  return out;
}

/** What each person is owed (positive) or owes (negative), in cents. */
export function balances(payers: Payer[]): { id: string; net: number }[] {
  const paid = payers.map((p) => Math.max(0, Math.round(p.paidCents)));
  const total = paid.reduce((s, c) => s + c, 0);
  const shares = fairShares(total, payers.length);
  return payers.map((p, i) => ({ id: p.id, net: paid[i] - shares[i] }));
}

/**
 * "$12.50" — cents, with them shown.
 *
 * The rest of the app prints whole dollars, because every figure in it is an
 * estimate and cents would claim a precision the model has not got. This is
 * the exception and it earns it: a split is not an estimate, it is what
 * somebody actually paid, and telling two people they owe "$13" each when
 * one of them owes $12.50 is how a feature about money loses trust.
 */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.round(cents));
  const dollars = Math.floor(abs / 100);
  const rest = String(abs % 100).padStart(2, '0');
  const withSeparators = String(dollars).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}$${withSeparators}.${rest}`;
}

/** "12.50" or "12" from a text field, to cents. Null when unreadable. */
export function parseAmount(text: string): number | null {
  const cleaned = text.trim().replace(/^\$/, '').replace(/,/g, '');
  if (!/^\d*\.?\d{0,2}$/.test(cleaned) || cleaned === '' || cleaned === '.') {
    return null;
  }
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  // Via a string rather than value * 100: 19.99 * 100 is 1998.9999999999998,
  // and a cent lost here is a cent that never reconciles.
  return Math.round(value * 100);
}
