import {
  balances,
  fairShares,
  formatCents,
  parseAmount,
  settleUp,
  type Payer,
} from '../costSplit';

/**
 * Money that does not reconcile is worse than no feature: whoever is out of
 * pocket will notice. Most of these are about the cent that goes missing.
 */

const payer = (id: string, paidCents: number, name = id): Payer => ({
  id,
  name,
  paidCents,
});

/** Every transfer applied, then everyone should be square. */
const settled = (payers: Payer[]) => {
  const net = new Map(payers.map((p) => [p.id, 0]));
  for (const t of settleUp(payers)) {
    net.set(t.fromId, net.get(t.fromId)! + t.cents);
    net.set(t.toId, net.get(t.toId)! - t.cents);
  }
  // A person's transfers must exactly cancel what they were owed or owed out.
  return balances(payers).every((b) => b.net + net.get(b.id)! === 0);
};

describe('fairShares', () => {
  it('divides evenly when it can', () => {
    expect(fairShares(3000, 3)).toEqual([1000, 1000, 1000]);
  });

  it('never loses or invents a cent', () => {
    // £10 three ways is the case that breaks naive rounding in both
    // directions: floor loses a penny, ceil invents two.
    for (const total of [1000, 1001, 999, 3333, 1, 7]) {
      for (const people of [1, 2, 3, 4, 7]) {
        const shares = fairShares(total, people);
        expect(shares).toHaveLength(people);
        expect(shares.reduce((s, c) => s + c, 0)).toBe(total);
      }
    }
  });

  it('spreads the remainder rather than dumping it on one person', () => {
    expect(fairShares(1000, 3)).toEqual([334, 333, 333]);
    expect(fairShares(1001, 3)).toEqual([334, 334, 333]);
  });

  it('is empty for nobody', () => {
    expect(fairShares(1000, 0)).toEqual([]);
  });

  it('handles a free day', () => {
    expect(fairShares(0, 3)).toEqual([0, 0, 0]);
  });
});

describe('settleUp', () => {
  it('has nothing to settle for one person', () => {
    expect(settleUp([payer('a', 5000)])).toEqual([]);
  });

  it('has nothing to settle when nobody paid', () => {
    expect(settleUp([payer('a', 0), payer('b', 0)])).toEqual([]);
  });

  it('has nothing to settle when everyone paid the same', () => {
    expect(settleUp([payer('a', 1000), payer('b', 1000)])).toEqual([]);
  });

  it('moves half the difference, not the whole of it', () => {
    // The mistake worth guarding: b does not owe a the full 1000, only the
    // 500 that makes them level.
    const out = settleUp([payer('a', 1000), payer('b', 0)]);
    expect(out).toEqual([
      { fromId: 'b', fromName: 'b', toId: 'a', toName: 'a', cents: 500 },
    ]);
  });

  it('settles everyone, whatever the shape', () => {
    const cases: Payer[][] = [
      [payer('a', 1000), payer('b', 0), payer('c', 0)],
      [payer('a', 1000), payer('b', 500), payer('c', 250)],
      [payer('a', 3333), payer('b', 0), payer('c', 0)],
      [payer('a', 1), payer('b', 0), payer('c', 0)],
      [payer('a', 0), payer('b', 0), payer('c', 1)],
      [payer('a', 2000), payer('b', 1999), payer('c', 1), payer('d', 0)],
      [payer('a', 10_000), payer('b', 3), payer('c', 7), payer('d', 11), payer('e', 0)],
    ];
    for (const c of cases) expect(settled(c)).toBe(true);
  });

  it('never sends more than was spent', () => {
    const payers = [payer('a', 5000), payer('b', 1000), payer('c', 0)];
    const moved = settleUp(payers).reduce((s, t) => s + t.cents, 0);
    const owed = balances(payers)
      .filter((b) => b.net > 0)
      .reduce((s, b) => s + b.net, 0);
    expect(moved).toBe(owed);
  });

  it('needs at most one fewer transfer than there are people', () => {
    const payers = [
      payer('a', 9000),
      payer('b', 100),
      payer('c', 50),
      payer('d', 0),
      payer('e', 0),
    ];
    expect(settleUp(payers).length).toBeLessThanOrEqual(payers.length - 1);
  });

  it('never emits a transfer of nothing', () => {
    const payers = [payer('a', 1000), payer('b', 1000), payer('c', 0)];
    expect(settleUp(payers).every((t) => t.cents > 0)).toBe(true);
  });

  it('never has someone pay themselves', () => {
    const payers = [payer('a', 1000), payer('b', 300), payer('c', 0)];
    expect(settleUp(payers).every((t) => t.fromId !== t.toId)).toBe(true);
  });

  it('is deterministic when two people are equally in debt', () => {
    const payers = [payer('a', 3000), payer('b', 0), payer('c', 0)];
    expect(settleUp(payers)).toEqual(settleUp(payers));
  });

  it('treats a negative amount as nothing rather than refusing the day', () => {
    const out = settleUp([payer('a', 1000), payer('b', -500)]);
    expect(out).toHaveLength(1);
    expect(out[0].cents).toBe(500);
  });

  it('settles a day where the odd cent decides who owes whom', () => {
    // One cent, three people. Two owe nothing they can pay; the arithmetic
    // still has to close.
    expect(settled([payer('a', 1), payer('b', 0), payer('c', 0)])).toBe(true);
  });
});

describe('formatCents', () => {
  it('shows the cents, unlike everything else in the app', () => {
    expect(formatCents(1250)).toBe('$12.50');
    expect(formatCents(1200)).toBe('$12.00');
    expect(formatCents(5)).toBe('$0.05');
    expect(formatCents(0)).toBe('$0.00');
  });

  it('separates thousands', () => {
    expect(formatCents(123_456_78)).toBe('$123,456.78');
  });

  it('puts the sign outside the symbol', () => {
    expect(formatCents(-1250)).toBe('-$12.50');
  });
});

describe('parseAmount', () => {
  it('reads what people type', () => {
    expect(parseAmount('12.50')).toBe(1250);
    expect(parseAmount('12')).toBe(1200);
    expect(parseAmount('0.05')).toBe(5);
    expect(parseAmount('$12.50')).toBe(1250);
    expect(parseAmount(' 1,234.56 ')).toBe(123_456);
  });

  it('does not lose a cent to floating point', () => {
    // 19.99 * 100 is 1998.9999999999998. A cent lost here never reconciles.
    expect(parseAmount('19.99')).toBe(1999);
    expect(parseAmount('0.07')).toBe(7);
    expect(parseAmount('1.10')).toBe(110);
  });

  it('refuses what is not an amount', () => {
    for (const bad of ['', ' ', '.', 'abc', '1.234', '-5', '1e3', '12..5']) {
      expect(parseAmount(bad)).toBeNull();
    }
  });
});
