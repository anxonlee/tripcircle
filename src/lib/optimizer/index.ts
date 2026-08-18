import type {
  LatLng,
  LegEstimate,
  CuratedPlace,
  StartPlace,
  TransportMode,
} from '../../domain/types';
import { formatDayEnd, formatTime } from '../geo';

/**
 * "usually " when a place's hours are a category default rather than the
 * venue's own (`hoursEstimated`). Every warning that quotes an opening or
 * closing time goes through this, so a guessed window is never stated as
 * fact — the dataset rule in BAY-AREA-DELTA.md, applied at the last moment
 * the number is still attached to the place it came from.
 */
const usually = (p: CuratedPlace): string => (p.hoursEstimated ? 'usually ' : '');

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
 * Cost is reported, never enforced. There is no budget ceiling: transport is
 * a small share of what a day out actually costs, so capping transport alone
 * would police a number that excludes most of the user's spending. A cheap
 * day is chosen through the `economic` goal, which makes every leg cheap by
 * construction, rather than repaired after the fact.
 */

/**
 * What the planner is optimising for.
 *
 * The first three sit on a single axis, the money a user will spend to save
 * a minute, and differ only in where they sit on it. `leastWalking` is not on
 * that axis: walking is free, so moving along the cost axis makes walking
 * more attractive, not less. It needs its own penalty term — see
 * `walkPenaltyMin`.
 */
export const GOALS = ['economic', 'balanced', 'fastest', 'leastWalking'] as const;

export type Goal = (typeof GOALS)[number];

/**
 * Narrows an unknown to a Goal. Written here beside the list so a link, a
 * stored value, or anything else arriving from outside the app is checked
 * against the same four the optimiser actually solves for.
 */
export function isGoal(value: unknown): value is Goal {
  return typeof value === 'string' && (GOALS as readonly string[]).includes(value);
}

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
  /**
   * Take `places` in the order given and keep it (PRD F6, §3.4).
   *
   * Set once the user has arranged the day themselves. Construction, 2-opt
   * and the repair passes are skipped — every one of them exists to choose an
   * order, and choosing one is exactly what the user has just done. §3.4 asks
   * for the optimiser to become "an on-demand assist rather than
   * all-or-nothing", and this is that switch.
   *
   * Scheduling, transport choice and the departure still run: the user
   * arranged the stops, not the buses. Warnings still fire, and matter more
   * here than anywhere else — with the repairs off, a stop that arrives after
   * closing stays where it was put, so saying so is the only thing standing
   * between the user and a locked door.
   */
  fixedOrder?: boolean;
  /**
   * Times the user fixed by hand, place id to minutes since midnight
   * (PRD F6, §3.4).
   *
   * A pin means "be there at 12:30", not "no earlier than 12:30": the day
   * waits if it arrives early and says so if it arrives late. The two read
   * as different requests but only one of them needs building — a table
   * booked for 19:00 and a museum tour that must not be missed both want
   * the same thing, which is for the plan to hold the slot and to admit it
   * when it cannot.
   *
   * Deliberately not a constraint the construction stage solves for. A pin
   * is rare, usually singular, and the cost of threading it through the
   * weight matrix is paid on every day that has none. `repairPinnedTimes`
   * fixes the order afterwards instead, which is how closing times are
   * already handled and is accurate for the one or two pins a real day has.
   */
  pinnedTimes?: ReadonlyMap<string, number>;
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
  /**
   * The time the user pinned to this stop, if they pinned one. Carried on
   * the stop so the screen can mark it without re-reading the store and
   * risking a plan and a badge that disagree.
   */
  pinnedMin?: number;
  warnings: string[];
}

/**
 * A stretch of the day with nothing in it, measured against the day as the
 * user asked for it rather than the one they were given.
 *
 * The distinction is the whole point. A morning place and a night place leave
 * hours between them, and the departure stage answers that by setting out in
 * the afternoon — correct, and it makes the gap vanish from the plan on
 * screen. The gap is still the interesting fact about the day: it is the
 * reason the morning place is no longer in the morning, and it is space the
 * user could fill rather than skip.
 *
 * `from`/`to` bound the free time; the locations either side are where the
 * day is when it opens and where it has to be after, which is what makes a
 * filler near the route different from one merely near the anchor.
 */
