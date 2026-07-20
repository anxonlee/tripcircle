import { haversineKm, snapToCoarse, makeStartPlace, formatTime } from '../../lib/geo';
import { estimateLeg, legOptions } from '../mock/transport';
import { placesService } from '../places';
import { routingService } from '../routing';
import { pinColors } from '../../theme/colors';

const shibuya = { latitude: 35.658, longitude: 139.7016 };
const asakusa = { latitude: 35.7119, longitude: 139.7983 };

describe('geo', () => {
  it('haversine matches known Tokyo distance (Shibuya→Asakusa ≈ 10.6km)', () => {
    const km = haversineKm(shibuya, asakusa);
    expect(km).toBeGreaterThan(9.5);
    expect(km).toBeLessThan(11.5);
  });

  it('snapToCoarse drops precision to ~100m (3 decimals)', () => {
    const snapped = snapToCoarse({ latitude: 35.658123456, longitude: 139.701654321 });
    expect(snapped).toEqual({ latitude: 35.658, longitude: 139.702 });
  });

  it('makeStartPlace never stores fine precision', () => {
    const sp = makeStartPlace({
      id: 'x',
      name: 'X',
      kind: 'station',
      location: { latitude: 35.65812345, longitude: 139.70165432 },
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
  it('walking is free and slower than taxi', () => {
    const walk = estimateLeg(shibuya, asakusa, 'walk');
    const taxi = estimateLeg(shibuya, asakusa, 'taxi');
    expect(walk.costYen).toBe(0);
    expect(taxi.costYen).toBeGreaterThan(0);
    expect(taxi.durationMin).toBeLessThan(walk.durationMin);
  });

  it('long legs exclude walking; short legs exclude transit', () => {
    const long = legOptions(shibuya, asakusa); // ~10.6km
    expect(long.map((o) => o.mode)).not.toContain('walk');
    const near = { latitude: 35.659, longitude: 139.7 }; // ~200m
    const short = legOptions(shibuya, near);
    expect(short.map((o) => o.mode)).not.toContain('transit');
  });

  it('options are sorted cheapest-first and never empty', () => {
    const opts = legOptions(shibuya, asakusa);
    expect(opts.length).toBeGreaterThan(0);
    const costs = opts.map((o) => o.costYen);
    expect(costs).toEqual([...costs].sort((a, b) => a - b));
  });
});

describe('places service (mock)', () => {
  it('serves ~30 places with valid Tokyo coordinates and categories', async () => {
    const all = await placesService.listPlaces();
    expect(all.length).toBeGreaterThanOrEqual(28);
    for (const p of all) {
      expect(p.location.latitude).toBeGreaterThan(35.5);
      expect(p.location.latitude).toBeLessThan(35.8);
      expect(p.location.longitude).toBeGreaterThan(139.5);
      expect(p.location.longitude).toBeLessThan(139.9);
      expect(p.categories.length).toBeGreaterThanOrEqual(1);
      expect(p.visitDurationMin).toBeGreaterThan(0);
      if (p.openHours) expect(p.openHours.close).toBeGreaterThan(p.openHours.open);
    }
  });

  it('searchLandmarks filters by name, empty query lists all', async () => {
    const all = await placesService.searchLandmarks('');
    expect(all.length).toBeGreaterThanOrEqual(10);
    const hits = await placesService.searchLandmarks('shibuya');
    expect(hits.map((l) => l.id)).toEqual(['lm-shibuya-station']);
  });
});

describe('routing service (mock)', () => {
  it('exposes a sync estimator for the optimizer', async () => {
    const fn = await routingService.getLegOptionsFn();
    expect(fn(shibuya, asakusa).length).toBeGreaterThan(0);
  });
});

describe('category colors (PRD §6.1)', () => {
  it('caps pin colors at two, primary first', () => {
    expect(pinColors(['historical', 'shopping', 'food'])).toEqual(['#E8A22F', '#2F7FE8']);
    expect(pinColors(['food'])).toEqual(['#E8542F']);
  });
});
