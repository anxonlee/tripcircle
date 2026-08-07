import type {
  LatLng,
  LegEstimate,
  CuratedPlace,
  StartPlace,
  TransportMode,
} from '../../domain/types';
import { formatTime } from '../geo';
import { formatUsd } from '../format';

/**
 * Day-plan optimizer. Pure TypeScript, no UI or provider imports — travel
 * estimates come in through `legOptions`, so the module is fully unit-testable
 * and provider-agnostic.
 *
 * Pipeline (a transparent heuristic, not an exact solver — PRD §1.3.3):
 *  1. Order stops: nearest-neighbor construction from the anchor, then 2-opt
 *     improvement, over goal-scored edge weights.
 *  2. Repair: move stops that would arrive after closing time earlier in the
 *     tour when that resolves the violation.
 *  3. Schedule: walk the tour, choosing each leg's transport greedily by the
 *     goal; wait out not-yet-open places; collect warnings.
 *
 * Cost is REPORTED, NOT ENFORCED (PRD §3.3). An earlier revision had a fourth
 * stage that downgraded legs until a day fit a budget cap; it was removed
 * because transport is a small share of what a day costs once meals and
 * admissions are counted, so capping transport constrains the wrong number.
 * A user who wants a cheap day picks the Most Economic objective instead.
 */

export type Goal = 'balanced' | 'fastest';

export type LegOptionsFn = (from: LatLng, to: LatLng) => LegEstimate[];

/**
 * Narrow a leg estimator to the modes actually available on this outing.
 *
 * Routing answers "what is physically possible between these points"; this
 * answers "what can *you* take". Driving is the case that matters: it is
 * usually the cheapest way across the Bay and among the priciest ways to move
 * two blocks, so leaving it in for someone without a car does not just add a
 * rejected option — it changes which plan wins.
 *
 * Never returns an empty list. If the filter would remove everything, the
 * unfiltered options are returned rather than leaving a leg unroutable.
 */
export function withAvailableModes(
  fn: LegOptionsFn,
  opts: { hasCar: boolean }
): LegOptionsFn {
  if (opts.hasCar) return fn;
  return (from, to) => {
    const all = fn(from, to);
    const usable = all.filter((o) => o.mode !== 'drive');
    return usable.length > 0 ? usable : all;
  };
}

export interface OptimizeInput {
  startPlace: StartPlace;
  places: CuratedPlace[];
  /** Departure from the anchor, minutes since midnight. */
  dayStartMin: number;
  /** Target return time ("home by"). */
  homeByMin: number;
  goal: Goal;
  legOptions: LegOptionsFn;
}

export interface PlannedStop {
  place: CuratedPlace;
  /** Leg that brings you to this stop. */
  leg: LegEstimate;
  /** Route order, 1-based. */
  order: number;
  arriveMin: number;
  /** Visit start (arrival plus any wait for opening). */
  beginMin: number;
  departMin: number;
  waitMin: number;
  warnings: string[];
}

export interface DayPlan {
  goal: Goal;
  startPlace: StartPlace;
  dayStartMin: number;
  stops: PlannedStop[];
  /** Final leg back to the anchor. */
  returnLeg: LegEstimate | null;
  /** Arrival back at the anchor. */
  homeMin: number;
  totals: {
    travelMin: number;
    waitMin: number;
    travelUsd: number;
    /** Spend at places (entry fees, meals). */
    spendUsd: number;
    totalUsd: number;
  };
  warnings: string[];
}

/** Balanced: $0.35 ≈ one minute of value. Fastest: cost is only a tie-breaker. */
const COST_WEIGHT_USD_PER_MIN: Record<Goal, number> = {
  balanced: 0.35,
  fastest: 15,
};

/**
 * Fastest still refuses pointless taxi hops: any option within this many
 * minutes of the fastest option is considered "as fast", and the cheapest
 * such option wins (PRD §3.3: upgrade only where it saves meaningful time).
 */
const FASTEST_TOLERANCE_MIN = 4;

function legScore(leg: LegEstimate, goal: Goal): number {
  return leg.durationMin + leg.costUsd / COST_WEIGHT_USD_PER_MIN[goal];
}

/** Greedy per-leg transport choice under the goal. */
function chooseLeg(options: LegEstimate[], goal: Goal): LegEstimate {
  if (options.length === 0) throw new Error('no leg options');
  if (goal === 'fastest') {
    const fastest = options.reduce((a, b) => (b.durationMin < a.durationMin ? b : a));
    const nearFastest = options.filter(
      (o) => o.durationMin <= fastest.durationMin + FASTEST_TOLERANCE_MIN
    );
    return nearFastest.reduce((a, b) => (b.costUsd < a.costUsd ? b : a));
  }
  return options.reduce((a, b) => (legScore(b, goal) < legScore(a, goal) ? b : a));
}