export interface DayGap {
  fromMin: number;
  toMin: number;
  fromLocation: LatLng;
  toLocation: LatLng;
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
  /** Largest idle stretch in the day as requested, if worth filling. */
  gap: DayGap | null;
  totals: {
    travelMin: number;
    waitMin: number;
    travelUsd: number;
    /** Spend at places (entry fees, meals). */
    totalUsd: number;
  };
  warnings: string[];
}

/**
 * Dollars the user is assumed willing to spend to save one minute. Every cost
 * in the model is `costUsd` and the display currency is the same, so nothing
 * converts anywhere.
 *
 * Economic: $0.005/min, the deliberate inverse of Fastest. A dollar is worth
 * 200 minutes, so price decides every leg and duration only separates options
 * that already cost the same.
 * Balanced: $0.50/min (~$30/hr). In the Bay this is the line that decides BART
 * versus a rideshare — a car that saves 12 minutes over the rail leg is worth
 * it, one that saves 5 is not.
 * Fastest: absurdly high, so cost survives only as a tie-breaker.
 * Least walking: $5/min, high enough that fare barely registers. This user is
 * buying their way out of walking, so the mode choice must not be talked out
 * of a paid ride by its price. The actual avoidance comes from the walk
 * penalty below, not from this number.
 */
const COST_WEIGHT_USD_PER_MIN: Record<Goal, number> = {
  economic: 0.005,
  balanced: 0.5,
  fastest: 200,
  leastWalking: 5,
};

/**
 * Distance on foot a `leastWalking` plan will absorb without complaint. Short
 * connections have no vehicle worth boarding, and a planner that called a
 * rideshare to cross a plaza would be useless.
 */
const WALK_FREE_KM = 0.25;

/**
 * Minutes of penalty per kilometre walked beyond the free allowance, applied
 * only under `leastWalking`.
 *
 * The form is linear past a threshold rather than a flat surcharge, because
 * the goal is to prefer the *shorter* of two walks, not merely to avoid
 * walking at all: a flat penalty would rank a 400 m walk and a 2 km walk
 * identically. At 120 min/km a 400 m walk carries an 18-minute penalty, which
 * comfortably loses to any vehicle, while a 200 m walk carries none.
 */
const WALK_PENALTY_MIN_PER_KM = 120;

/**
 * The `leastWalking` term. Zero for every other goal, and zero for every
 * mode that is not walking, so the other three objectives score exactly as
 * they did before.
 */
function walkPenaltyMin(leg: LegEstimate, goal: Goal): number {
  if (goal !== 'leastWalking' || leg.mode !== 'walk') return 0;
  return Math.max(0, leg.distanceKm - WALK_FREE_KM) * WALK_PENALTY_MIN_PER_KM;
}

/**
 * Fastest still refuses pointless rideshare hops: any option within this many
 * minutes of the fastest option is considered "as fast", and the cheapest
 * such option wins (PRD §3.3: upgrade only where it saves meaningful time).
 *
 * Three, not the four the Hong Kong model used, for two measured reasons.
 *
 * Four landed exactly on a boundary in the Bay's fare table: rail trails a
 * rideshare by 5 minutes at 1–3km, by 4 at 4–5km, and by 3 or less past 7km.
 * At four the 4km case decided on an equality, so a one-minute change
 * anywhere in the transport model would silently flip it.
 *
 * And a nominal four minutes is not four real minutes here. The model prices
 * BART by ride time and knows nothing of headways, which run 8–15 minutes off
 * peak — so a rail option that looks four minutes slower can easily be
 * fifteen. Tightening the tolerance moves the marginal case to the car, which
 * is the honest answer under a goal named Fastest.
 */
const FASTEST_TOLERANCE_MIN = 3;

