import type { LatLng, LegEstimate, TransportMode } from '../../domain/types';
import { haversineKm } from '../../lib/geo';

/**
 * Bay Area transport model — TEMP FIXTURE.
 *
 * Fares and speeds below are approximations authored for development, not
 * sourced from 511.org, Muni, BART or any operator. Replacing them with live
 * provider data is a near-term deliverable; the RoutingService interface
 * exists so that substitution never touches the optimizer.
 *
 * Two deliberate structural choices:
 *
 * 1. MODES DIFFER IN KIND, NOT DEGREE. Muni is flat per boarding, BART is
 *    stepped by distance, the ferry is fixed per crossing, rideshare is
 *    flagfall plus metered, and driving pays no fare at all but pays for
 *    parking in both money and time. Collapsing these into one "transit"
 *    mode would hide exactly the trade-offs the optimizer exists to make.
 *
 * 2. THE BAY IS A BARRIER, NOT A DISTANCE. San Francisco, the East Bay and
 *    Marin are separate landmasses. A straight line between them crosses
 *    water, so walking is removed outright and the remaining modes take a
 *    crossing penalty. A planner that treats the Bay as ordinary distance
 *    will happily walk someone from the Ferry Building to Oakland.
 *
 * KNOWN APPROXIMATION: distances are straight-line (haversine), not routed.
 * There is no street network, rail alignment or interchange modelling. Speeds
 * are calibrated as door-to-door effective speeds over straight-line distance
 * to compensate.
 */

// ——— Landmasses & the water barrier ————————————————————————————————

type Landmass = 'sf' | 'eastbay' | 'marin';

/**
 * Which side of the water a point sits on. A coarse rectangular split, which
 * is all the straight-line model can justify — it is right for the Bay Area's
 * three main landmasses and makes no claim beyond that.
 *
 * "sf" covers San Francisco and the Peninsula, which are contiguous by land.
 */
function landmass(p: LatLng): Landmass {
  if (p.longitude > -122.32) return 'eastbay';        // Oakland, Berkeley, Alameda
  if (p.latitude > 37.83) return 'marin';             // Sausalito, Marin headlands
  return 'sf';                                        // SF + Peninsula
}

/**
 * What each crossing costs, per mode, and by implication which modes can make
 * it at all — a mode absent from a crossing cannot serve that leg.
 *
 * Ferry fares live HERE rather than in MODE_TABLE because a ferry's fare is
 * the crossing; there is no separate base fare to add. Two different operators
 * run these routes at different prices, so a single "ferry fare" would be
 * wrong on at least one of them.
 *
 * VERIFIED 2026-08-04: SF Bay Ferry Oakland/Alameda↔SF adult $5.10 (effective
 * 1 Jul 2026); Golden Gate Ferry Sausalito↔SF $6.25 Clipper / $11.75 cash —
 * Clipper used for consistency with the Muni fare above.
 * NOT VERIFIED: bridge tolls, BART's transbay surcharge, and all crossing
 * durations remain authored approximations.
 */
const CROSSING: Record<
  string,
  Partial<Record<TransportMode, { min: number; usd: number }>>
> = {
  // Transbay tube, Bay Bridge, and SF Bay Ferry services.
  'eastbay|sf': {
    bart: { min: 8, usd: 2.2 },
    ferry: { min: 25, usd: 5.1 },
    rideshare: { min: 12, usd: 8.0 },
    drive: { min: 12, usd: 8.0 },
  },
  // Golden Gate Bridge and Golden Gate Ferry. No BART across the Golden Gate.
  'marin|sf': {
    ferry: { min: 30, usd: 6.25 },
    rideshare: { min: 14, usd: 9.75 },
    drive: { min: 14, usd: 9.75 },
  },
  // Richmond–San Rafael Bridge only; no rail, no scheduled passenger ferry.
  'eastbay|marin': {
    rideshare: { min: 15, usd: 8.0 },
    drive: { min: 15, usd: 8.0 },
  },
};

function crossingKey(a: Landmass, b: Landmass): string {
  return [a, b].sort().join('|');
}

// ——— Per-mode cost and speed ————————————————————————————————————————

interface ModeSpec {
  /** Door-to-door effective speed over straight-line distance. */
  speedKmH: number;
  /** Waiting, hailing, station access — or, for driving, parking search. */
  overheadMin: number;
  cost: (km: number) => number;
}

