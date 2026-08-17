import type { LatLng } from '../../domain/types';
import {
  elementCount,
  LEG_TTL_MS,
  LegCache,
  planFetch,
  pointKey,
} from '../legCache';

const at = (n: number): LatLng => ({ latitude: 37.7 + n / 1000, longitude: -122.4 });
const leg = { durationMin: 12, distanceKm: 3.1 };
const T0 = 1_700_000_000_000;

/** Fills the cache as a completed fetch of every pair would. */
function warm(cache: LegCache, points: LatLng[], now: number): void {
  points.forEach((a) =>
    points.forEach((b) => {
      if (pointKey(a) !== pointKey(b)) cache.set('transit', a, b, leg, now);
    })
  );
}

describe('LegCache', () => {
  it('gives back what it was told', () => {
    const cache = new LegCache();
    cache.set('walking', at(1), at(2), leg, T0);
    expect(cache.get('walking', at(1), at(2), T0)).toEqual(leg);
  });

  it('keeps directions apart, because a hill only goes one way', () => {
    const cache = new LegCache();
    cache.set('walking', at(1), at(2), leg, T0);
    expect(cache.get('walking', at(2), at(1), T0)).toBeNull();
  });

  it('keeps modes apart', () => {
    const cache = new LegCache();
    cache.set('walking', at(1), at(2), leg, T0);
    expect(cache.get('driving', at(1), at(2), T0)).toBeNull();
  });

  it('matches a coordinate that has been round-tripped through a float', () => {
    const cache = new LegCache();
    cache.set('transit', at(1), at(2), leg, T0);
    const same = { latitude: Number(at(1).latitude.toFixed(7)), longitude: -122.4 };
    expect(cache.get('transit', same, at(2), T0)).toEqual(leg);
  });

  it('forgets a measurement once the timetable underneath it may have moved', () => {
    const cache = new LegCache();
    cache.set('transit', at(1), at(2), leg, T0);
    expect(cache.get('transit', at(1), at(2), T0 + LEG_TTL_MS - 1)).toEqual(leg);
    expect(cache.get('transit', at(1), at(2), T0 + LEG_TTL_MS)).toBeNull();
  });

  it('drops the oldest when it is full, not the newest', () => {
    const cache = new LegCache(LEG_TTL_MS, 2);
    cache.set('walking', at(1), at(2), leg, T0);
    cache.set('walking', at(2), at(3), leg, T0);
    cache.set('walking', at(3), at(4), leg, T0);
    expect(cache.size).toBe(2);
    expect(cache.get('walking', at(1), at(2), T0)).toBeNull();
    expect(cache.get('walking', at(3), at(4), T0)).toEqual(leg);
  });

  it('a rewrite does not count twice against the cap', () => {
    const cache = new LegCache(LEG_TTL_MS, 2);
    cache.set('walking', at(1), at(2), leg, T0);
    cache.set('walking', at(1), at(2), leg, T0 + 1);
    expect(cache.size).toBe(1);
  });
});

describe('planFetch', () => {
  it('asks for nothing when there is no day to plan', () => {
    expect(planFetch(new LegCache(), 'transit', [at(1)], T0)).toEqual([]);
  });

  it('asks for the whole matrix when it knows nothing', () => {
    const points = [at(1), at(2), at(3), at(4)];
    const rects = planFetch(new LegCache(), 'transit', points, T0);
    // 4×3 plus 3×1 — the full matrix less the one diagonal it can skip.
    expect(elementCount(rects)).toBe(15);
  });

  it('asks for nothing at all when every pair is already known', () => {
    // This is the objective switch: four re-solves against one purchase.
    const cache = new LegCache();
    const points = [at(1), at(2), at(3), at(4)];
    warm(cache, points, T0);
    expect(planFetch(cache, 'transit', points, T0)).toEqual([]);
  });

  it('buys only the new pairs when a place is added', () => {
    const cache = new LegCache();
    const known = [at(1), at(2), at(3), at(4), at(5), at(6), at(7), at(8)];
    warm(cache, known, T0);
    const rects = planFetch(cache, 'transit', [...known, at(9)], T0);
    // 9 into the new place, 8 back out of it — against 81 for the whole matrix.
    expect(elementCount(rects)).toBe(17);
  });

  it('buys nothing extra when a place is removed', () => {
    const cache = new LegCache();
    const points = [at(1), at(2), at(3), at(4)];
    warm(cache, points, T0);
    expect(planFetch(cache, 'transit', points.slice(0, 3), T0)).toEqual([]);
  });

  it('covers every missing pair it claims to', () => {
    const cache = new LegCache();
    const known = [at(1), at(2), at(3)];
    warm(cache, known, T0);
    const points = [...known, at(4), at(5)];
    const rects = planFetch(cache, 'transit', points, T0);

    const covered = new Set<string>();
    rects.forEach((r) =>
      r.origins.forEach((o) =>
        r.destinations.forEach((d) => covered.add(`${pointKey(o)}|${pointKey(d)}`))
      )
    );
    points.forEach((a) =>
      points.forEach((b) => {
        if (pointKey(a) === pointKey(b)) return;
        const known = cache.get('transit', a, b, T0) !== null;
        if (!known) expect(covered.has(`${pointKey(a)}|${pointKey(b)}`)).toBe(true);
      })
    );
  });

  it('buys the day again once the measurements have expired', () => {
    const cache = new LegCache();
    const points = [at(1), at(2), at(3)];
    warm(cache, points, T0);
    expect(elementCount(planFetch(cache, 'transit', points, T0 + LEG_TTL_MS))).toBe(8);
  });

  it('does not let one mode answer for another', () => {
    const cache = new LegCache();
    const points = [at(1), at(2), at(3)];
    warm(cache, points, T0);
    expect(elementCount(planFetch(cache, 'driving', points, T0))).toBe(8);
  });
});
