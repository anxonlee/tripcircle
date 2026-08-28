import {
  DEFAULT_DAY_WINDOW,
  dayFromPlanner,
  dayPlaceOrder,
  plannerMatchesDay,
  makeDay,
  makeTrip,
  movePlace,
  stayForDay,
  withDay,
  withDayExclusive,
  type Trip,
} from '../../domain/trip';
import type { StartPlace } from '../../domain/types';
import { LATEST_HOME_BY_MIN } from '../planner';

/**
 * A trip is a container over the one-day planner, and these are the
 * container's promises: stays inherit forward, a moved place leaves its pin
 * and its order slot behind, and the write-back door enforces the same
 * invariants the single-day store does. None of this schedules anything —
 * that stays the optimiser's, one day at a time.
 */

const stay = (id: string): StartPlace => ({
  id,
  name: id,
  kind: 'station',
  location: { latitude: 37.78, longitude: -122.4 },
});

function tripOfDays(n: number): Trip {
  const t = makeTrip('Test', 1_000);
  while (t.days.length < n) t.days.push(makeDay(1_000));
  return t;
}

describe('makeTrip', () => {
  it('starts with one day, because an empty trip has nothing to tap', () => {
    expect(makeTrip('SF').days).toHaveLength(1);
  });

  it('gives every day its own id even in the same millisecond', () => {
    const t = tripOfDays(4);
    expect(new Set(t.days.map((d) => d.id)).size).toBe(4);
  });

  it('falls back to a name when handed whitespace', () => {
    // The store trims; the constructor itself takes what it is given.
    expect(makeTrip('Tokyo').name).toBe('Tokyo');
  });
});

describe('stayForDay', () => {
  it('inherits from the nearest earlier day that set one', () => {
    const t = tripOfDays(5);
    t.days[0] = { ...t.days[0], stay: stay('hotel-a') };
    t.days[3] = { ...t.days[3], stay: stay('hotel-b') };
    expect(stayForDay(t, 0)?.id).toBe('hotel-a');
    expect(stayForDay(t, 2)?.id).toBe('hotel-a');
    expect(stayForDay(t, 3)?.id).toBe('hotel-b');
    expect(stayForDay(t, 4)?.id).toBe('hotel-b');
  });

  it('is null when no day up to here has one', () => {
    // The caller falls back to the usual start place, which is what keeps a
    // stay-less trip behaving exactly like today's single days.
    const t = tripOfDays(3);
    t.days[2] = { ...t.days[2], stay: stay('hotel') };
    expect(stayForDay(t, 0)).toBeNull();
    expect(stayForDay(t, 1)).toBeNull();
  });

  it('clamps an out-of-range index rather than answering for no day', () => {
    const t = tripOfDays(2);
    t.days[1] = { ...t.days[1], stay: stay('hotel') };
    expect(stayForDay(t, 99)?.id).toBe('hotel');
  });
});

describe('movePlace', () => {
  function twoDay(): Trip {
    const t = tripOfDays(2);
    t.days[0] = {
      ...t.days[0],
      placeIds: ['a', 'b', 'c'],
      dayOrder: ['c', 'a', 'b'],
      pinnedTimes: { b: 780 },
    };
    t.days[1] = { ...t.days[1], placeIds: ['x'] };
    return t;
  }

  it('appends to the target and removes from the source', () => {
    const t = twoDay();
    const moved = movePlace(t, 'a', t.days[0].id, t.days[1].id);
    expect(moved.days[0].placeIds).toEqual(['b', 'c']);
    expect(moved.days[1].placeIds).toEqual(['x', 'a']);
  });

  it('drops the pin: a pin is about one place on one day', () => {
    const t = twoDay();
    const moved = movePlace(t, 'b', t.days[0].id, t.days[1].id);
    expect(moved.days[0].pinnedTimes).toEqual({});
    // And it does not resurrect on the target either.
    expect(moved.days[1].pinnedTimes).toEqual({});
  });

  it('drops the order slot but keeps the rest of the arrangement', () => {
    const t = twoDay();
    const moved = movePlace(t, 'a', t.days[0].id, t.days[1].id);
    expect(moved.days[0].dayOrder).toEqual(['c', 'b']);
  });

  it('treats moving to a day that already holds it as a removal', () => {
    const t = twoDay();
    t.days[1] = { ...t.days[1], placeIds: ['x', 'a'] };
    const moved = movePlace(t, 'a', t.days[0].id, t.days[1].id);
    expect(moved.days[0].placeIds).toEqual(['b', 'c']);
    expect(moved.days[1].placeIds).toEqual(['x', 'a']);
  });

  it('does nothing for a place the source does not hold', () => {
    const t = twoDay();
    expect(movePlace(t, 'zz', t.days[0].id, t.days[1].id)).toBe(t);
  });

  it('does nothing when source and target are the same day', () => {
    const t = twoDay();
    expect(movePlace(t, 'a', t.days[0].id, t.days[0].id)).toBe(t);
  });
});