const MODE_TABLE: Record<TransportMode, ModeSpec> = {
  walk: {
    speedKmH: 4.5,
    overheadMin: 0,
    cost: () => 0,
  },
  muni: {
    // Buses, streetcars and the metro: one flat fare however far you ride.
    speedKmH: 13,
    overheadMin: 8,
    cost: () => 2.85,
  },
  bart: {
    // Stepped by distance, and faster than Muni once you are past a few km.
    speedKmH: 32,
    overheadMin: 11,
    cost: (km) => {
      if (km <= 5) return 2.6;
      if (km <= 15) return 4.4;
      if (km <= 30) return 6.3;
      return 8.5;
    },
  },
  ferry: {
    /**
     * Base fare is zero on purpose: a ferry's whole fare is its crossing, and
     * that lives in the CROSSING table because it differs by operator. The
     * ferry is never offered on a same-landmass leg, so this never applies.
     */
    speedKmH: 22,
    overheadMin: 15, // terminal access; headway waits sit in the crossing
    cost: () => 0,
  },
  rideshare: {
    speedKmH: 26,
    overheadMin: 5,
    cost: (km) => 7 + Math.max(0, km - 1) * 2.4,
  },
  drive: {
    /**
     * No fare to board, but parking costs money and finding it costs time —
     * which is what makes driving structurally different from rideshare
     * rather than just a cheaper version of it.
     */
    speedKmH: 28,
    overheadMin: 14, // parking search + walk from the space
    cost: (km) => km * 0.35 + 6.5, // fuel and wear, plus typical parking
  },
};

/** Walking further than this is never offered. */
const MAX_WALK_KM = 3.5;
/** Below this, scheduled transit's overhead swamps any benefit. */
const MIN_TRANSIT_KM = 0.6;
/** Below this, driving is not worth the parking hunt. */
const MIN_DRIVE_KM = 1.5;
/** The ferry only makes sense as a crossing. */
const MIN_FERRY_KM = 2.0;

export function estimateLeg(
  from: LatLng,
  to: LatLng,
  mode: TransportMode
): LegEstimate {
  const km = haversineKm(from, to);
  const t = MODE_TABLE[mode];
  const a = landmass(from);
  const b = landmass(to);
  const crossing = a === b ? undefined : CROSSING[crossingKey(a, b)]?.[mode];
  return {
    mode,
    distanceKm: km,
    durationMin: Math.ceil(
      (km / t.speedKmH) * 60 + t.overheadMin + (crossing?.min ?? 0)
    ),
    costUsd: Math.round((t.cost(km) + (crossing?.usd ?? 0)) * 100) / 100,
  };
}

/**
 * Every mode that could sensibly serve this leg, cheapest first. Always
 * returns at least one option: rideshare and driving can cover any leg that
 * is reachable at all.
 */
export function legOptions(from: LatLng, to: LatLng): LegEstimate[] {
  const km = haversineKm(from, to);
  const a = landmass(from);
  const b = landmass(to);

  let allowed: TransportMode[];
  if (a === b) {
    allowed = ['walk', 'muni', 'bart', 'rideshare', 'drive'];
  } else {
    // Across water: walking is impossible and Muni does not run. Whatever the
    // crossing table lists is exactly what can make this leg.
    const c = CROSSING[crossingKey(a, b)];
    allowed = c ? (Object.keys(c) as TransportMode[]) : ['rideshare', 'drive'];
  }

  const options: LegEstimate[] = [];
  for (const mode of allowed) {
    if (mode === 'walk' && km > MAX_WALK_KM) continue;
    if ((mode === 'muni' || mode === 'bart') && km < MIN_TRANSIT_KM) continue;
    if (mode === 'drive' && km < MIN_DRIVE_KM) continue;
    if (mode === 'ferry' && km < MIN_FERRY_KM) continue;
    options.push(estimateLeg(from, to, mode));
  }
  if (options.length === 0) options.push(estimateLeg(from, to, 'rideshare'));
  return options.sort((x, y) => x.costUsd - y.costUsd);
}

/** Exposed for tests and for the routing provider's mode gating. */
export const __transportInternals = {
  landmass,
  crossingKey,
  MAX_WALK_KM,
  MIN_TRANSIT_KM,
  MIN_DRIVE_KM,
  MIN_FERRY_KM,
};