// ——— Tour ordering ———————————————————————————————————————————————

type Weights = number[][]; // [i][j], node 0 = anchor, nodes 1..n = places

function buildWeights(
  anchor: LatLng,
  places: CuratedPlace[],
  goal: Goal,
  legOptions: LegOptionsFn
): Weights {
  const pts = [anchor, ...places.map((p) => p.location)];
  const n = pts.length;
  const w: Weights = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      w[i][j] = legScore(chooseLeg(legOptions(pts[i], pts[j]), goal), goal);
    }
  }
  return w;
}

/** Nearest-neighbor tour over place indices (1..n), starting from anchor 0. */
function nearestNeighborTour(w: Weights): number[] {
  const n = w.length - 1;
  const remaining = new Set(Array.from({ length: n }, (_, i) => i + 1));
  const tour: number[] = [];
  let current = 0;
  while (remaining.size > 0) {
    let best = -1;
    let bestW = Infinity;
    for (const j of remaining) {
      if (w[current][j] < bestW) {
        bestW = w[current][j];
        best = j;
      }
    }
    tour.push(best);
    remaining.delete(best);
    current = best;
  }
  return tour;
}

function tourWeight(tour: number[], w: Weights): number {
  let total = 0;
  let prev = 0;
  for (const node of tour) {
    total += w[prev][node];
    prev = node;
  }
  total += w[prev][0]; // round trip back to the anchor
  return total;
}

/** Classic 2-opt: reverse segments while doing so shortens the round trip. */
function twoOpt(tour: number[], w: Weights): number[] {
  const t = [...tour];
  const n = t.length;
  if (n < 3) return t;
  let improved = true;
  let guard = 0;
  while (improved && guard++ < 200) {
    improved = false;
    for (let i = 0; i < n - 1; i++) {
      for (let k = i + 1; k < n; k++) {
        const a = i === 0 ? 0 : t[i - 1];
        const b = t[i];
        const c = t[k];
        const d = k === n - 1 ? 0 : t[k + 1];
        const delta = w[a][c] + w[b][d] - (w[a][b] + w[c][d]);
        if (delta < -1e-9) {
          let lo = i;
          let hi = k;
          while (lo < hi) {
            [t[lo], t[hi]] = [t[hi], t[lo]];
            lo++;
            hi--;
          }
          improved = true;
        }
      }
    }
  }
  return t;
}

// ——— Scheduling ——————————————————————————————————————————————————

interface Schedule {
  stops: PlannedStop[];
  returnLeg: LegEstimate | null;
  homeMin: number;
  hardClosingViolations: number;
}

/**
 * Walk the tour in order, choosing transport per leg. `modeOverrides` pins a
 * leg (by index; index stops.length = return leg) to a mode — used by the
 * budget repair pass.
 */
function schedule(
  input: OptimizeInput,
  order: CuratedPlace[],
  modeOverrides: Map<number, TransportMode>
): Schedule {
  const { startPlace, dayStartMin, goal, legOptions } = input;
  const stops: PlannedStop[] = [];
  let t = dayStartMin;
  let prevLoc = startPlace.location;
  let hardClosingViolations = 0;

  const pickLeg = (from: LatLng, to: LatLng, legIndex: number): LegEstimate => {
    const options = legOptions(from, to);
    const override = modeOverrides.get(legIndex);
    if (override) {
      const match = options.find((o) => o.mode === override);
      if (match) return match;
    }
    return chooseLeg(options, goal);
  };

  order.forEach((place, i) => {
    const leg = pickLeg(prevLoc, place.location, i);
    const arriveMin = t + leg.durationMin;
    const warnings: string[] = [];
    let waitMin = 0;
    if (place.openHours && arriveMin < place.openHours.open) {
      waitMin = place.openHours.open - arriveMin;
      if (waitMin >= 15) {
        warnings.push(`${place.name} opens at ${formatTime(place.openHours.open)} — ${waitMin} min wait`);
      }
    }
    const beginMin = arriveMin + waitMin;
    if (place.openHours) {
      if (beginMin >= place.openHours.close) {
        hardClosingViolations++;
        warnings.push(
          `Arrives ${formatTime(beginMin)}, after ${place.name} closes (${formatTime(place.openHours.close)})`
        );
      } else if (beginMin + place.visitDurationMin > place.openHours.close) {
        warnings.push(`${place.name} closes at ${formatTime(place.openHours.close)}, before the visit ends`);
      }
    }
    const departMin = beginMin + place.visitDurationMin;
    stops.push({
      place,
      leg,
      order: i + 1,
      arriveMin,
      beginMin,
      departMin,
      waitMin,
      warnings,
    });
    t = departMin;
    prevLoc = place.location;
  });

  const returnLeg =
    order.length > 0 ? pickLeg(prevLoc, startPlace.location, order.length) : null;
  const homeMin = returnLeg ? t + returnLeg.durationMin : t;
  return { stops, returnLeg, homeMin, hardClosingViolations };
}

