import type { LatLng, LegEstimate, TransportMode } from '../../domain/types';
import { haversineKm } from '../../lib/geo';

/**
 * Mock speed + cost tables approximating Tokyo travel. Pure and synchronous
 * so the optimizer can consume it directly; MockRoutingService wraps it in
 * the async RoutingService interface.
 *
 * Model per mode:
 *  - speed is door-to-door effective speed over straight-line distance
 *  - overhead covers waiting/hailing/station access
 *  - transit fare mimics the metro's stepped fares; taxi mimics metered fare
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
    speedKmH: 20,
    overheadMin: 9,
    cost: (km) => {
      if (km <= 3) return 180;
      if (km <= 7) return 210;
      if (km <= 11) return 260;
      return 320;
    },
  },
  taxi: {
    speedKmH: 24,
    overheadMin: 4,
    cost: (km) => 500 + Math.max(0, km - 1.1) * 400,
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
    costYen: Math.round(t.cost(km)),
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
  return options.sort((a, b) => a.costYen - b.costYen);
}
