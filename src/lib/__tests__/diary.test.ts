import {
  aggregateAll,
  aggregateVisits,
  buildWallCards,
  canEditVisit,
  editWindowLeft,
  EDIT_WINDOW_MS,
  FORGOTTEN_PLACE_LABEL,
  newVisitId,
  visitPlaceName,
  visitTimeline,
  type Visit,
} from '../../domain/diary';
import type { CuratedPlace } from '../../domain/types';

const NOW = Date.UTC(2026, 7, 19, 12);
const DAY = 86_400_000;

let seq = 0;
const visit = (over: Partial<Visit> = {}): Visit => ({
  id: `v${seq++}`,
  placeId: 'a',
  timestamp: NOW - DAY,
  wouldGoAgain: 'yes',
  ...over,
});

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

describe('aggregateVisits', () => {
  it('is null for a place with no visits', () => {
    expect(aggregateVisits('nobody', [visit()], NOW)).toBeNull();
  });

  it('counts answers, ratings and photos', () => {
    const stats = aggregateVisits(
      'a',
      [
        visit({ wouldGoAgain: 'yes', rating: 5, photoUri: 'file://1' }),
        visit({ wouldGoAgain: 'no', rating: 3 }),
        visit({ wouldGoAgain: 'yes' }),
      ],
      NOW
    )!;
    expect(stats.visitCount).toBe(3);
    expect(stats.goAgain).toEqual({ yes: 2, maybe: 0, no: 1 });
    expect(stats.avgRating).toBe(4);
    expect(stats.photoCount).toBe(1);
  });

  it('has no average when nobody rated anything', () => {
    // Not zero: zero is a rating, absent is not.
    expect(aggregateVisits('a', [visit()], NOW)!.avgRating).toBeNull();
  });

  it('counts a zero rating rather than treating it as absent', () => {
    expect(aggregateVisits('a', [visit({ rating: 0 })], NOW)!.avgRating).toBe(0);
  });

  it('takes the latest timestamp, whatever order the log is in', () => {
    const stats = aggregateVisits(
      'a',
      [
        visit({ timestamp: NOW - 10 * DAY }),
        visit({ timestamp: NOW - 2 * DAY }),
        visit({ timestamp: NOW - 30 * DAY }),
      ],
      NOW
    )!;
    expect(stats.lastVisitedAt).toBe(NOW - 2 * DAY);
    expect(stats.daysSinceLastVisit).toBe(2);
  });

  it('never reports a negative recency for a visit in the future', () => {
    const stats = aggregateVisits('a', [visit({ timestamp: NOW + 5 * DAY })], NOW)!;
    expect(stats.daysSinceLastVisit).toBe(0);
  });

  it('survives an answer the app does not recognise', () => {
    // A restored backup is an untrusted file, and `goAgain[answer] += 1` on
    // an unknown key produces NaN counts that spread into the planner.
    const stats = aggregateVisits(
      'a',
      [visit({ wouldGoAgain: 'definitely' as never }), visit({ wouldGoAgain: 'yes' })],
      NOW
    )!;
    expect(stats.visitCount).toBe(2);
    expect(stats.goAgain.yes).toBe(1);
    expect(Number.isNaN(stats.goAgain.maybe)).toBe(false);
    expect(Object.values(stats.goAgain).every(Number.isFinite)).toBe(true);
  });
});

describe('aggregateAll', () => {
  it('keys every visited place and omits the rest', () => {
    const all = aggregateAll(
      [visit({ placeId: 'a' }), visit({ placeId: 'b' }), visit({ placeId: 'a' })],
      NOW
    );
    expect([...all.keys()].sort()).toEqual(['a', 'b']);
    expect(all.get('a')!.visitCount).toBe(2);
  });

  it('is empty for an empty log', () => {
    expect(aggregateAll([], NOW).size).toBe(0);
  });
});

describe('visitTimeline', () => {
  it('is newest first', () => {
    const older = visit({ timestamp: NOW - 5 * DAY });
    const newer = visit({ timestamp: NOW - DAY });
    expect(visitTimeline('a', [older, newer]).map((v) => v.id)).toEqual([
      newer.id,
      older.id,
    ]);
  });

  it('holds only the place asked for', () => {
    const mine = visit({ placeId: 'a' });
    expect(visitTimeline('a', [mine, visit({ placeId: 'b' })])).toEqual([mine]);
  });
});

describe('canEditVisit', () => {
  it('allows an edit inside the window and refuses one past it', () => {
    expect(canEditVisit(visit({ timestamp: NOW - 1000 }), NOW)).toBe(true);
    expect(canEditVisit(visit({ timestamp: NOW - EDIT_WINDOW_MS - 1 }), NOW)).toBe(
      false
    );
  });

  it('closes exactly at the boundary', () => {
    expect(canEditVisit(visit({ timestamp: NOW - EDIT_WINDOW_MS }), NOW)).toBe(false);
  });

  it('reports the time left, floored at zero', () => {
    expect(editWindowLeft(visit({ timestamp: NOW }), NOW)).toBe(EDIT_WINDOW_MS);
    expect(editWindowLeft(visit({ timestamp: NOW - 10 * DAY }), NOW)).toBe(0);
  });
});

describe('visitPlaceName', () => {
  it('prefers the live record, so a rename shows through', () => {
    expect(visitPlaceName(visit({ placeName: 'Old Name' }), place('a', { name: 'New Name' }))).toBe(
      'New Name'
    );
  });

  it('falls back to what the visit stored', () => {
    expect(visitPlaceName(visit({ placeName: 'Stored' }), undefined)).toBe('Stored');
  });

  it('treats a blank name as absent rather than rendering nothing', () => {
    expect(visitPlaceName(visit({ placeName: '   ' }), undefined)).toBe(
      FORGOTTEN_PLACE_LABEL
    );
    expect(visitPlaceName(visit({ placeName: 'Stored' }), place('a', { name: '  ' }))).toBe(
      'Stored'
    );
  });

  it('admits the loss rather than calling the place unknown', () => {
    expect(visitPlaceName(visit({ placeName: undefined }), undefined)).toBe(
      FORGOTTEN_PLACE_LABEL
    );
  });
});

describe('buildWallCards', () => {
  it('drops a stamped place the dataset no longer carries', () => {
    const cards = buildWallCards([place('a')], [visit({ placeId: 'a' }), visit({ placeId: 'gone' })], NOW);
    expect(cards.map((c) => c.place.id)).toEqual(['a']);
  });

  it('is newest first', () => {
    const cards = buildWallCards(
      [place('a'), place('b')],
      [
        visit({ placeId: 'a', timestamp: NOW - 9 * DAY }),
        visit({ placeId: 'b', timestamp: NOW - DAY }),
      ],
      NOW
    );
    expect(cards.map((c) => c.place.id)).toEqual(['b', 'a']);
  });

  it('shows the latest visit on the card', () => {
    const latest = visit({ placeId: 'a', timestamp: NOW - DAY, note: 'the newest' });
    const cards = buildWallCards(
      [place('a')],
      [visit({ placeId: 'a', timestamp: NOW - 8 * DAY }), latest],
      NOW
    );
    expect(cards[0].latestVisit.id).toBe(latest.id);
  });
});

describe('newVisitId', () => {
  it('does not collide within a millisecond', () => {
    const ids = new Set(Array.from({ length: 500 }, () => newVisitId()));
    expect(ids.size).toBe(500);
  });
});
