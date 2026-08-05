import type { LatLng, Place, StartPlace } from '../../../domain/types';
import { haversineKm } from '../../geo';
import { legOptions as mockLegOptions } from '../../../services/mock/transport';
import { bayAreaPlaces } from '../../../services/mock/bayAreaPlaces';
import { __internals, optimizeDay, type OptimizeInput } from '../index';

const anchor: StartPlace = {
  id: 'anchor',
  name: 'Test Station',
  kind: 'station',
  location: { latitude: 35.0, longitude: 139.0 },
};

/** Deterministic walk-only world: 6 km/h, free. 0.009° lat ≈ 1.0 km. */
const walkOnly = (from: LatLng, to: LatLng) => {
  const km = haversineKm(from, to);
  return [{ mode: 'walk' as const, durationMin: Math.ceil(km * 10), costUsd: 0, distanceKm: km }];
};

function makePlace(id: string, latOffset: number, overrides: Partial<Place> = {}): Place {
  return {
    id,
    name: id,
    location: { latitude: 35.0 + latOffset, longitude: 139.0 },
    categories: ['food'],
    priceLevel: 0,
    avgCostUsd: 0,
    openHours: null,
    visitDurationMin: 60,
    rating: 4.2,
    reviewCount: 100,
    ...overrides,
  };
}

function baseInput(overrides: Partial<OptimizeInput> = {}): OptimizeInput {
  return {
    startPlace: anchor,
    places: [],
    dayStartMin: 9 * 60,
    homeByMin: 21 * 60,
    budgetCapUsd: 100000, // effectively uncapped for tests that don't exercise budget
    goal: 'balanced',
    legOptions: walkOnly,
    ...overrides,
  };
}

const byId = (id: string): Place => {
  const p = bayAreaPlaces.find((x) => x.id === id);
  if (!p) throw new Error(`missing fixture place ${id}`);
  return p;
};

const powellAnchor: StartPlace = {
  id: 'lm-powell-station',
  name: 'Powell St Station',
  kind: 'station',
  location: { latitude: 37.7844, longitude: -122.4079 },
};

const sfSubset = [
  byId('coit-tower'),
  byId('ferry-building'),
  byId('palace-of-fine-arts'),
  byId('union-square'),
  byId('smugglers-cove'),
];

const sfInput = (goal: 'balanced' | 'fastest'): OptimizeInput =>
  baseInput({
    startPlace: powellAnchor,
    places: sfSubset,
    goal,
    legOptions: mockLegOptions,
    budgetCapUsd: 30000,
  });

// ——— Structure ————————————————————————————————————————————————————

describe('plan structure', () => {
  it('visits every selected place exactly once, round trip from the anchor', () => {
    const plan = optimizeDay(sfInput('balanced'));
    expect(plan.stops.map((s) => s.place.id).sort()).toEqual(
      sfSubset.map((p) => p.id).sort()
    );
    expect(plan.returnLeg).not.toBeNull();
    expect(plan.stops.map((s) => s.order)).toEqual([1, 2, 3, 4, 5]);
  });

  it('is deterministic', () => {
    const a = optimizeDay(sfInput('balanced'));
    const b = optimizeDay(sfInput('balanced'));
    expect(a).toEqual(b);
  });

  it('handles an empty selection with an empty plan', () => {
    const plan = optimizeDay(baseInput());
    expect(plan.stops).toEqual([]);
    expect(plan.returnLeg).toBeNull();
    expect(plan.homeMin).toBe(plan.dayStartMin);
    expect(plan.warnings).toEqual([]);
    expect(plan.totals.totalUsd).toBe(0);
  });

  it('keeps two places at identical coordinates as distinct stops', () => {
    const p1 = makePlace('twin-a', 0.01);
    const p2 = { ...makePlace('twin-b', 0.01), name: 'twin-b' };
    const plan = optimizeDay(baseInput({ places: [p1, p2] }));
    expect(plan.stops.map((s) => s.place.id).sort()).toEqual(['twin-a', 'twin-b']);
  });

  it('reports internally consistent times', () => {
    const plan = optimizeDay(sfInput('balanced'));
    let t = plan.dayStartMin;
    for (const s of plan.stops) {
      expect(s.arriveMin).toBe(t + s.leg.durationMin);
      expect(s.beginMin).toBe(s.arriveMin + s.waitMin);
      expect(s.departMin).toBe(s.beginMin + s.place.visitDurationMin);
      t = s.departMin;
    }
    expect(plan.homeMin).toBe(t + plan.returnLeg!.durationMin);
  });
});

