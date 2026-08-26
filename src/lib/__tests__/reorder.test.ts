import { offsetOf, slotAt } from '../reorder';

/**
 * The plan's stops are not uniform rows — one carrying two warnings is twice
 * the height of a bare one — and every bug this arithmetic has had came from
 * assuming they were.
 */

/** Three rows: a short one, a tall one, a short one. */
const HEIGHTS = { a: 60, b: 140, c: 60, d: 60 };

describe('offsetOf', () => {
  it('is the heights of everything before the slot', () => {
    expect(offsetOf(['a', 'b', 'c'], HEIGHTS, 0)).toBe(0);
    expect(offsetOf(['a', 'b', 'c'], HEIGHTS, 1)).toBe(60);
    expect(offsetOf(['a', 'b', 'c'], HEIGHTS, 2)).toBe(200);
  });

  it('treats a row it has not measured as taking no room', () => {
    // Heights arrive from onLayout, so the first frame can ask before every
    // row has reported. Zero is the only answer that cannot move anything.
    expect(offsetOf(['a', 'unknown', 'c'], HEIGHTS, 3)).toBe(120);
  });
});

describe('slotAt', () => {
  it('leaves a row where it is when it has not moved', () => {
    // The one case that must hold whatever the heights are: a grip brushed in
    // passing must not rearrange the day. The tall row is the interesting one
    // — measured from its centre it used to report the slot below itself.
    expect(slotAt(['b', 'c'], HEIGHTS, 0)).toBe(0); // a, at its own top
    expect(slotAt(['a', 'c'], HEIGHTS, 60)).toBe(1); // b, likewise
    expect(slotAt(['a', 'b'], HEIGHTS, 200)).toBe(2); // c, likewise
  });

  it('asks for half the neighbour below before giving up a place', () => {
    // 'a' dragged down past 'b', which is 140 tall: 70 is the boundary.
    expect(slotAt(['b', 'c'], HEIGHTS, 69)).toBe(0);
    expect(slotAt(['b', 'c'], HEIGHTS, 71)).toBe(1);
  });

  it('asks for half the neighbour above, which is the same price', () => {
    // 'c' starts at 200 and is dragged up past 'b'. Half of 140 again.
    expect(slotAt(['a', 'b'], HEIGHTS, 200 - 69)).toBe(2);
    expect(slotAt(['a', 'b'], HEIGHTS, 200 - 71)).toBe(1);
  });

  it('costs the same in both directions across the same neighbour', () => {
    // The bug this replaces: down took a nudge and up took a whole row.
    const rest = ['a', 'c'];
    const downFromFirst = slotAt(['c', 'd'], HEIGHTS, 31); // past c (60)
    const upFromSecond = slotAt(rest, HEIGHTS, 60 - 31); // past a (60)
    expect(downFromFirst).toBe(1);
    expect(upFromSecond).toBe(0);
  });

  it('clamps to the ends rather than running off them', () => {
    expect(slotAt(['b', 'c'], HEIGHTS, -400)).toBe(0);
    expect(slotAt(['a', 'b'], HEIGHTS, 4000)).toBe(2);
  });

  it('keeps the earlier slot when a row sits exactly on the boundary', () => {
    // A finger holding still halfway across a neighbour must not leave the
    // gap flickering between two places.
    expect(slotAt(['b', 'c'], HEIGHTS, 70)).toBe(0);
    expect(slotAt(['b', 'c'], HEIGHTS, 70)).toBe(slotAt(['b', 'c'], HEIGHTS, 70));
  });

  it('has somewhere to put the only row in the list', () => {
    expect(slotAt([], HEIGHTS, 0)).toBe(0);
    expect(slotAt([], HEIGHTS, 500)).toBe(0);
  });
});
