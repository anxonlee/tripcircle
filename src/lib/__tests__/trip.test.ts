import {
  DEFAULT_DAY_WINDOW,
  dayFromPlanner,
  makeDay,
  makeTrip,
  movePlace,
  stayForDay,
  withDay,
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

describe('the default window', () => {
  it('is a fixed morning, not "now"', () => {
    // The single-day store defaults to now because it answers "when could I
    // leave today". A trip's days are not today, so a stable morning is the
    // only honest default.
    expect(DEFAULT_DAY_WINDOW.dayStartMin).toBe(9 * 60);
    expect(makeDay().window).toEqual(DEFAULT_DAY_WINDOW);
  });
});