// ——— Ordering quality ————————————————————————————————————————————

describe('tour ordering (NN + 2-opt)', () => {
  it('2-opt never worsens the nearest-neighbor tour, and beats dataset order', () => {
    const { buildWeights, nearestNeighborTour, twoOpt, tourWeight } = __internals;
    const w = buildWeights(
      powellAnchor.location,
      sfSubset,
      'balanced',
      mockLegOptions
    );
    const identity = sfSubset.map((_, i) => i + 1);
    const nn = nearestNeighborTour(w);
    const opt = twoOpt(nn, w);
    expect(tourWeight(opt, w)).toBeLessThanOrEqual(tourWeight(nn, w) + 1e-9);
    expect(tourWeight(opt, w)).toBeLessThanOrEqual(tourWeight(identity, w) + 1e-9);
  });

  it('orders geographically sensible lines end-to-end (no backtracking)', () => {
    // Five stops on a north line: any optimal walk visits them in order.
    const line = [0.01, 0.02, 0.03, 0.04, 0.05].map((off, i) =>
      makePlace(`line-${i}`, off)
    );
    const shuffled = [line[3], line[0], line[4], line[1], line[2]];
    const plan = optimizeDay(baseInput({ places: shuffled }));
    expect(plan.stops.map((s) => s.place.id)).toEqual([
      'line-0',
      'line-1',
      'line-2',
      'line-3',
      'line-4',
    ]);
  });
});

// ——— Transport choice —————————————————————————————————————————————

describe('per-leg transport choice', () => {
  const near = (km: number): [LatLng, LatLng] => [
    { latitude: 35.0, longitude: 139.0 },
    { latitude: 35.0 + km / 111.19, longitude: 139.0 },
  ];

  it('balanced walks short legs and takes transit on long legs', () => {
    const [a, b] = near(1.0);
    expect(__internals.chooseLeg(mockLegOptions(a, b), 'balanced').mode).toBe('walk');
    const [c, d] = near(10.0);
    expect(__internals.chooseLeg(mockLegOptions(c, d), 'balanced').mode).toBe('transit');
  });

  it('fastest takes taxis on long legs', () => {
    const [a, b] = near(10.0);
    expect(__internals.chooseLeg(mockLegOptions(a, b), 'fastest').mode).toBe('taxi');
  });

  it('fastest refuses a taxi that saves almost nothing (short hop → walk)', () => {
    const [a, b] = near(0.5);
    expect(__internals.chooseLeg(mockLegOptions(a, b), 'fastest').mode).toBe('walk');
  });

  it('fastest plan is never slower, balanced plan is never pricier', () => {
    const balanced = optimizeDay(sfInput('balanced'));
    const fastest = optimizeDay(sfInput('fastest'));
    expect(fastest.totals.travelMin).toBeLessThanOrEqual(balanced.totals.travelMin);
    expect(balanced.totals.travelUsd).toBeLessThanOrEqual(fastest.totals.travelUsd);
  });
});

// ——— Open hours ———————————————————————————————————————————————————

describe('open hours', () => {
  it('waits for a place that has not opened yet and says so', () => {
    const cafe = makePlace('late-cafe', 0.009, {
      openHours: { open: 10 * 60, close: 22 * 60 },
    });
    const plan = optimizeDay(baseInput({ places: [cafe] }));
    const stop = plan.stops[0];
    expect(stop.beginMin).toBe(10 * 60);
    expect(stop.waitMin).toBeGreaterThan(0);
    expect(plan.warnings.join(' ')).toContain('opens at 10:00');
  });

  it('warns when a stop is reached after closing', () => {
    const earlyBird = makePlace('early-bird', 0.09, {
      openHours: { open: 5 * 60, close: 9 * 60 + 30 }, // closes 9:30, 10km away
    });
    const plan = optimizeDay(baseInput({ places: [earlyBird] }));
    expect(plan.warnings.join(' ')).toMatch(/after .*closes/);
  });

  it('reorders the day to rescue a stop that would be reached after closing', () => {
    const lazyMuseum = makePlace('lazy-museum', 0.005, {
      visitDurationMin: 180, // long first visit that would sink the next stop
    });
    const earlyMarket = makePlace('early-market', 0.02, {
      openHours: { open: 5 * 60, close: 11 * 60 },
      visitDurationMin: 60,
    });
    const plan = optimizeDay(baseInput({ places: [lazyMuseum, earlyMarket] }));
    expect(plan.stops[0].place.id).toBe('early-market');
    expect(plan.warnings.filter((w) => /after .*closes/.test(w))).toEqual([]);
  });
});