function legScore(leg: LegEstimate, goal: Goal): number {
  return (
    leg.durationMin +
    leg.costUsd / COST_WEIGHT_USD_PER_MIN[goal] +
    walkPenaltyMin(leg, goal)
  );
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
  /**
   * Total minutes by which pinned stops are missed. Summed rather than
   * counted: two stops five minutes late is a day worth keeping, and one
   * stop two hours late is not, and a count says those are the same.
   */
  pinLatenessMin: number;
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
  let pinLatenessMin = 0;

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
    let openWaitMin = 0;
    if (place.openHours && arriveMin < place.openHours.open) {
      openWaitMin = place.openHours.open - arriveMin;
      if (openWaitMin >= 15) {
        warnings.push(`${place.name} ${usually(place)}opens at ${formatTime(place.openHours.open)} — ${openWaitMin} min wait`);
      }
    }
    /**
     * When the visit could start if nothing were pinned — after the journey
     * and after the doors open. A pin can only push this later, never pull
     * it earlier, which is why the two waits are counted separately: the
     * opening-hours message above quotes a number the user can check
     * against the door, and a pin's own waiting is not that number.
     */
    const readyMin = arriveMin + openWaitMin;
    const pinnedMin = input.pinnedTimes?.get(place.id);
    const beginMin =
      pinnedMin === undefined ? readyMin : Math.max(readyMin, pinnedMin);
    /**
     * A missed pin has to be said out loud. Nothing else on the row would
     * show it: the stop would simply print a different time from the one
     * the user set, which reads as the app having forgotten rather than as
     * a day that cannot hold the slot.
     */
    if (pinnedMin !== undefined && readyMin > pinnedMin) {
      pinLatenessMin += readyMin - pinnedMin;
      warnings.push(
        `${readyMin - pinnedMin} min later than the ${formatTime(pinnedMin)} you set for ${place.name}`
      );
    }
    const waitMin = beginMin - arriveMin;
    if (place.openHours) {
      if (beginMin >= place.openHours.close) {
        hardClosingViolations++;
        warnings.push(
          `Arrives ${formatTime(beginMin)}, after ${place.name} ${usually(place)}closes (${formatTime(place.openHours.close)})`
        );
      } else if (beginMin + place.visitDurationMin > place.openHours.close) {
        warnings.push(`${place.name} ${usually(place)}closes at ${formatTime(place.openHours.close)}, before the visit ends`);
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
      pinnedMin,
      warnings,
    });
    t = departMin;
    prevLoc = place.location;
  });

  const returnLeg =
    order.length > 0 ? pickLeg(prevLoc, startPlace.location, order.length) : null;
  const homeMin = returnLeg ? t + returnLeg.durationMin : t;
  return { stops, returnLeg, homeMin, hardClosingViolations, pinLatenessMin };
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

/**
 * If a pinned stop is reached after its time, try moving it earlier.
 *
 * The third repair, and the only one answering a constraint the user set
 * rather than one the world imposed. That difference decides the tie-break
 * order below: a missed pin outranks tour weight, because a shorter day that
 * misses the table booked for 19:00 is not a better day.
 *
 * Same shape as `repairClosingViolations` deliberately — greedy, bounded by
 * the number of stops, and it moves one stop at a time. It will not find the
 * arrangement that needs two stops swapped around each other, and that is an
 * accepted limit: a real day carries one or two pins, and the alternative is
 * a constraint solver whose cost is paid by every day that pins nothing.
 *
 * A pin that no order can meet is left alone and reported. There is no
 * arrangement that makes a 30-minute journey take 10, and quietly dropping
 * the stop to make the numbers work would be the one outcome worse than
 * saying so.
 */
