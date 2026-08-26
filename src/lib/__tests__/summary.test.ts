import type { Visit } from '../../domain/diary';
import type { CuratedPlace } from '../../domain/types';
import { periodRange, startOfWeek, summarize, summarizeWeek } from '../summary';

/**
 * The recap is the one screen that claims to describe the user's own year
 * back to them, so what it counts has to be exactly right — and the period
 * boundaries are where that goes wrong quietly.
 */

const place = (id: string, over: Partial<CuratedPlace> = {}): CuratedPlace => ({
  id,
  name: id,
  location: { latitude: 37.75, longitude: -122.42 },
  district: 'Mission',
  themes: ['food'],
  priceLevel: 1,
  priceBand: '$',
  avgCostUsd: 10,
  worthDetour: false,
  openHours: null,
  visitDurationMin: 45,
  ...over,
});

let seq = 0;
const visit = (placeId: string, at: Date, over: Partial<Visit> = {}): Visit => ({
  id: `v${seq++}`,
  placeId,
  timestamp: at.getTime(),
  wouldGoAgain: 'yes',
  ...over,
});

/** Local time throughout, because every boundary here is a local midnight. */
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h);

const PLACES = [
  place('a'),
  place('b', { district: 'Berkeley', themes: ['nature'] }),
  place('c', { district: 'Oakland', themes: ['cafe', 'food'] }),
];

describe('periodRange', () => {
  const now = at(2026, 8, 19).getTime(); // a Wednesday

  it('runs the week Monday to Monday', () => {
    const { startMs, endMs } = periodRange('week', now);
    expect(new Date(startMs).getDay()).toBe(1);
    expect(new Date(startMs).getDate()).toBe(17);
    expect(endMs - startMs).toBe(7 * 86_400_000);
    expect(startMs).toBe(startOfWeek(now));
  });

  it('runs the month from the first to the first', () => {
    const { startMs, endMs } = periodRange('month', now);
    expect(new Date(startMs).getDate()).toBe(1);
    expect(new Date(startMs).getMonth()).toBe(7); // August
    expect(new Date(endMs).getDate()).toBe(1);
    expect(new Date(endMs).getMonth()).toBe(8); // September
  });

  it('gives February the length February actually has', () => {
    // The reason this is not day arithmetic. 2028 is a leap year.
    const feb = periodRange('month', at(2028, 2, 10).getTime());
    expect((feb.endMs - feb.startMs) / 86_400_000).toBe(29);
    const nonLeap = periodRange('month', at(2026, 2, 10).getTime());
    expect((nonLeap.endMs - nonLeap.startMs) / 86_400_000).toBe(28);
  });

  it('ends the year at the turn, not 365 days later', () => {
    const { startMs, endMs } = periodRange('year', now);
    expect(new Date(startMs).getMonth()).toBe(0);
    expect(new Date(startMs).getDate()).toBe(1);
    expect(new Date(endMs).getFullYear()).toBe(2027);
    expect(new Date(endMs).getMonth()).toBe(0);
  });

  it('puts the last minute of the period inside it', () => {
    // Off-by-one at the far edge: a visit at 23:59 on the 31st belongs to
    // the month it happened in.
    const { startMs, endMs } = periodRange('month', at(2026, 8, 19).getTime());
    const lastMinute = at(2026, 8, 31, 23).getTime() + 59 * 60_000;
    expect(lastMinute).toBeGreaterThanOrEqual(startMs);
    expect(lastMinute).toBeLessThan(endMs);
  });
});