/**
 * If a stop arrives after closing, try re-inserting it earlier in the tour;
 * keep the reposition that removes the most violations (ties: lower tour
 * weight). Bounded, greedy, transparent — not exhaustive.
 */
function repairClosingViolations(
  input: OptimizeInput,
  order: CuratedPlace[],
  w: Weights,
  indexOf: Map<CuratedPlace, number>
): CuratedPlace[] {
  let current = [...order];
  for (let pass = 0; pass < current.length; pass++) {
    const sched = schedule(input, current, new Map());
    if (sched.hardClosingViolations === 0) break;
    const violatorPos = sched.stops.findIndex(
      (s) =>
        s.place.openHours && s.beginMin >= s.place.openHours.close
    );
    if (violatorPos <= 0) break; // first stop (or none) — nothing earlier to try
    let best = current;
    let bestViolations = sched.hardClosingViolations;
    let bestWeight = Infinity;
    for (let pos = 0; pos < violatorPos; pos++) {
      const candidate = [...current];
      const [moved] = candidate.splice(violatorPos, 1);
      candidate.splice(pos, 0, moved);
      const candSched = schedule(input, candidate, new Map());
      const candWeight = tourWeight(
        candidate.map((p) => indexOf.get(p)!),
        w
      );
      if (
        candSched.hardClosingViolations < bestViolations ||
        (candSched.hardClosingViolations === bestViolations && candWeight < bestWeight)
      ) {
        best = candidate;
        bestViolations = candSched.hardClosingViolations;
        bestWeight = candWeight;
      }
    }
    if (best === current) break; // no improving move found
    current = best;
  }
  return current;
}

// ——— Totals ————————————————————————————————————————————————————————

/** Travel spend across the tour, including the leg home. */
function travelUsd(s: Schedule): number {
  return (
    s.stops.reduce((sum, st) => sum + st.leg.costUsd, 0) +
    (s.returnLeg?.costUsd ?? 0)
  );
}

// ——— Entry point ——————————————————————————————————————————————————

export function optimizeDay(input: OptimizeInput): DayPlan {
  const { startPlace, places, goal, legOptions } = input;

  if (places.length === 0) {
    return {
      goal,
      startPlace,
      dayStartMin: input.dayStartMin,
      stops: [],
      returnLeg: null,
      homeMin: input.dayStartMin,
      totals: { travelMin: 0, waitMin: 0, travelUsd: 0, spendUsd: 0, totalUsd: 0 },
      warnings: [],
    };
  }

  // 1. Order
  const w = buildWeights(startPlace.location, places, goal, legOptions);
  const nnTour = nearestNeighborTour(w);
  const optTour = twoOpt(nnTour, w);
  let order = optTour.map((i) => places[i - 1]);

  // 2. Open-hours repair
  const indexOf = new Map(places.map((p, i) => [p, i + 1] as const));
  order = repairClosingViolations(input, order, w, indexOf);

  // 3+4. Schedule with budget repair
  const spendUsd = order.reduce((sum, p) => sum + p.avgCostUsd, 0);
  const sched = schedule(input, order, new Map());

  const tUsd = travelUsd(sched);
  const totalUsd = tUsd + spendUsd;
  const travelMin =
    sched.stops.reduce((sum, s) => sum + s.leg.durationMin, 0) +
    (sched.returnLeg?.durationMin ?? 0);
  const waitMin = sched.stops.reduce((sum, s) => sum + s.waitMin, 0);

  const warnings: string[] = sched.stops.flatMap((s) => s.warnings);
  if (sched.homeMin > input.homeByMin) {
    warnings.push(
      `Home by ${formatTime(sched.homeMin)} — ${Math.round(sched.homeMin - input.homeByMin)} min past your ${formatTime(input.homeByMin)} target`
    );
  }

  return {
    goal,
    startPlace,
    dayStartMin: input.dayStartMin,
    stops: sched.stops,
    returnLeg: sched.returnLeg,
    homeMin: sched.homeMin,
    totals: { travelMin, waitMin, travelUsd: tUsd, spendUsd, totalUsd },
    warnings,
  };
}

/** Exposed for unit tests only. */
export const __internals = {
  chooseLeg,
  legScore,
  buildWeights,
  nearestNeighborTour,
  twoOpt,
  tourWeight,
};