function repairPinnedTimes(
  input: OptimizeInput,
  order: CuratedPlace[],
  w: Weights,
  indexOf: Map<CuratedPlace, number>
): CuratedPlace[] {
  if (!input.pinnedTimes || input.pinnedTimes.size === 0) return order;
  let current = [...order];
  for (let pass = 0; pass < current.length; pass++) {
    const sched = schedule(input, current, new Map());
    if (sched.pinLatenessMin === 0) break;
    // The last late stop, not the first. Lateness accumulates forwards, so
    // the one furthest along is carrying every delay before it and has the
    // most to gain from moving.
    let latePos = -1;
    sched.stops.forEach((s, i) => {
      if (s.pinnedMin !== undefined && s.beginMin > s.pinnedMin) latePos = i;
    });
    if (latePos <= 0) break; // already first, or none — nothing earlier to try
    let best = current;
    let bestLateness = sched.pinLatenessMin;
    let bestClosing = sched.hardClosingViolations;
    /**
     * Seeded with the tour we already have, not with Infinity. A move that
     * changes no lateness and no closing time has to earn its place by
     * being a shorter day; seeded high it would be accepted for nothing,
     * and the next pass would be free to move it back.
     */
    let bestWeight = tourWeight(
      current.map((p) => indexOf.get(p)!),
      w
    );
    for (let pos = 0; pos < latePos; pos++) {
      const candidate = [...current];
      const [moved] = candidate.splice(latePos, 1);
      candidate.splice(pos, 0, moved);
      const cand = schedule(input, candidate, new Map());
      const candWeight = tourWeight(
        candidate.map((p) => indexOf.get(p)!),
        w
      );
      // Never buy punctuality with a locked door: a stop reached after
      // closing is not a stop at all, where a late arrival is still a
      // visit. Closing violations therefore gate the move rather than
      // trading against it.
      if (cand.hardClosingViolations > sched.hardClosingViolations) continue;
      if (
        cand.pinLatenessMin < bestLateness ||
        (cand.pinLatenessMin === bestLateness &&
          cand.hardClosingViolations < bestClosing) ||
        (cand.pinLatenessMin === bestLateness &&
          cand.hardClosingViolations === bestClosing &&
          candWeight < bestWeight)
      ) {
        best = candidate;
        bestLateness = cand.pinLatenessMin;
        bestClosing = cand.hardClosingViolations;
        bestWeight = candWeight;
      }
    }
    if (best === current) break; // no improving move found
    current = best;
  }
  return current;
}

/**
 * A wait longer than this is worth reordering the day to avoid.
 *
 * Half an hour is a coffee; four hours is the day being over before it
 * starts. The threshold only decides when to *try* a move — a move is kept
 * only if it actually reduces the total wait.
 */
const LONG_WAIT_MIN = 30;

/**
 * If a stop is reached long before it opens, try moving it later.
 *
 * The mirror of `repairClosingViolations`, and it exists because that one
 * only ever fired on arriving after somewhere had shut. Arriving before it
 * opens was not a violation at all: the schedule simply waited, and nothing
 * in the ordering knew. Measured on a five-place day, that put a bar opening
 * at 17:00 first in a day starting at 09:00 and idled 467 minutes in front of
 * it, where the same five places in a better order wait 320 and get home two
 * and a half hours earlier.
 *
 * The tour weight cannot express this. It scores pairs of places by distance,
 * fare and duration, and a wait is a property of *when you arrive*, which
 * depends on everything before it. Rather than make the weight
 * sequence-dependent — which would mean rebuilding nearest-neighbour and
 * 2-opt around a scheduling pass — this repairs the finished tour the way the
 * closing-time stage already does: bounded, greedy, and easy to follow.
 *
 * Total wait is the thing minimised, not the one long wait, so a move that
 * merely pushes the idling onto a different stop is rejected.
 */
function repairLongWaits(
  input: OptimizeInput,
  order: CuratedPlace[],
  w: Weights,
  indexOf: Map<CuratedPlace, number>
): CuratedPlace[] {
  const waitOf = (s: Schedule) =>
    s.stops.reduce((sum, st) => sum + st.waitMin, 0);

  let current = [...order];
  for (let pass = 0; pass < current.length; pass++) {
    const sched = schedule(input, current, new Map());
    const waiterPos = sched.stops.findIndex((s) => s.waitMin > LONG_WAIT_MIN);
    if (waiterPos < 0) break;
    if (waiterPos === current.length - 1) break; // already last; nowhere later

    let best = current;
    let bestWait = waitOf(sched);
    let bestWeight = Infinity;
    for (let pos = waiterPos + 1; pos < current.length; pos++) {
      const candidate = [...current];
      const [moved] = candidate.splice(waiterPos, 1);
      candidate.splice(pos, 0, moved);
      // Never trade a wait for somewhere shut on arrival: that is the defect
      // the other repair exists to remove.
      const candSched = schedule(input, candidate, new Map());
      if (candSched.hardClosingViolations > sched.hardClosingViolations) continue;
      const candWait = waitOf(candSched);
      const candWeight = tourWeight(
        candidate.map((p) => indexOf.get(p)!),
        w
      );
      if (
        candWait < bestWait ||
        (candWait === bestWait && candWeight < bestWeight)
      ) {
        best = candidate;
        bestWait = candWait;
        bestWeight = candWeight;
      }
    }
    if (best === current) break; // no improving move
    current = best;
  }
  return current;
}