describe('summarize', () => {
  const now = at(2026, 8, 19).getTime();

  it('counts only what falls inside the window', () => {
    const visits = [
      visit('a', at(2026, 8, 18)), // this week
      visit('b', at(2026, 8, 10)), // this month, last week
      visit('c', at(2026, 3, 3)), // this year, earlier
      visit('a', at(2025, 12, 30)), // last year
    ];
    expect(summarize(PLACES, visits, 'week', now).visitCount).toBe(1);
    expect(summarize(PLACES, visits, 'month', now).visitCount).toBe(2);
    expect(summarize(PLACES, visits, 'year', now).visitCount).toBe(3);
  });

  it('reports which period it is', () => {
    // The screen renders a heading from this, so a summary that did not
    // know its own period could label a year as a week.
    expect(summarize(PLACES, [], 'year', now).period).toBe('year');
  });

  it('counts a place once however often it was stamped', () => {
    const visits = [
      visit('a', at(2026, 8, 17)),
      visit('a', at(2026, 8, 18)),
      visit('b', at(2026, 8, 19)),
    ];
    const s = summarize(PLACES, visits, 'week', now);
    expect(s.visitCount).toBe(3);
    expect(s.placeCount).toBe(2);
  });

  it('does not call a place new again in the longer period that contains it', () => {
    // The bug the wider windows invite: "new" has to mean new to the diary,
    // not new to the window.
    const visits = [
      visit('a', at(2026, 3, 2)), // first ever
      visit('a', at(2026, 8, 18)), // again, this week
    ];
    expect(summarize(PLACES, visits, 'week', now).newPlaceCount).toBe(0);
    expect(summarize(PLACES, visits, 'year', now).newPlaceCount).toBe(1);
  });

  it('gathers districts and themes across the window', () => {
    const visits = [visit('b', at(2026, 2, 2)), visit('c', at(2026, 7, 7))];
    const s = summarize(PLACES, visits, 'year', now);
    expect(s.districts.sort()).toEqual(['Berkeley', 'Oakland']);
    expect(s.themes.map((t) => t.theme).sort()).toEqual(['cafe', 'food', 'nature']);
  });

  it('lists only the places actually loved', () => {
    const visits = [
      visit('a', at(2026, 8, 18), { wouldGoAgain: 'no' }),
      visit('b', at(2026, 8, 18), { wouldGoAgain: 'maybe' }),
      visit('c', at(2026, 8, 18), { wouldGoAgain: 'yes' }),
    ];
    const s = summarize(PLACES, visits, 'week', now);
    expect(s.goAgain.map((p) => p.id)).toEqual(['c']);
  });

  it('takes the latest answer, so a later no removes a place', () => {
    const visits = [
      visit('a', at(2026, 8, 18, 10), { wouldGoAgain: 'yes' }),
      visit('a', at(2026, 8, 18, 20), { wouldGoAgain: 'no' }),
    ];
    expect(summarize(PLACES, visits, 'week', now).goAgain).toEqual([]);
  });

  it('takes the latest answer whichever order the log is in', () => {
    // The log is not promised to be sorted, and reading it as though it were
    // would make the answer depend on how the visits happened to be stored.
    const visits = [
      visit('a', at(2026, 8, 18, 20), { wouldGoAgain: 'yes' }),
      visit('a', at(2026, 8, 18, 10), { wouldGoAgain: 'no' }),
    ];
    expect(summarize(PLACES, visits, 'week', now).goAgain.map((p) => p.id)).toEqual([
      'a',
    ]);
  });

  it('judges a later no only against answers inside the period', () => {
    // The no is last overall, but it is not in this week — so the week still
    // reports what was said in it.
    const visits = [
      visit('a', at(2026, 8, 18), { wouldGoAgain: 'yes' }),
      visit('a', at(2026, 8, 29), { wouldGoAgain: 'no' }),
    ];
    const week = summarize(PLACES, visits, 'week', now);
    expect(week.goAgain.map((p) => p.id)).toEqual(['a']);
  });

  it('counts photos, not visits with photos twice', () => {
    const visits = [
      visit('a', at(2026, 8, 18), { photoUri: 'file://1' }),
      visit('a', at(2026, 8, 18)),
    ];
    expect(summarize(PLACES, visits, 'week', now).photoCount).toBe(1);
  });

  it('is empty rather than broken when nothing was stamped', () => {
    const s = summarize(PLACES, [], 'month', now);
    expect(s.visitCount).toBe(0);
    expect(s.placeCount).toBe(0);
    expect(s.districts).toEqual([]);
    expect(s.goAgain).toEqual([]);
  });

  it('ignores a visit to a place the build no longer carries', () => {
    // A place can leave the dataset, or be one the user put away. The visit
    // still counts as a visit; it just cannot contribute a district.
    const s = summarize(PLACES, [visit('gone', at(2026, 8, 18))], 'week', now);
    expect(s.visitCount).toBe(1);
    expect(s.districts).toEqual([]);
  });

  it('still agrees with summarizeWeek', () => {
    const visits = [visit('a', at(2026, 8, 18)), visit('b', at(2026, 8, 10))];
    expect(summarizeWeek(PLACES, visits, now)).toEqual(
      summarize(PLACES, visits, 'week', now)
    );
  });

  it('counts who you were with, commonest first', () => {
    const visits = [
      visit('a', at(2026, 8, 17), { contextTags: { companion: 'friends' } }),
      visit('b', at(2026, 8, 18), { contextTags: { companion: 'friends' } }),
      visit('c', at(2026, 8, 19), { contextTags: { companion: 'solo' } }),
    ];
    expect(summarize(PLACES, visits, 'week', now).companions).toEqual([
      { companion: 'friends', count: 2 },
      { companion: 'solo', count: 1 },
    ]);
  });

  it('does not invent a category for visits that said nothing', () => {
    // Unset means the user did not say, which is not the same as alone.
    const visits = [
      visit('a', at(2026, 8, 17)),
      visit('b', at(2026, 8, 18), { contextTags: { pace: 'relaxed' } }),
      visit('c', at(2026, 8, 19), { contextTags: { companion: 'date' } }),
    ];
    expect(summarize(PLACES, visits, 'week', now).companions).toEqual([
      { companion: 'date', count: 1 },
    ]);
  });

  it('still counts the company when the place has gone', () => {
    const visits = [
      visit('gone', at(2026, 8, 18), { contextTags: { companion: 'family' } }),
    ];
    const s = summarize(PLACES, visits, 'week', now);
    expect(s.districts).toEqual([]);
    expect(s.companions).toEqual([{ companion: 'family', count: 1 }]);
  });

  it('carries the forward hook whatever the period', () => {
    // Overdue is about the place, not the window — a year's recap should
    // still say what has gone unvisited.
    const visits = [visit('a', at(2026, 1, 2), { wouldGoAgain: 'yes' })];
    for (const period of ['week', 'month', 'year'] as const) {
      expect(summarize(PLACES, visits, period, now).overdue?.place.id).toBe('a');
    }
  });
});
