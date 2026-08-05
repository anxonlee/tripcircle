import { haversineKm, snapToCoarse, makeStartPlace, formatTime } from '../../lib/geo';
import { estimateLeg, legOptions } from '../mock/transport';
import { placesService } from '../places';
import { routingService } from '../routing';
import { pinColors } from '../../theme/colors';

const ferryBuilding = { latitude: 37.7955, longitude: -122.3937 };
const landsEnd = { latitude: 37.7804, longitude: -122.5057 };

describe('geo', () => {
  it('haversine matches known SF distance (Ferry Building→Lands End ≈ 10km)', () => {
    const km = haversineKm(ferryBuilding, landsEnd);
    expect(km).toBeGreaterThan(9.5);
    expect(km).toBeLessThan(11.5);
  });

  it('snapToCoarse drops precision to ~100m (3 decimals)', () => {
    const snapped = snapToCoarse({ latitude: 37.795123456, longitude: -122.393654321 });
    expect(snapped).toEqual({ latitude: 37.795, longitude: -122.394 });
  });

  it('makeStartPlace never stores fine precision', () => {
    const sp = makeStartPlace({
      id: 'x',
      name: 'X',
      kind: 'station',
      location: { latitude: 37.79512345, longitude: -122.39365432 },
    });
    expect(String(sp.location.latitude).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(3);
    expect(String(sp.location.longitude).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(3);
  });

  it('formatTime renders minutes-since-midnight', () => {
    expect(formatTime(540)).toBe('9:00');
    expect(formatTime(1065)).toBe('17:45');
    expect(formatTime(1500)).toBe('1:00'); // past midnight wraps
  });
});

describe('mock transport tables', () => {
  it('walking is free and slower than a rideshare', () => {
    const walk = estimateLeg(ferryBuilding, landsEnd, 'walk');
    const car = estimateLeg(ferryBuilding, landsEnd, 'rideshare');
    expect(walk.costUsd).toBe(0);
    expect(car.costUsd).toBeGreaterThan(0);
    expect(car.durationMin).toBeLessThan(walk.durationMin);
  });

  it('long legs exclude walking; short legs exclude transit and driving', () => {
    const long = legOptions(ferryBuilding, landsEnd); // ~10km
    expect(long.map((o) => o.mode)).not.toContain('walk');
    const near = { latitude: 37.7965, longitude: -122.393 }; // ~130m
    const short = legOptions(ferryBuilding, near).map((o) => o.mode);
    expect(short).not.toContain('muni');
    expect(short).not.toContain('bart');
    expect(short).not.toContain('drive');
  });

  describe('the Bay is a barrier, not a distance', () => {
    // Ferry Building -> Jack London Square is only ~5km straight-line, but the
    // straight line is water. Before the barrier existed this leg was walkable.
    const jackLondon = { latitude: 37.79579, longitude: -122.27469 };

    it('removes walking and Muni across the water', () => {
      const modes = legOptions(ferryBuilding, jackLondon).map((o) => o.mode);
      expect(modes).not.toContain('walk');
      expect(modes).not.toContain('muni');
    });

    it('offers BART, ferry, rideshare and driving instead', () => {
      const modes = legOptions(ferryBuilding, jackLondon).map((o) => o.mode);
      expect(modes).toEqual(
        expect.arrayContaining(['bart', 'ferry', 'rideshare', 'drive'])
      );
    });

    it('prices the transbay ferry at its real fare, not a doubled one', () => {
      const ferry = estimateLeg(ferryBuilding, jackLondon, 'ferry');
      expect(ferry.costUsd).toBe(5.1); // SF Bay Ferry adult, verified 2026-08-04
    });

    it('has no BART across the Golden Gate', () => {
      const sausalito = { latitude: 37.85903, longitude: -122.48547 };
      const modes = legOptions(ferryBuilding, sausalito).map((o) => o.mode);
      expect(modes).not.toContain('bart');
      expect(modes).toContain('ferry');
    });
  });

  it('options are sorted cheapest-first and never empty', () => {
    const opts = legOptions(ferryBuilding, landsEnd);
    expect(opts.length).toBeGreaterThan(0);
    const costs = opts.map((o) => o.costUsd);
    expect(costs).toEqual([...costs].sort((a, b) => a - b));
  });
});

describe('places service (mock)', () => {
  it('serves ~30 places with valid Bay Area coordinates and categories', async () => {
    const all = await placesService.listPlaces();
    expect(all.length).toBeGreaterThanOrEqual(28);
    for (const p of all) {
      expect(p.location.latitude).toBeGreaterThan(37.2);
      expect(p.location.latitude).toBeLessThan(38.1);
      expect(p.location.longitude).toBeGreaterThan(-122.7);
      // East edge of the harvest bbox reaches the Berkeley/Oakland hills.
      expect(p.location.longitude).toBeLessThan(-122.0);
      expect(p.categories.length).toBeGreaterThanOrEqual(1);
      expect(p.visitDurationMin).toBeGreaterThan(0);
      if (p.openHours) expect(p.openHours.close).toBeGreaterThan(p.openHours.open);
    }
  });

  it('searchLandmarks filters by name, empty query lists all', async () => {
    const all = await placesService.searchLandmarks('');
    expect(all.length).toBeGreaterThanOrEqual(10);
    const hits = await placesService.searchLandmarks('powell');
    expect(hits.map((l) => l.id)).toEqual(['lm-powell-station']);
  });
});

describe('routing service (mock)', () => {
  it('exposes a sync estimator for the optimizer', async () => {
    const fn = await routingService.getLegOptionsFn();
    expect(fn(ferryBuilding, landsEnd).length).toBeGreaterThan(0);
  });
});

describe('category colors (PRD §6.1)', () => {
  it('caps pin colors at two, primary first', () => {
    expect(pinColors(['historical', 'shopping', 'food'])).toEqual(['#E8A22F', '#2F7FE8']);
    expect(pinColors(['food'])).toEqual(['#E8542F']);
  });
});