/**
 * The latest the day could start without spoiling it.
 *
 * Waiting is dead time at the front of a day: arriving somewhere at 09:36 for
 * a place that opens at 17:00 is not planning, it is queuing. The whole
 * schedule can usually be pushed later to absorb that, and the point of
 * saying so is that the user rarely realises the day they asked for is a
 * shorter day starting later.
 *
 * Binary search rather than a scan, because every quantity involved moves one
 * way as the start slides later: arrivals get later, so waits only shrink,
 * closing violations only appear, and the finish only recedes. That
 * monotonicity is what makes ten schedules enough to find the last start that
 * is still safe.
 *
 * Safe means no closing violation the current plan does not already have, and
 * home no later than the user's target. Returns null when nothing is to be
 * gained, so the caller stays quiet rather than suggesting the start the user
 * already chose.
 */
function latestSafeStart(
  input: OptimizeInput,
  w: Weights,
  indexOf: Map<CuratedPlace, number>,
  current: Schedule
): { dayStartMin: number; savedWaitMin: number; schedule: Schedule } | null {
  const waitOf = (s: Schedule) =>
    s.stops.reduce((sum, st) => sum + st.waitMin, 0);
  const currentWait = waitOf(current);
  if (currentWait === 0) return null;

  /**
   * Candidates go through the same ordering and repair stages the user would
   * get, not merely a reschedule of today's order. A different start time can
   * produce a different tour — with a 16:20 start the bar comes first and the
   * bakery second — and a suggestion evaluated against the old order promised
   * a finish the real plan does not keep.
   */
  const planAt = (dayStartMin: number): Schedule => {
    const at = { ...input, dayStartMin };
    // A fixed order stays fixed at every candidate time, or the search would
    // be scoring days the user is never going to be shown.
    if (input.fixedOrder) return schedule(at, [...input.places], new Map());
    let order = twoOpt(nearestNeighborTour(w), w).map((i) => input.places[i - 1]);
    order = repairClosingViolations(at, order, w, indexOf);
    order = repairLongWaits(at, order, w, indexOf);
    order = repairPinnedTimes(at, order, w, indexOf);
    return schedule(at, order, new Map());
  };

  /**
   * The finish may not slip. That is the whole promise of the suggestion —
   * the same places, home at the same time, minus the standing about — and it
   * is also what stops the search wandering somewhere absurd. A 20:45 start
   * satisfies "no closing violation" while pushing a bakery visit through its
   * 21:00 close and the day out to 22:49; requiring the finish to hold rules
   * that out without a separate test for it.
   */
  const safe = (s: Schedule) =>
    s.hardClosingViolations <= current.hardClosingViolations &&
    s.homeMin <= current.homeMin &&
    // Nor may a pin be missed to save waiting. Waiting for a table booked
    // at 19:00 is the point of pinning it, and the search would otherwise
    // read that wait as the very waste it exists to remove — leaving later
    // and arriving after the slot is gone.
    s.pinLatenessMin <= current.pinLatenessMin;

  /**
   * Binary search rather than a scan. Every quantity involved moves one way
   * as the start slides later: arrivals get later, so waits only shrink,
   * closing violations only appear, and the finish only recedes. That
   * monotonicity is what makes a handful of trials enough to find the last
   * start still worth having.
   */
  let lo = input.dayStartMin; // known safe: it is the current plan
  let hi = input.homeByMin;
  for (let i = 0; i < 10 && hi - lo > 5; i++) {
    const mid = Math.floor((lo + hi) / 2);
    if (safe(planAt(mid))) lo = mid;
    else hi = mid;
  }

  // Round down to a time a person would actually say out loud.
  const rounded = Math.floor(lo / 5) * 5;
  if (rounded <= input.dayStartMin) return null;
  const best = planAt(rounded);
  if (!safe(best)) return null;

  const saved = currentWait - waitOf(best);
  // The schedule travels back with the time. The caller adopts this plan
  // rather than re-deriving it, so what the user is shown is the very
  // schedule the choice was tested against.
  return saved > 0
    ? { dayStartMin: rounded, savedWaitMin: saved, schedule: best }
    : null;
}

