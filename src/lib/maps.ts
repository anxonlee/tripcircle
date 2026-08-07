import type {
  CuratedPlace,
  LatLng,
  StartPlace,
  TransportMode,
} from '../domain/types';
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

/**
 * Six decimal places, which is roughly 0.1 m — far finer than anything here
 * needs, and chosen for that reason. Snapping harder would move a curated
 * place off its own doorstep, and start places are already coarse-snapped to
 * ~100 m by `makeStartPlace` (§3.1), so rounding again would blunt them
 * twice.
 *
 * What it does remove is binary floating-point residue. Arithmetic on
 * coordinates yields values like -122.41816000000002, and sending that to
 * Google claims a precision of about a nanometre — noise in a URL, and more
 * precision than the dataset has at any point.
 */
const coord = ({ latitude, longitude }: LatLng) => {
  const round = (v: number) => Math.round(v * 1e6) / 1e6;
  return `${round(latitude)},${round(longitude)}`;
};

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
 * How many waypoints survive the hand-off.
 *
 * Google carries up to nine in its own app and three in a mobile browser, and
 * drops the excess without saying so. Since the app opens only when it is
 * installed, the same five-stop day arrives whole in one target and quietly
 * short in the other — which is why the caller is told what was dropped
 * rather than left to find out.
 */
export const WAYPOINT_LIMIT_APP = 9;
export const WAYPOINT_LIMIT_BROWSER = 3;

export function waypointLimit(googleMapsInstalled: boolean): number {
  return googleMapsInstalled ? WAYPOINT_LIMIT_APP : WAYPOINT_LIMIT_BROWSER;
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

export interface DayRoute {
  url: string;
  /** Stops that did not fit the waypoint limit. Empty when the day fits. */
  dropped: CuratedPlace[];
}

/**
 * The whole day as one round trip: out from the anchor, through every stop in
 * plan order, back to the anchor.
 *
 * Origin and destination are both the start place because a day out comes
 * back. That costs nothing — neither counts against the waypoint limit, which
 * applies only to the stops between them.
 *
 * Returns what would not fit rather than a bare URL. The route must never
 * differ silently from the day on screen, and a caller handed only a string
 * has no way to honour that.
 */
export function googleMapsDirUrl(
  startPlace: StartPlace,
  plan: DayPlan,
  limit: number = WAYPOINT_LIMIT_APP
): DayRoute {
  const origin = coord(startPlace.location);
  const places = plan.stops.map((s) => s.place);
  const kept = places.slice(0, Math.max(0, limit));
  const dropped = places.slice(kept.length);

  const params = new URLSearchParams({
    api: '1',
    origin,
    destination: origin,
    travelmode: dayMapsTravelMode(plan),
  });

  const base = `https://www.google.com/maps/dir/?${params.toString()}`;
  const waypoints = kept.map((p) => coord(p.location)).join('|');
  const url = waypoints
    ? `${base}&waypoints=${encodeURIComponent(waypoints)}`
    : base;

  return { url, dropped };
}

/** What to tell the user before opening a route that will not carry the day. */
export function droppedStopsWarning(dropped: CuratedPlace[]): string | null {
  if (dropped.length === 0) return null;
  const names = dropped.map((p) => p.name);
  const list =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  const is = names.length === 1 ? 'is' : 'are';
  const it = names.length === 1 ? 'it' : 'them';
  return `Google Maps will not carry the whole day. ${list} ${is} not in the route it opens — you still have ${it} here.`;
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

