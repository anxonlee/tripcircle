import type { LatLng, StartPlace, TransportMode } from '../domain/types';
import type { DayPlan } from './optimizer';

/**
 * Google Maps handoff. TripCircle plans the day; Google walks you through it
 * turn by turn (PRD §14 MVP export / F19). Both builders return universal
 * Maps URLs, which the OS routes to the Google Maps app when it is installed
 * and to the browser when it is not — so there is no scheme to probe and no
 * fallback to write.
 *
 * Ported from the Hong Kong branch (57a9512) and adapted to the six Bay Area
 * transport modes.
 */

const coord = ({ latitude, longitude }: LatLng) => `${latitude},${longitude}`;

/**
 * The Maps URL API accepts four travel modes, and the app models six. Muni,
 * BART, and the ferry are all public transit as far as Google is concerned;
 * rideshare is somebody else driving, which routes identically to driving.
 */
const TRAVEL_MODE: Record<TransportMode, 'walking' | 'transit' | 'driving'> = {
  walk: 'walking',
  muni: 'transit',
  bart: 'transit',
  ferry: 'transit',
  rideshare: 'driving',
  drive: 'driving',
};

/**
 * The Maps URL API caps intermediate waypoints at nine. A longer day still
 * opens — it is just routed through the first nine stops — so this trims
 * rather than refuses. `dayExceedsMapsWaypointCap` lets the UI say so.
 */
const MAX_WAYPOINTS = 9;

export function dayExceedsMapsWaypointCap(plan: DayPlan): boolean {
  return plan.stops.length > MAX_WAYPOINTS;
}

/**
 * The mode the whole-day route will open in.
 *
 * Deliberately never `transit`. Google's transit engine routes one origin to
 * one destination and ignores waypoints — asking it for a multi-stop transit
 * loop returns "No routes found", which is what shipped the first time this
 * was wired up. Driving and walking are the only modes that carry waypoints,
 * so a BART day opens as a driving overview and the rider uses the per-stop
 * button, which *can* do transit, for each leg.
 *
 * Walking wins only when the optimizer walked the entire day; one BART leg is
 * enough to make a walking overview a lie about a 30 km loop.
 */
export function dayMapsTravelMode(plan: DayPlan): 'driving' | 'walking' {
  const legs = [...plan.stops.map((s) => s.leg), ...(plan.returnLeg ? [plan.returnLeg] : [])];
  return legs.length > 0 && legs.every((l) => l.mode === 'walk') ? 'walking' : 'driving';
}

/** True when the day's own transport is transit the overview cannot express. */
export function dayOverviewMisstatesTransit(plan: DayPlan): boolean {
  const legs = [...plan.stops.map((s) => s.leg), ...(plan.returnLeg ? [plan.returnLeg] : [])];
  return legs.some((l) => TRAVEL_MODE[l.mode] === 'transit');
}

/**
 * The whole day as one round trip: out from the anchor, through every stop in
 * plan order, back to the anchor.
 */
export function googleMapsDirUrl(startPlace: StartPlace, plan: DayPlan): string {
  const origin = coord(startPlace.location);
  const waypoints = plan.stops
    .slice(0, MAX_WAYPOINTS)
    .map((s) => coord(s.place.location))
    .join('|');

  const params = new URLSearchParams({
    api: '1',
    origin,
    destination: origin,
    travelmode: dayMapsTravelMode(plan),
  });

  const base = `https://www.google.com/maps/dir/?${params.toString()}`;
  return waypoints ? `${base}&waypoints=${encodeURIComponent(waypoints)}` : base;
}

/**
 * A single stop, opened as directions from wherever the user currently is.
 *
 * The destination is the coordinate rather than the place name: the name is a
 * search string Google may resolve to a different branch of the same chain,
 * and the coordinate is what the day was actually planned against.
 */
export function googleMapsStopUrl(location: LatLng, mode: TransportMode): string {
  const params = new URLSearchParams({
    api: '1',
    destination: coord(location),
    travelmode: TRAVEL_MODE[mode],
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