/**
 * Places that cannot be visited in the day at all: shut for its whole span,
 * or reached after they close.
 *
 * Counted as distinct places rather than as summed problems. Somewhere shut
 * before the day even starts is both unfittable and a closing violation, and
 * is one problem — counting it twice would overstate how broken the day is.
 *
 * Shared by the gate on moving the departure and by the warning that reports
 * the count, so the two can never disagree about what fits.
 */
function wontFitIds(
  places: CuratedPlace[],
  sched: Schedule,
  dayStartMin: number,
  homeByMin: number
): Set<string> {
  const ids = new Set<string>();
  for (const p of places) {
    if (
      p.openHours &&
      (p.openHours.open >= homeByMin || p.openHours.close <= dayStartMin)
    ) {
      ids.add(p.id);
    }
  }
  for (const s of sched.stops) {
    if (s.place.openHours && s.beginMin >= s.place.openHours.close) {
      ids.add(s.place.id);
    }
  }
  return ids;
}

/**
 * Idle time worth offering to fill. Below this a gap is a coffee and a walk,
 * not a hole in the day — and nothing in the dataset is a short enough visit
 * to slot into it once travel either side is paid for.
 */
const FILLABLE_GAP_MIN = 90;

/**
 * The largest stretch of the day with nothing in it.
 *
 * Idle time is exactly `waitMin`: the schedule already separates travelling
 * from standing about, so a gap is not inferred from the clock but read off
 * the stop that is waiting. The window runs from wherever the day was — the
 * anchor before the first stop, the previous stop after that — to when the
 * waiting stop finally begins.
 */
function largestGap(input: OptimizeInput, sched: Schedule): DayGap | null {
  let best: DayGap | null = null;
  let bestIdle = FILLABLE_GAP_MIN;

  sched.stops.forEach((stop, i) => {
    if (stop.waitMin <= bestIdle) return;
    const prev = i === 0 ? null : sched.stops[i - 1];
    bestIdle = stop.waitMin;
    best = {
      fromMin: prev ? prev.departMin : input.dayStartMin,
      toMin: stop.beginMin,
      fromLocation: prev ? prev.place.location : input.startPlace.location,
      toLocation: stop.place.location,
    };
  });

  return best;
}

// ——— Cost reporting ————————————————————————————————————————————————

function travelUsd(s: Schedule): number {
  return (
    s.stops.reduce((sum, st) => sum + st.leg.costUsd, 0) +
    (s.returnLeg?.costUsd ?? 0)
  );
}

// ——— Entry point ——————————————————————————————————————————————————