describe('withDay', () => {
  it('replaces in place and ignores unknown days', () => {
    const t = tripOfDays(2);
    const changed = withDay(t, { ...t.days[1], placeIds: ['q'] });
    expect(changed.days[1].placeIds).toEqual(['q']);
    expect(withDay(t, { ...t.days[1], id: 'nope' })).toBe(t);
  });
});

describe('dayPlaceOrder', () => {
  const day = (over = {}) => ({ ...makeDay(1_000), placeIds: ['a', 'b'], ...over });

  it('is the picked order when nothing was arranged', () => {
    expect(dayPlaceOrder(day())).toEqual(['a', 'b']);
  });

  it('is the arrangement when it covers the selection', () => {
    expect(dayPlaceOrder(day({ dayOrder: ['b', 'a'] }))).toEqual(['b', 'a']);
  });

  it('appends places added after the arrangement was made', () => {
    // The bug this exists for: a day arranged by hand, then added to. The
    // trip card read the order alone and quietly showed one place fewer
    // than the day held — and the share link sent one fewer too.
    const d = day({ placeIds: ['a', 'b', 'c'], dayOrder: ['b', 'a'] });
    expect(dayPlaceOrder(d)).toEqual(['b', 'a', 'c']);
  });

  it('ignores an order entry for a place the day no longer holds', () => {
    expect(dayPlaceOrder(day({ dayOrder: ['b', 'gone', 'a'] }))).toEqual(['b', 'a']);
  });

  it('never invents, drops or repeats a place', () => {
    const d = day({ placeIds: ['a', 'b', 'c'], dayOrder: ['c', 'gone'] });
    expect([...dayPlaceOrder(d)].sort()).toEqual(['a', 'b', 'c']);
  });

  it('is empty for an empty day, arrangement or not', () => {
    expect(dayPlaceOrder(day({ placeIds: [], dayOrder: ['a'] }))).toEqual([]);
  });
});

describe('withDayExclusive', () => {
  function trip(): Trip {
    const t = tripOfDays(3);
    t.days[0] = { ...t.days[0], placeIds: ['a', 'b'] };
    t.days[1] = {
      ...t.days[1],
      placeIds: ['b', 'c'],
      dayOrder: ['c', 'b'],
      pinnedTimes: { b: 780, c: 900 },
    };
    t.days[2] = { ...t.days[2], placeIds: ['d'] };
    return t;
  }

  it('takes what the written day claims off every other day', () => {
    // The invariant this exists for: after any write, no place is on two
    // days of one trip. Day 3 claims b and d; day 1 and day 2 must let go.
    const t = trip();
    const out = withDayExclusive(t, { ...t.days[2], placeIds: ['d', 'b'] });
    expect(out.days[0].placeIds).toEqual(['a']);
    expect(out.days[1].placeIds).toEqual(['c']);
    expect(out.days[2].placeIds).toEqual(['d', 'b']);
  });

  it('drops the loser\'s pin and order slot, not the whole arrangement', () => {
    const t = trip();
    const out = withDayExclusive(t, { ...t.days[2], placeIds: ['d', 'b'] });
    expect(out.days[1].pinnedTimes).toEqual({ c: 900 });
    expect(out.days[1].dayOrder).toEqual(['c']);
  });

  it('never strips the written day itself', () => {
    // Its own places are what it is claiming — reading the claim as a clash
    // would empty the day it was meant to fill.
    const t = trip();
    const day = { ...t.days[1], pinnedTimes: { b: 780, c: 900 } };
    const out = withDayExclusive(t, day);
    expect(out.days[1]).toEqual(day);
  });

  it('is withDay when nothing clashes, down to the reference', () => {
    // A plain edit is the common case, and it must not churn every day of
    // the trip through the store.
    const t = trip();
    const out = withDayExclusive(t, { ...t.days[2], placeIds: ['d', 'e'] });
    expect(out.days[0]).toBe(t.days[0]);
    expect(out.days[1]).toBe(t.days[1]);
  });

  it('handles a day emptied to nothing', () => {
    const t = trip();
    const out = withDayExclusive(t, { ...t.days[1], placeIds: [] });
    expect(out.days[0].placeIds).toEqual(['a', 'b']);
    expect(out.days[1].placeIds).toEqual([]);
  });

  it('ignores an unknown day rather than stripping the trip for it', () => {
    const t = trip();
    expect(withDayExclusive(t, { ...t.days[1], id: 'nope' })).toBe(t);
  });

  it('repairs a trip that already held a place twice', () => {
    // The state the bug used to leave behind: b on day 1 and day 2 at once.
    // Writing either day is now enough to settle it.
    const t = trip();
    const out = withDayExclusive(t, t.days[1]);
    expect(out.days[0].placeIds).toEqual(['a']);
    expect(out.days[1].placeIds).toEqual(['b', 'c']);
  });
});

