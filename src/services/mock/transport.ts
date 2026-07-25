import type { LatLng, LegEstimate, TransportMode } from '../../domain/types';
import { haversineKm } from '../../lib/geo';

/**
 * Mock speed + cost tables approximating Bay Area travel. Pure and synchronous
 * so the optimizer can consume it directly; MockRoutingService wraps it in
 * the async RoutingService interface.
 *
 * Model per mode:
 *  - speed is door-to-door effective speed over straight-line distance
 *  - overhead covers waiting/hailing/station access
 *  - transit mimics Muni's flat fare stepping up to BART's distance-based
 *    fare on longer hops; taxi mimics a rideshare fare
 *
 * Fares are 2026: Muni single ride $2.85 (Clipper), BART averages $5.18.
 */
const MODE_TABLE: Record<
  TransportMode,
  { speedKmH: number; overheadMin: number; cost: (km: number) => number }
> = {
  walk: {
    speedKmH: 4.5,
    overheadMin: 0,
    cost: () => 0,
  },
  transit: {
    speedKmH: 16,
    overheadMin: 10,
    cost: (km) => {
      if (km <= 8) return 2.85; // Muni flat fare, in-city
      if (km <= 20) return 4.5; // short BART hop
      if (km <= 40) return 6.5;
      return 9.0; // across the bay / down the Peninsula
    },
  },
  taxi: {
    speedKmH: 26,
    overheadMin: 5,
    cost: (km) => 7 + Math.max(0, km - 1) * 2.4,
  },
};

/** Walking further than this is never offered as an option. */
const MAX_WALK_KM = 3.5;
/** Below this distance transit is pointless (overhead dominates). */
const MIN_TRANSIT_KM = 0.6;

export function estimateLeg(
  from: LatLng,
  to: LatLng,
  mode: TransportMode
): LegEstimate {
  const km = haversineKm(from, to);
  const t = MODE_TABLE[mode];
  return {
    mode,
    distanceKm: km,
    durationMin: Math.ceil((km / t.speedKmH) * 60 + t.overheadMin),
    costUsd: Math.round(t.cost(km)),
  };
}

/**
 * All sensible mode options for a leg, cheapest-first. Always returns at
 * least one option (taxi covers any distance).
 */
export function legOptions(from: LatLng, to: LatLng): LegEstimate[] {
  const km = haversineKm(from, to);
  const options: LegEstimate[] = [];
  if (km <= MAX_WALK_KM) options.push(estimateLeg(from, to, 'walk'));
  if (km >= MIN_TRANSIT_KM) options.push(estimateLeg(from, to, 'transit'));
  options.push(estimateLeg(from, to, 'taxi'));
  return options.sort((a, b) => a.costUsd - b.costUsd);
}