export function optimizeDay(rawInput: OptimizeInput): DayPlan {
  /**
   * Every stage asks for the same legs over and over — the weight matrix
   * fills n², and each repair pass reschedules the whole tour to score one
   * move. `legOptions` is the documented hot path: every call classifies both
   * endpoints against the Bay barrier and runs the crossing table.
   *
   * One memo, shared by every stage, for the life of a single solve. Legs
   * depend only on the two points, so within one solve the answer cannot
   * change; nothing is cached between solves, so live provider data would
   * still be re-read each time a plan is built.
   */
  const legCache = new Map<string, LegEstimate[]>();
  const input: OptimizeInput = {
    ...rawInput,
    legOptions: (from, to) => {
      const key = `${from.latitude},${from.longitude}|${to.latitude},${to.longitude}`;
      let hit = legCache.get(key);
      if (!hit) {
        hit = rawInput.legOptions(from, to);
        legCache.set(key, hit);
      }
      return hit;
    },
  };
  const { startPlace, places, goal, legOptions } = input;

  if (places.length === 0) {
    return {
      goal,
      startPlace,
      dayStartMin: input.dayStartMin,
      stops: [],
      returnLeg: null,
      homeMin: input.dayStartMin,
      gap: null,
      totals: { travelMin: 0, waitMin: 0, travelUsd: 0, totalUsd: 0 },
      warnings: [],
    };
  }

  // 1. Order — unless the user has already chosen one.
  const w = buildWeights(startPlace.location, places, goal, legOptions);
  const indexOf = new Map(places.map((p, i) => [p, i + 1] as const));
  let order: CuratedPlace[];
  if (input.fixedOrder) {
    order = [...places];
  } else {
    order = twoOpt(nearestNeighborTour(w), w).map((i) => places[i - 1]);

    // 2. Open-hours repair, in both directions: too late to get in, and too
    //    early to be let in.
    order = repairClosingViolations(input, order, w, indexOf);
    order = repairLongWaits(input, order, w, indexOf);
    // Last, so it works on the order the hours repairs settled on. A pin is
    // the user's own constraint and gets the final say over sequence.
    order = repairPinnedTimes(input, order, w, indexOf);
  }

  // 3. Schedule. Every leg's mode was already chosen by the goal, so there is
  //    nothing left to repair on cost — only to report.
  const requested = schedule(input, order, new Map());

  /**
   * 4. Choose when to leave.
   *
   * `dayStartMin` is the earliest the user will set out, not an instruction
   * to set out then. Reading it as an instruction is what puts a bakery and a
   * bar in the same day and sends the user to the bar hours before it opens,
   * to stand outside — while the finish is pinned by the bar's opening and is
   * the same whether they left at 09:00 or at 15:00. The only thing an early
   * start buys in that day is waiting.
   *
   * The move is only ever later, only when total waiting strictly falls, and
   * never when the finish slips or a stop stops fitting — `latestSafeStart`
   * enforces all three — so it cannot turn a good day into a worse one.
   *
   * Gated on the day being otherwise sound, and measured against the
   * requested start: if something cannot fit at all, no departure rescues it,
   * and shifting the day would only bury the real problem.
   */
  const soundAsRequested =
    wontFitIds(places, requested, input.dayStartMin, input.homeByMin).size === 0;
  const later = soundAsRequested
    ? latestSafeStart(input, w, indexOf, requested)
    : null;
  const sched = later ? later.schedule : requested;
  const dayStartMin = later ? later.dayStartMin : input.dayStartMin;

  const tUsd = travelUsd(sched);
  // Transport only. What a place costs is `avgCostUsd`, an estimate on an
  // unverified fixture, and adding it made the day total a figure whose
  // larger part the model cannot stand behind. It also made the four
  // objectives look alike: the same places are visited whichever route wins,
  // so at-place spend is a constant, and adding a constant to four numbers
  // only compresses the difference between them. Measured on an 11-place
  // day, the spread across objectives went from 19% to fifteenfold once it
  // came out. User-entered spend is Phase 2 (§3.4).
  const totalUsd = tUsd;
  const travelMin =
    sched.stops.reduce((sum, s) => sum + s.leg.durationMin, 0) +
    (sched.returnLeg?.durationMin ?? 0);
  const waitMin = sched.stops.reduce((sum, s) => sum + s.waitMin, 0);

  const warnings: string[] = sched.stops.flatMap((s) => s.warnings);
  if (sched.homeMin > input.homeByMin) {
    warnings.push(
      `Home by ${formatDayEnd(sched.homeMin)} — ${Math.round(sched.homeMin - input.homeByMin)} min past your ${formatTime(input.homeByMin)} target`
    );
  }

  /**
   * Say plainly when the day cannot work, rather than leaving it to be
   * inferred from per-stop warnings (§3.3.0). The planner never trims a
   * selection, so a set of places whose hours cannot share one day still
   * gets scheduled — the honest output is the schedule plus a sentence
   * naming the problem. Splitting across days is the real fix and is
   * roadmap (multi-day trips, PRD §14 Phase 4), so the copy recommends
   * without promising.
   */
  const unfittable = places.filter(
    (p) =>
      p.openHours &&
      (p.openHours.open >= input.homeByMin || p.openHours.close <= dayStartMin)
  );
  for (const p of unfittable) {
    warnings.push(
      `${p.name} is closed for the whole of your day (${usually(p)}open ${formatTime(p.openHours!.open)}–${formatTime(p.openHours!.close)})`
    );
  }

  /**
   * Name the window that would work, rather than leaving the user to find it
   * by nudging the control. Two different fixes, and which one applies is not
   * obvious from the outside: somewhere that opens after the day ends needs a
   * later *finish*, where a long wait inside the day is cured by a later
   * *start*. Suggesting the wrong one is worse than suggesting nothing.
   */
  const opensAfterDay = unfittable.filter(
    (p) => p.openHours!.open >= input.homeByMin
  );
  if (opensAfterDay.length > 0) {
    const latest = opensAfterDay.reduce((a, b) =>
      b.openHours!.open + b.visitDurationMin > a.openHours!.open + a.visitDurationMin
        ? b
        : a
    );
    const needed = latest.openHours!.open + latest.visitDurationMin;
    // A day ends at 23:59 at the latest — the same rule the day window
    // enforces, restated rather than imported: the planner chooses places
    // and this module schedules them, and the dependency runs one way.
    if (needed <= 24 * 60 - 1) {
      warnings.push(
        `${latest.name} ${usually(latest)}opens at ${formatTime(latest.openHours!.open)} — a day running to ${formatTime(needed)} would fit it in`
      );
    }
  }

  // Distinct places, not summed counts: somewhere shut before the day even
  // starts is both unfittable and a closing violation, and is one problem.
  const wontFit = wontFitIds(places, sched, dayStartMin, input.homeByMin);
  if (wontFit.size > 0) {
    const n = wontFit.size;
    warnings.push(
      `${n === 1 ? 'One of these places' : `${n} of these places`} won't fit this day. Try a wider day window, or save ${n === 1 ? 'it' : 'some'} for another day — planning a trip across several days is on the roadmap.`
    );
  }

  /**
   * Say why the day does not begin when the user asked.
   *
   * A plan that quietly departs hours after the time on the control reads as
   * a bug, however much better it is. The place that pinned the start is
   * named because after the shift its wait is gone, and with it the per-stop
   * warning that would otherwise have explained the delay — leaving the user
   * with a changed number and no reason for it.
   *
   * The binding place is the one that was waited on longest at the requested
   * start, which is the one whose opening the departure is answering.
   */
  if (later) {
    const pinned = requested.stops.reduce((a, b) =>
      b.waitMin > a.waitMin ? b : a
    );
    const opensAt = pinned.place.openHours
      ? ` ${pinned.place.name} ${usually(pinned.place)}opens at ${formatTime(pinned.place.openHours.open)}, so leaving earlier only adds waiting.`
      : '';
    warnings.push(
      `Leaving at ${formatTime(dayStartMin)} rather than ${formatTime(input.dayStartMin)}, which saves ${later.savedWaitMin} min of waiting for the same places and the same finish.${opensAt}`
    );
  }

  return {
    goal,
    startPlace,
    dayStartMin,
    // Read off the requested day, not the one the departure stage produced.
    // Setting out later is how the gap is *avoided*; it is still the thing
    // the user might rather fill.
    gap: largestGap(input, requested),
    stops: sched.stops,
    returnLeg: sched.returnLeg,
    homeMin: sched.homeMin,
    totals: { travelMin, waitMin, travelUsd: tUsd, totalUsd },
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
  // Exposed so the wait-repair test can measure the unrepaired day itself
  // rather than hard-coding a figure that silently rots.
  schedule,
};