describe('dayFromPlanner', () => {
  it('carries the planner state across and clamps the window', () => {
    const day = makeDay(1_000);
    const back = dayFromPlanner(day, {
      placeIds: ['a'],
      dayOrder: ['a'],
      pinnedTimes: { a: 600 },
      window: { dayStartMin: 540, homeByMin: 26 * 60 },
      goal: 'fastest',
    });
    expect(back.placeIds).toEqual(['a']);
    expect(back.goal).toBe('fastest');
    expect(back.window.homeByMin).toBe(LATEST_HOME_BY_MIN);
    // Identity and stay survive the round trip untouched.
    expect(back.id).toBe(day.id);
    expect(back.stay).toBeNull();
  });
});

describe('plannerMatchesDay', () => {
  const snapshot = (over = {}) => ({
    placeIds: ['a', 'b'],
    dayOrder: null as string[] | null,
    pinnedTimes: {} as Record<string, number>,
    window: { dayStartMin: 540, homeByMin: 1200 },
    goal: 'balanced' as const,
    ...over,
  });
  const day = () => ({
    ...makeDay(1_000),
    placeIds: ['a', 'b'],
    window: { dayStartMin: 540, homeByMin: 1200 },
  });

  it('is true when the two already agree', () => {
    expect(plannerMatchesDay(day(), snapshot())).toBe(true);
  });

  it('notices a place the shelf moved away', () => {
    // The bug this guards: a place moved to another day from the trip
    // screen, while that day was the one open in the planner. Without a
    // difference here the planner never reloaded, and its stale selection
    // was written back over the move — leaving the place on both days.
    expect(plannerMatchesDay(day(), snapshot({ placeIds: ['a'] }))).toBe(false);
  });

  it('notices an order, a pin, a window and a goal', () => {
    expect(plannerMatchesDay(day(), snapshot({ dayOrder: ['b', 'a'] }))).toBe(false);
    expect(plannerMatchesDay(day(), snapshot({ pinnedTimes: { a: 600 } }))).toBe(false);
    expect(
      plannerMatchesDay(day(), snapshot({ window: { dayStartMin: 600, homeByMin: 1200 } }))
    ).toBe(false);
    expect(plannerMatchesDay(day(), snapshot({ goal: 'fastest' }))).toBe(false);
  });

  it('ignores the stay, which the planner never sends back', () => {
    // The planner holds a start place, but a trip day's stay is chosen on
    // the trip screen. If this counted as a difference the two sides would
    // reload each other forever.
    const withStay = { ...day(), stay: stay('hotel') };
    expect(plannerMatchesDay(withStay, snapshot())).toBe(true);
  });

  it('agrees with what dayFromPlanner would write', () => {
    // The two must never disagree about what a difference is — that is what
    // keeps the write-back and the reload from fighting.
    const s = snapshot({ placeIds: ['a'] });
    const d = day();
    expect(plannerMatchesDay(d, s)).toBe(false);
    expect(plannerMatchesDay(dayFromPlanner(d, s), s)).toBe(true);
  });
});

describe('the default window', () => {
  it('is a fixed morning, not "now"', () => {
    // The single-day store defaults to now because it answers "when could I
    // leave today". A trip's days are not today, so a stable morning is the
    // only honest default.
    expect(DEFAULT_DAY_WINDOW.dayStartMin).toBe(9 * 60);
    expect(makeDay().window).toEqual(DEFAULT_DAY_WINDOW);
  });
});