// ——— Budget ———————————————————————————————————————————————————————

describe('budget cap', () => {
  it('downgrades taxi legs to transit to get under the cap', () => {
    const far = makePlace('far-spot', 0.09); // ~10km: fastest wants taxi (~$29/leg)
    const plan = optimizeDay(
      baseInput({
        places: [far],
        goal: 'fastest',
        legOptions: mockLegOptions,
        budgetCapUsd: 20,
      })
    );
    const modes = [plan.stops[0].leg.mode, plan.returnLeg!.mode];
    expect(modes).not.toContain('taxi');
    expect(plan.totals.totalUsd).toBeLessThanOrEqual(20);
    expect(plan.warnings.join(' ')).not.toContain('Over budget');
  });

  it('warns when the cap is unreachable (spend alone exceeds it)', () => {
    const pricey = makePlace('pricey', 0.009, { avgCostUsd: 50 });
    const plan = optimizeDay(baseInput({ places: [pricey], budgetCapUsd: 10 }));
    expect(plan.totals.totalUsd).toBe(50);
    expect(plan.warnings.join(' ')).toContain('Over budget by $40');
  });
});

// ——— Day window ———————————————————————————————————————————————————

describe('day window', () => {
  it('warns when the plan gets home past the target', () => {
    const plan = optimizeDay({ ...sfInput('balanced'), homeByMin: 10 * 60 });
    expect(plan.warnings.join(' ')).toContain('past your 10:00 target');
  });
});

// ——— Scale ————————————————————————————————————————————————————————

describe('scale', () => {
  /**
   * PRD F3 sizes the optimizer at "≤40 places in ≤10s". The seed catalogue is
   * far larger than that on purpose — it is a browse list, and a day plan
   * draws a handful from it — so the bound that matters is F3's, not the
   * dataset's length.
   */
  it('plans F3\'s 40-place ceiling well inside the 10s budget', () => {
    const forty = bayAreaPlaces.slice(0, 40);
    const t0 = Date.now();
    const balanced = optimizeDay({ ...sfInput('balanced'), places: forty });
    const fastest = optimizeDay({ ...sfInput('fastest'), places: forty });
    const elapsed = Date.now() - t0;
    expect(balanced.stops).toHaveLength(40);
    expect(fastest.stops).toHaveLength(40);
    expect(elapsed).toBeLessThan(2000);
  });

  it('stays within a workable time budget on a pathological input', () => {
    const t0 = Date.now();
    optimizeDay({ ...sfInput('balanced'), places: bayAreaPlaces });
    // ~5s for the whole catalogue. This is a performance guard only — it makes
    // no claim that the resulting plan is usable. See the test below.
    expect(Date.now() - t0).toBeLessThan(15000);
  });

  /**
   * KNOWN GAP — the day window and budget cap are advisory, not enforced.
   * The optimizer schedules every place it is given and only warns when the
   * result overruns; it never drops a stop to make the day fit. Handed the
   * whole catalogue it returns a "day" that ends 28 days later and costs 60x
   * the cap. This test pins that behaviour so the gap is visible rather than
   * implied, and will need rewriting when the constraints become real.
   */
  it('documents that the day window is advisory, not a constraint', () => {
    const homeByMin = 21 * 60; // the 9:00–21:00 window from baseInput
    const plan = optimizeDay({
      ...sfInput('balanced'),
      places: bayAreaPlaces,
      homeByMin,
    });
    const overrunDays = (plan.homeMin - homeByMin) / 1440;

    expect(plan.stops).toHaveLength(bayAreaPlaces.length); // nothing dropped
    expect(overrunDays).toBeGreaterThan(20);               // ~28 days late
    expect(plan.totals.totalUsd).toBeGreaterThan(5000);    // cap is $150
    // The only thing standing between the user and this nonsense is a warning.
    expect(plan.warnings.join(' ')).toMatch(/past your/);
  });
});
