import {
  DATASET_CITY,
  MAX_LINK_DAYS,
  decodeTripLink,
  encodeTripLink,
  unresolvedTripCount,
  type SharedTrip,
} from '../tripLink';
import { LATEST_HOME_BY_MIN } from '../planner';

/**
 * The trip link is the day link's promises, once per day, plus two of its
 * own: day numbering survives the journey, and stays never make it in — the
 * encoder has no field for one, which these tests pin by round-tripping a
 * trip and checking the URL's whole vocabulary.
 */

const KNOWN = new Set(['a', 'b', 'c', 'd-place']);

const trip = (over: Partial<SharedTrip> = {}): SharedTrip => ({
  city: DATASET_CITY,
  name: 'SF weekend',
  days: [
    {
      placeIds: ['a', 'b'],
      window: { dayStartMin: 540, homeByMin: 1200 },
      goal: 'balanced',
      pinnedTimes: { b: 780 },
    },
    {
      placeIds: ['c'],
      window: { dayStartMin: 600, homeByMin: 1230 },
      goal: 'fastest',
    },
  ],
  ...over,
});

describe('encodeTripLink / decodeTripLink', () => {
  it('round-trips a trip: days, windows, goals, pins, name', () => {
    const out = decodeTripLink(encodeTripLink(trip()), KNOWN);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.trip.name).toBe('SF weekend');
    expect(out.trip.days).toHaveLength(2);
    expect(out.trip.days[0].placeIds).toEqual(['a', 'b']);
    expect(out.trip.days[0].pinnedTimes).toEqual({ b: 780 });
    expect(out.trip.days[1].goal).toBe('fastest');
    expect(out.trip.days[1].window).toEqual({ dayStartMin: 600, homeByMin: 1230 });
  });

  it('never carries a stay, in any spelling', () => {
    // The encoder has no field for one; the URL must not either.
    const url = encodeTripLink(trip());
    expect(url).not.toMatch(/stay|hotel|anchor|lat|lng|s\d=/i);
  });

  it('skips empty days when encoding — a shared trip is its content', () => {
    const out = decodeTripLink(
      encodeTripLink(
        trip({
          days: [
            { placeIds: [], window: { dayStartMin: 540, homeByMin: 1200 }, goal: 'balanced' },
            { placeIds: ['a'], window: { dayStartMin: 540, homeByMin: 1200 }, goal: 'balanced' },
          ],
        })
      ),
      KNOWN
    );
    expect(out.ok && out.trip.days).toHaveLength(1);
  });

  it('keeps a day whose places are all unknown, so numbering holds', () => {
    // "Day 2" in the sender's message must keep meaning day 2 even when
    // this build cannot resolve day 1.
    const url = encodeTripLink(
      trip({
        days: [
          { placeIds: ['zz-unknown'], window: { dayStartMin: 540, homeByMin: 1200 }, goal: 'balanced' },
          { placeIds: ['a'], window: { dayStartMin: 540, homeByMin: 1200 }, goal: 'balanced' },
        ],
      })
    );
    // 'zz-unknown' is a valid slug this build does not carry.
    const out = decodeTripLink(url, KNOWN);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.trip.days).toHaveLength(2);
    expect(out.trip.days[0].placeIds).toEqual([]);
    expect(out.trip.days[1].placeIds).toEqual(['a']);
  });

  it('refuses a trip in which nothing at all resolved', () => {
    const url = encodeTripLink(
      trip({ days: [{ placeIds: ['zz'], window: { dayStartMin: 540, homeByMin: 1200 }, goal: 'balanced' }] })
    );
    const out = decodeTripLink(url, KNOWN);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason.kind).toBe('empty');
  });

  it('is not read by the day decoder, nor a day link by this one', () => {
    expect(decodeTripLink('pirtsf://d?v=1&c=sf&p=a', KNOWN).ok).toBe(false);
  });

  it('refuses a newer version and a different city by name', () => {
    const tooNew = decodeTripLink(
      encodeTripLink(trip()).replace('v=1', 'v=99'),
      KNOWN
    );
    expect(!tooNew.ok && tooNew.reason.kind).toBe('tooNew');
    const hk = decodeTripLink(
      encodeTripLink(trip()).replace('c=sf', 'c=hk'),
      KNOWN
    );
    expect(!hk.ok && hk.reason.kind).toBe('otherCity');
  });

  it('survives a name that needs escaping, and a mangled one', () => {
    const out = decodeTripLink(
      encodeTripLink(trip({ name: 'Tokyo & back — 100%' })),
      KNOWN
    );
    expect(out.ok && out.trip.name).toBe('Tokyo & back — 100%');
    const mangled = decodeTripLink(
      encodeTripLink(trip()).replace(/n=[^&]*/, 'n=%E0%A4%A'),
      KNOWN
    );
    expect(mangled.ok && mangled.trip.name).toBe('Shared trip');
  });

  it('clamps a nonsense window instead of importing it', () => {
    const out = decodeTripLink(
      encodeTripLink(trip()).replace('w0=540-1200', 'w0=540-90000'),
      KNOWN
    );
    expect(out.ok && out.trip.days[0].window.homeByMin).toBe(LATEST_HOME_BY_MIN);
  });

  it('caps the day count rather than reading forever', () => {
    const many = Array.from({ length: 40 }, () => ({
      placeIds: ['a'],
      window: { dayStartMin: 540, homeByMin: 1200 },
      goal: 'balanced' as const,
    }));
    const out = decodeTripLink(encodeTripLink(trip({ days: many })), KNOWN);
    expect(out.ok && out.trip.days.length).toBe(MAX_LINK_DAYS);
  });

  it('counts unresolved places across every day, deduplicated within one', () => {
    const url = encodeTripLink(
      trip({
        days: [
          { placeIds: ['a', 'zz-one'], window: { dayStartMin: 540, homeByMin: 1200 }, goal: 'balanced' },
          { placeIds: ['zz-two', 'b'], window: { dayStartMin: 540, homeByMin: 1200 }, goal: 'balanced' },
        ],
      })
    );
    expect(unresolvedTripCount(url, KNOWN)).toBe(2);
  });
});
