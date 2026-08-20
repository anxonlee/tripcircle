import { payersFrom } from '../costSplit';

/**
 * `payersFrom` is the join between what people typed and what the settle-up
 * arithmetic reads. It is small, it is pure, and it was the one piece of the
 * cost split with no test.
 */

const person = (id: string, name = id) => ({ id, name });
const expense = (payerId: string, cents: number, label = 'x') => ({
  id: `e-${payerId}-${cents}`,
  label,
  cents,
  payerId,
});

describe('payersFrom', () => {
  it('sums what each person paid', () => {
    const out = payersFrom(
      [person('a'), person('b')],
      [expense('a', 500), expense('a', 250), expense('b', 100)]
    );
    expect(out).toEqual([
      { id: 'a', name: 'a', paidCents: 750 },
      { id: 'b', name: 'b', paidCents: 100 },
    ]);
  });

  it('includes someone who paid for nothing', () => {
    // They still owe a share, so leaving them out would divide the day
    // between the wrong number of people.
    const out = payersFrom([person('a'), person('b')], [expense('a', 500)]);
    expect(out).toHaveLength(2);
    expect(out[1].paidCents).toBe(0);
  });

  it('ignores an expense whose payer is gone', () => {
    // Removing a person deletes their expenses, so this should not arise —
    // but if it ever did, the total must not include money nobody put in.
    const out = payersFrom([person('a')], [expense('a', 500), expense('ghost', 900)]);
    expect(out).toEqual([{ id: 'a', name: 'a', paidCents: 500 }]);
  });

  it('keeps the order people were added in', () => {
    // fairShares hands the odd cent to the earliest people, so the order
    // here decides who carries it. Stable order, stable answer.
    const out = payersFrom([person('c'), person('a'), person('b')], []);
    expect(out.map((p) => p.id)).toEqual(['c', 'a', 'b']);
  });

  it('is empty for nobody', () => {
    expect(payersFrom([], [expense('a', 100)])).toEqual([]);
  });
});
