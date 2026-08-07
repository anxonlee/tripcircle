import {
  aggregateAll,
  aggregateVisits,
  buildWallCards,
  newVisitId,
  visitTimeline,
  type Visit,
} from '../diary';
import { bayAreaPlaces } from '../../services/mock/bayAreaPlaces';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 6, 27, 12, 0, 0);

function visit(
  placeId: string,
  daysAgo: number,
  overrides: Partial<Visit> = {}
): Visit {
  return {
    id: `v-${placeId}-${daysAgo}`,
    placeId,
    timestamp: NOW - daysAgo * DAY,
    wouldGoAgain: 'yes',
    ...overrides,
  };
}

describe('visit aggregation', () => {
  it('returns null for a place with no visits', () => {
    expect(aggregateVisits('la-taqueria', [], NOW)).toBeNull();
  });

  it('counts visits and derives recency from the most recent one', () => {
    const visits = [
      visit('la-taqueria', 30),
      visit('la-taqueria', 3),
      visit('la-taqueria', 12),
    ];
    const stats = aggregateVisits('la-taqueria', visits, NOW)!;
    expect(stats.visitCount).toBe(3);
    expect(stats.lastVisitedAt).toBe(NOW - 3 * DAY);
    expect(stats.daysSinceLastVisit).toBe(3);
  });

  it('ignores visits belonging to other places', () => {
    const visits = [visit('la-taqueria', 1), visit('dolores-park', 1)];
    expect(aggregateVisits('la-taqueria', visits, NOW)!.visitCount).toBe(1);
  });

  it('tallies would-go-again per answer', () => {
    const visits = [
      visit('coit-tower', 5, { wouldGoAgain: 'yes' }),
      visit('coit-tower', 4, { wouldGoAgain: 'no' }),
      visit('coit-tower', 3, { wouldGoAgain: 'yes' }),
      visit('coit-tower', 2, { wouldGoAgain: 'maybe' }),
    ];
    const stats = aggregateVisits('coit-tower', visits, NOW)!;
    expect(stats.goAgain).toEqual({ yes: 2, maybe: 1, no: 1 });
  });

  it('averages only the visits that carried a rating', () => {
    const visits = [
      visit('sfmoma', 5, { rating: 5 }),
      visit('sfmoma', 4), // no rating — must not count as zero
      visit('sfmoma', 3, { rating: 3 }),
    ];
    const stats = aggregateVisits('sfmoma', visits, NOW)!;
    expect(stats.avgRating).toBe(4);
  });

  it('reports null average when no visit was rated', () => {
    expect(aggregateVisits('sfmoma', [visit('sfmoma', 1)], NOW)!.avgRating).toBeNull();
  });

  it('counts photos across visits', () => {
    const visits = [
      visit('ferry-building', 2, { photoUri: 'file:///a.jpg' }),
      visit('ferry-building', 1),
    ];
    expect(aggregateVisits('ferry-building', visits, NOW)!.photoCount).toBe(1);
  });
});

describe('per-visit notes (the Place/Visit split)', () => {
  it('keeps a separate note for every visit to the same place', () => {
    const visits = [
      visit('dolores-park', 10, { note: 'too crowded' }),
      visit('dolores-park', 2, { note: 'got the super burrito' }),
    ];
    const timeline = visitTimeline('dolores-park', visits);
    expect(timeline.map((v) => v.note)).toEqual([
      'got the super burrito',
      'too crowded',
    ]);
  });

  it('orders a timeline newest first', () => {
    const visits = [
      visit('dolores-park', 1),
      visit('dolores-park', 20),
      visit('dolores-park', 7),
    ];
    const days = visitTimeline('dolores-park', visits).map(
      (v) => Math.round((NOW - v.timestamp) / DAY)
    );
    expect(days).toEqual([1, 7, 20]);
  });
});

describe('aggregateAll', () => {
  it('keys stats by place and covers every stamped place', () => {
    const visits = [
      visit('la-taqueria', 1),
      visit('la-taqueria', 9),
      visit('coit-tower', 4),
    ];
    const all = aggregateAll(visits, NOW);
    expect([...all.keys()].sort()).toEqual(['coit-tower', 'la-taqueria']);
    expect(all.get('la-taqueria')!.visitCount).toBe(2);
  });

  it('is empty for an empty diary (the day-one state)', () => {
    expect(aggregateAll([], NOW).size).toBe(0);
  });
});

describe('wall cards', () => {
  it('builds one card per stamped place, newest first', () => {
    const visits = [
      visit('coit-tower', 8),
      visit('la-taqueria', 2),
      visit('dolores-park', 30),
    ];
    const cards = buildWallCards(bayAreaPlaces, visits, NOW);
    expect(cards.map((c) => c.place.id)).toEqual([
      'la-taqueria',
      'coit-tower',
      'dolores-park',
    ]);
  });

  it('shows the most recent visit on the card', () => {
    const visits = [
      visit('la-taqueria', 20, { note: 'old note' }),
      visit('la-taqueria', 1, { note: 'fresh note' }),
    ];
    const [card] = buildWallCards(bayAreaPlaces, visits, NOW);
    expect(card.latestVisit.note).toBe('fresh note');
    expect(card.stats.visitCount).toBe(2);
  });

  it('drops stamps whose place is no longer in the dataset', () => {
    const cards = buildWallCards(bayAreaPlaces, [visit('deleted-place', 1)], NOW);
    expect(cards).toEqual([]);
  });

  it('renders nothing for an empty diary', () => {
    expect(buildWallCards(bayAreaPlaces, [], NOW)).toEqual([]);
  });
});

describe('newVisitId', () => {
  it('does not collide across rapid successive stamps', () => {
    const ids = new Set(Array.from({ length: 500 }, () => newVisitId()));
    expect(ids.size).toBe(500);
  });
});
