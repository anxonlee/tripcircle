import type { LatLng, CuratedPlace, StartPlace } from '../../../domain/types';
import { haversineKm } from '../../geo';
import { legOptions as mockLegOptions } from '../../../services/mock/transport';
import { bayAreaPlaces } from '../../../services/mock/bayAreaPlaces';
import {
  __internals,
  optimizeDay,
  withAvailableModes,
  type Goal,
  type OptimizeInput,
} from '../index';

const anchor: StartPlace = {
  id: 'anchor',
  name: 'Test Station',
  kind: 'station',
  location: { latitude: 37.75, longitude: -122.42 },
};

/** Deterministic walk-only world: 6 km/h, free. 0.009° lat ≈ 1.0 km. */
const walkOnly = (from: LatLng, to: LatLng) => {
  const km = haversineKm(from, to);
  return [{ mode: 'walk' as const, durationMin: Math.ceil(km * 10), costUsd: 0, distanceKm: km }];
};

function makePlace(id: string, latOffset: number, overrides: Partial<CuratedPlace> = {}): CuratedPlace {
  return {
    id,
    name: id,
    location: { latitude: 37.75 + latOffset, longitude: -122.42 },
    district: 'Mission',
    themes: ['food'],
    priceLevel: 0,
    priceBand: 'free',
    avgCostUsd: 0,
    worthDetour: false,
    openHours: null,
    visitDurationMin: 60,
    ...overrides,
  };
}

function baseInput(overrides: Partial<OptimizeInput> = {}): OptimizeInput {
  return {
    startPlace: anchor,
    places: [],
    dayStartMin: 9 * 60,
    homeByMin: 21 * 60,
    goal: 'balanced',
    legOptions: walkOnly,
    ...overrides,
  };
}

const byId = (id: string): CuratedPlace => {
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

const sfInput = (goal: Goal = 'balanced'): OptimizeInput =>
  baseInput({
    startPlace: powellAnchor,
    places: sfSubset,
    goal,
    legOptions: mockLegOptions,
  });

/** Two points `km` apart on a north line from a base that stays inside SF. */
const nearPair = (km: number): [LatLng, LatLng] => [
  { latitude: 37.72, longitude: -122.42 },
  { latitude: 37.72 + km / 111.19, longitude: -122.42 },
];

/**
 * 2.5 km north of the anchor: measured as the band where Fastest genuinely
 * buys a rideshare (11 min, $10.60) over walking (34 min, free), so Economic
 * has an expensive choice to decline. Beyond about 4 km BART is quicker as
 * well as cheaper and there is nothing left to refuse.
 */
const FASTEST_BUYS_A_CAR_OFFSET = 2.5 / 111.19;

/**
 * A gap the cheap objectives walk and `leastWalking` will not: measured at
 * 800 m, where walking is 11 min and free, and a rideshare is 7 min for $7.
 */
const walkableGap = (): [LatLng, LatLng] => nearPair(0.8);

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
  /**
   * A pair of points `km` apart on a north line, both inside San Francisco.
   * The base latitude is 37.72 rather than something more central so that
   * even the 10 km case stays south of 37.83 — past that the mock transport
   * model treats the leg as a Marin crossing, which removes BART and turns a
   * test about mode choice into a test about the Bay being in the way.
   */
  const near = (km: number): [LatLng, LatLng] => [
    { latitude: 37.72, longitude: -122.42 },
    { latitude: 37.72 + km / 111.19, longitude: -122.42 },
  ];

  it('balanced walks short legs and rails long ones', () => {
    const [a, b] = near(1.0);
    expect(__internals.chooseLeg(mockLegOptions(a, b), 'balanced').mode).toBe('walk');
    const [c, d] = near(10.0);
    expect(__internals.chooseLeg(mockLegOptions(c, d), 'balanced').mode).toBe('bart');
  });

  /**
   * At 10km a rideshare is only ~2 min quicker than BART for roughly $24 more,
   * so the "refuse an upgrade that saves almost nothing" rule keeps BART even
   * under Fastest. That rule is why Fastest stays usable rather than simply
   * calling a car for every leg.
   */
  it('fastest refuses a marginal rideshare upgrade over rail', () => {
    const [a, b] = near(10.0);
    const pick = __internals.chooseLeg(mockLegOptions(a, b), 'fastest');
    expect(pick.mode).toBe('bart');
  });

  it('fastest refuses a car that saves almost nothing (short hop → walk)', () => {
    const [a, b] = near(0.5);
    expect(__internals.chooseLeg(mockLegOptions(a, b), 'fastest').mode).toBe('walk');
  });

  it('driving undercuts a rideshare on price but costs time at the far end', () => {
    const [a, b] = near(10.0);
    const opts = mockLegOptions(a, b);
    const drive = opts.find((o) => o.mode === 'drive')!;
    const ride = opts.find((o) => o.mode === 'rideshare')!;
    // No fare to board, but parking is paid in money and in search time.
    expect(drive.costUsd).toBeLessThan(ride.costUsd);
    expect(drive.durationMin).toBeGreaterThan(ride.durationMin);
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

  it('moves a late opener later instead of idling in front of it', () => {
    // The bar sits nearest the anchor, so nearest-neighbour visits it first —
    // at 09:00, eight hours before it opens. The repair must push it to the
    // end of the day rather than let the schedule absorb the wait.
    const bar = makePlace('night-bar', 0.004, {
      openHours: { open: 17 * 60, close: 26 * 60 },
    });
    const daytime = [
      makePlace('a', 0.012),
      makePlace('b', 0.02),
      makePlace('c', 0.028),
    ];
    const places = [bar, ...daytime];
    const input = baseInput({
      places,
      homeByMin: 23 * 60 + 59,
      legOptions: mockLegOptions,
    });

    // Measure the unrepaired day rather than hard-coding a figure: the tour
    // the ordering stages hand over, scheduled as-is.
    const { buildWeights, nearestNeighborTour, twoOpt, schedule } = __internals;
    const w = buildWeights(anchor.location, places, 'balanced', mockLegOptions);
    const tour = twoOpt(nearestNeighborTour(w), w).map((i) => places[i - 1]);
    expect(tour[0].id).toBe('night-bar'); // the defect this repair exists for
    const unrepaired = schedule(input, tour, new Map()).stops.reduce(
      (sum: number, s: { waitMin: number }) => sum + s.waitMin,
      0
    );

    const plan = optimizeDay(input);
    expect(plan.stops[plan.stops.length - 1].place.id).toBe('night-bar');
    expect(plan.totals.waitMin).toBeLessThan(unrepaired);
  });

  it('keeps the wait repair from creating a closing violation', () => {
    // Moving the late opener past the early closer would rescue the wait but
    // arrive after the market shuts. The repair must refuse that trade.
    const bar = makePlace('night-bar', 0.004, {
      openHours: { open: 12 * 60, close: 26 * 60 },
      visitDurationMin: 300,
    });
    const earlyMarket = makePlace('early-market', 0.02, {
      openHours: { open: 5 * 60, close: 12 * 60 },
    });
    const plan = optimizeDay(
      baseInput({ places: [bar, earlyMarket], homeByMin: 23 * 60 + 59 })
    );
    expect(plan.warnings.filter((w) => /after .*closes/.test(w))).toEqual([]);
  });

  it('says plainly when a place cannot fit the day at all', () => {
    // Opens at 19:00; the day ends at 14:00. No order can visit it, and the
    // planner never trims a selection, so the plan must say so and point at
    // splitting the trip rather than leaving a silent five-hour wait.
    const nightMarket = makePlace('night-market', 0.009, {
      openHours: { open: 19 * 60, close: 23 * 60 },
    });
    const plan = optimizeDay(
      baseInput({ places: [nightMarket, makePlace('a', 0.004)], homeByMin: 14 * 60 })
    );
    const all = plan.warnings.join(' ');
    expect(all).toContain('closed for the whole of your day');
    expect(all).toContain("won't fit this day");
    expect(all).toContain('several days');
  });

  it('counts a place shut before the day starts as one problem, not two', () => {
    // Closed at 08:00 for a 09:00 start: it is unfittable AND a closing
    // violation, and the summary must say "One", not "2".
    const dawnMarket = makePlace('dawn-market', 0.009, {
      openHours: { open: 5 * 60, close: 8 * 60 },
    });
    const plan = optimizeDay(
      baseInput({ places: [dawnMarket, makePlace('a', 0.004)] })
    );
    const summary = plan.warnings.find((w) => w.includes("won't fit this day"));
    expect(summary).toBeDefined();
    expect(summary).toContain('One of these places');
  });

  it('stays quiet about fit when every place can be visited', () => {
    const plan = optimizeDay(
      baseInput({ places: [makePlace('a', 0.004), makePlace('b', 0.012)] })
    );
    expect(plan.warnings.join(' ')).not.toContain("won't fit");
  });

  it('suggests a later start when the day opens with a long wait', () => {
    const bar = makePlace('night-bar', 0.004, {
      openHours: { open: 17 * 60, close: 26 * 60 },
    });
    const cafe = makePlace('cafe', 0.012, {
      openHours: { open: 7 * 60, close: 21 * 60 },
    });
    const plan = optimizeDay(
      baseInput({ places: [bar, cafe], homeByMin: 23 * 60 + 59 })
    );
    expect(plan.totals.waitMin).toBeGreaterThan(60);
    expect(plan.warnings.join(' ')).toMatch(/Leaving at .* instead would cut/);
  });

  it('keeps the promise it makes about that later start', () => {
    // The test that matters. An earlier version checked candidates by
    // rescheduling the *existing* order, but a different start can produce a
    // different tour — so the plan a user actually got by following the
    // advice finished 24 minutes later than promised. Re-plan at the
    // suggested time and hold it to its word.
    const bar = makePlace('night-bar', 0.004, {
      openHours: { open: 17 * 60, close: 26 * 60 },
    });
    const cafe = makePlace('cafe', 0.012, {
      openHours: { open: 7 * 60, close: 21 * 60 },
    });
    const input = baseInput({ places: [bar, cafe], homeByMin: 23 * 60 + 59 });
    const plan = optimizeDay(input);

    const advice = plan.warnings.find((w) => w.startsWith('Leaving at '))!;
    const [, hh, mm] = advice.match(/Leaving at (\d+):(\d+)/)!;
    const suggested = Number(hh) * 60 + Number(mm);

    const after = optimizeDay({ ...input, dayStartMin: suggested });
    expect(after.homeMin).toBeLessThanOrEqual(plan.homeMin);
    expect(after.totals.waitMin).toBeLessThan(plan.totals.waitMin);
    expect(after.stops).toHaveLength(plan.stops.length);
  });

  it('says nothing about starting later when there is no waiting', () => {
    const plan = optimizeDay(
      baseInput({ places: [makePlace('a', 0.004), makePlace('b', 0.012)] })
    );
    expect(plan.warnings.join(' ')).not.toContain('Leaving at');
  });

  it('names the finish that would fit a place opening after the day ends', () => {
    const nightMarket = makePlace('night-market', 0.009, {
      openHours: { open: 19 * 60, close: 23 * 60 },
      visitDurationMin: 60,
    });
    const plan = optimizeDay(
      baseInput({ places: [nightMarket, makePlace('a', 0.004)], homeByMin: 14 * 60 })
    );
    expect(plan.warnings.join(' ')).toContain('a day running to 20:00 would fit it in');
  });

  it('does not offer a later start when something cannot fit at all', () => {
    // Two competing pieces of advice read as noise, and the later start does
    // not rescue a place that is shut for the whole window anyway.
    const nightMarket = makePlace('night-market', 0.009, {
      openHours: { open: 19 * 60, close: 23 * 60 },
    });
    const plan = optimizeDay(
      baseInput({ places: [nightMarket, makePlace('a', 0.004)], homeByMin: 14 * 60 })
    );
    expect(plan.warnings.join(' ')).not.toContain('Leaving at');
  });

  it('accepts a short wait rather than churning the order', () => {
    // A 20-minute wait is a coffee, not a defect. Below the threshold the
    // repair must leave the tour alone.
    const cafe = makePlace('brunch-cafe', 0.004, {
      openHours: { open: 9 * 60 + 30, close: 22 * 60 },
    });
    const other = makePlace('a', 0.012);
    const plan = optimizeDay(baseInput({ places: [cafe, other] }));
    expect(plan.stops[0].place.id).toBe('brunch-cafe');
    expect(plan.stops[0].waitMin).toBeGreaterThan(0);
    expect(plan.stops[0].waitMin).toBeLessThanOrEqual(30);
  });
});

// ——— Cost reporting ——————————————————————————————————————————————

describe('cost reporting', () => {
  /**
   * PRD §3.3 removed the budget cap: cost is reported, never enforced. An
   * earlier revision downgraded legs until a day fit a ceiling. A user who
   * wants a cheap day picks the Most Economic objective instead — and that
   * objective must decline the expensive leg by construction, on the same
   * leg where Fastest buys it.
   */
  it('keeps a day cheap through the goal, not through a cap', () => {
    const far = makePlace('far-spot', FASTEST_BUYS_A_CAR_OFFSET);
    const shared = { places: [far], legOptions: mockLegOptions };
    const fastest = optimizeDay(baseInput({ ...shared, goal: 'fastest' }));
    const economic = optimizeDay(baseInput({ ...shared, goal: 'economic' }));

    expect(fastest.stops[0].leg.mode).toBe('rideshare');
    expect([economic.stops[0].leg.mode, economic.returnLeg!.mode]).not.toContain(
      'rideshare'
    );
    expect(economic.totals.travelUsd).toBeLessThan(fastest.totals.travelUsd);
  });

  it('totals the fares and nothing else, and never warns on cost', () => {
    // Previously asserted travel plus at-place spend. What a place costs is
    // an estimate on an unverified fixture, so it is no longer added to a
    // figure a user would budget against — an expensive stop must leave the
    // day total untouched. The budget warning went with the cap in v0.4 and
    // is still gone.
    const pricey = makePlace('pricey', 0.009, { avgCostUsd: 50 });
    const plan = optimizeDay(baseInput({ places: [pricey] }));
    expect(plan.totals.totalUsd).toBe(plan.totals.travelUsd);
    expect(plan.totals.totalUsd).toBeLessThan(50);
    expect(plan.warnings.join(' ')).not.toMatch(/budget/i);
  });

  it('is unmoved by how expensive the places themselves are', () => {
    // The reason the spend came out of the total: the same places are visited
    // whichever route wins, so at-place cost is a constant across the four
    // objectives and adding it only compressed the difference between them.
    // Same geometry, wildly different prices, identical day total.
    const cheap = [
      makePlace('a', 0.009, { avgCostUsd: 0 }),
      makePlace('b', 0.02, { avgCostUsd: 0 }),
    ];
    const dear = [
      makePlace('a', 0.009, { avgCostUsd: 400 }),
      makePlace('b', 0.02, { avgCostUsd: 600 }),
    ];
    expect(optimizeDay(baseInput({ places: dear })).totals.totalUsd).toBe(
      optimizeDay(baseInput({ places: cheap })).totals.totalUsd
    );
  });

  it('costs every leg individually so cost stays visible per leg', () => {
    const plan = optimizeDay(sfInput('balanced'));
    for (const s of plan.stops) {
      expect(typeof s.leg.costUsd).toBe('number');
      expect(s.leg.costUsd).toBeGreaterThanOrEqual(0);
    }
    const legSum =
      plan.stops.reduce((n, s) => n + s.leg.costUsd, 0) + plan.returnLeg!.costUsd;
    expect(plan.totals.travelUsd).toBe(legSum);
  });
});

// ——— Least walking ————————————————————————————————————————————————

describe('least walking', () => {
  /**
   * `leastWalking` is not a point on the cost axis the other three share.
   * Walking is free, so moving along that axis makes walking more attractive,
   * not less — the objective needs its own penalty term, and these tests
   * exist to catch anyone folding it back into a cost weight.
   */
  it('boards a vehicle for a walk the other goals would take', () => {
    const [a, b] = walkableGap();
    const balanced = __internals.chooseLeg(mockLegOptions(a, b), 'balanced');
    const least = __internals.chooseLeg(mockLegOptions(a, b), 'leastWalking');
    expect(balanced.mode).toBe('walk');
    expect(least.mode).not.toBe('walk');
  });

  it('still walks a distance no vehicle is worth boarding for', () => {
    // Under the free allowance. A planner that called a car to cross a plaza
    // would be useless, whatever the objective.
    const [a, b] = nearPair(0.2);
    expect(__internals.chooseLeg(mockLegOptions(a, b), 'leastWalking').mode).toBe(
      'walk'
    );
  });

  it('walks less than every other objective over a whole day', () => {
    const places = [0.004, 0.012, 0.02, 0.028].map((off, i) =>
      makePlace(`w${i}`, off)
    );
    const walkKm = (goal: Goal) => {
      const plan = optimizeDay(
        baseInput({ places, goal, legOptions: mockLegOptions })
      );
      const legs = [...plan.stops.map((s) => s.leg), plan.returnLeg!];
      return legs
        .filter((l) => l.mode === 'walk')
        .reduce((sum, l) => sum + l.distanceKm, 0);
    };
    const least = walkKm('leastWalking');
    for (const goal of ['economic', 'balanced', 'fastest'] as const) {
      expect(least).toBeLessThanOrEqual(walkKm(goal));
    }
  });

  /**
   * The penalty is linear past a threshold rather than flat, because the goal
   * is to prefer the *shorter* of two walks and not merely to avoid walking:
   * a flat surcharge would score a 400 m walk and a 2 km walk identically.
   */
  it('prefers the shorter of two walks rather than treating both alike', () => {
    const short = { mode: 'walk' as const, durationMin: 5, costUsd: 0, distanceKm: 0.4 };
    const long = { mode: 'walk' as const, durationMin: 24, costUsd: 0, distanceKm: 2.0 };
    expect(__internals.legScore(short, 'leastWalking')).toBeLessThan(
      __internals.legScore(long, 'leastWalking')
    );
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
   * KNOWN GAP — the day window is advisory, not enforced. The optimizer
   * schedules every place it is given and only warns when the result
   * overruns; it never drops a stop to make the day fit. Handed the whole
   * catalogue it returns a "day" that ends weeks later. This test pins that
   * behaviour so the gap is visible rather than implied, and will need
   * rewriting when the constraint becomes real.
   *
   * Sizing a *suggested* day is a separate job and does have limits: see
   * `deriveStopCount` in lib/planner.ts, which caps what is offered unasked.
   * Nothing trims a selection the user assembled themselves.
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
    // The only thing standing between the user and this nonsense is a warning.
    expect(plan.warnings.join(' ')).toMatch(/past your/);
  });
});

// ——— Car availability ——————————————————————————————————————————————

describe('car availability', () => {
  const near = (km: number): [LatLng, LatLng] => [
    { latitude: 37.7844, longitude: -122.4079 },
    { latitude: 37.7844 + km / 111.19, longitude: -122.4079 },
  ];

  it('offers driving when a car is available', () => {
    const fn = withAvailableModes(mockLegOptions, { hasCar: true });
    const [a, b] = near(8);
    expect(fn(a, b).map((o) => o.mode)).toContain('drive');
  });

  it('removes driving when there is no car', () => {
    const fn = withAvailableModes(mockLegOptions, { hasCar: false });
    const [a, b] = near(8);
    const modes = fn(a, b).map((o) => o.mode);
    expect(modes).not.toContain('drive');
    expect(modes.length).toBeGreaterThan(0);
  });

  it('never strips a leg down to nothing', () => {
    // A leg only driving could serve still returns something rather than
    // leaving the optimizer with no option at all.
    const onlyDrive = () => [
      { mode: 'drive' as const, durationMin: 20, costUsd: 9, distanceKm: 5 },
    ];
    const fn = withAvailableModes(onlyDrive, { hasCar: false });
    const [a, b] = near(5);
    expect(fn(a, b)).toHaveLength(1);
  });

  it('changes which plan wins, not just which options exist', () => {
    // Crossing the Bay: driving is far cheaper than a rideshare, so removing
    // it should raise what the cheapest sensible crossing costs.
    const ferryBuilding = { latitude: 37.79555, longitude: -122.39347 };
    const jackLondon = { latitude: 37.79579, longitude: -122.27469 };
    const withCar = withAvailableModes(mockLegOptions, { hasCar: true });
    const without = withAvailableModes(mockLegOptions, { hasCar: false });
    expect(withCar(ferryBuilding, jackLondon).map((o) => o.mode)).toContain('drive');
    expect(without(ferryBuilding, jackLondon).map((o) => o.mode)).not.toContain('drive');
  });
});
