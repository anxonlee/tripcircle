import type { LatLng, Landmark, StartPlace } from '../domain/types';

const EARTH_RADIUS_KM = 6371;

/** Great-circle distance in km. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/**
 * PRD §3.1 coarse storage: snap to ~100m block-level precision.
 * 3 decimal places ≈ 111m latitude / ~88m longitude at San Francisco's latitude.
 * Nothing finer than this may ever be persisted for a start place.
 */
export function snapToCoarse(loc: LatLng): LatLng {
  const snap = (v: number) => Math.round(v * 1000) / 1000;
  return { latitude: snap(loc.latitude), longitude: snap(loc.longitude) };
}

/** The only sanctioned way to turn a landmark into a stored start place. */
export function makeStartPlace(landmark: Landmark): StartPlace {
  return {
    id: landmark.id,
    name: landmark.name,
    kind: landmark.kind,
    location: snapToCoarse(landmark.location),
  };
}

/**
 * Minutes-since-midnight → "9:05" / "17:30" display string.
 *
 * Rounded to the minute BEFORE the hour is taken. Rounding the two halves
 * independently is what prints "9:60": 599.6 floors to hour 9 while its 59.6
 * remaining minutes round to 60. Both routing providers currently ceil their
 * durations, so nothing fractional reaches here today — which is exactly why
 * the guard belongs in the formatter rather than in the callers, where it
 * survives only as long as every future one remembers.
 */
export function formatTime(minutes: number): string {
  const rounded = Math.round(minutes);
  const m = ((rounded % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, '0');
  return `${h}:${mm}`;
}

/**
 * A moment inside this outing, which may legitimately fall past midnight.
 *
 * `formatTime` wraps modulo 1440. That is right for a *clock* time — a
 * closing time of 26:00 reads correctly as "2:00" — and wrong for anything
 * naming a point in the day being planned: a finish at 24:16 rendered as
 * "0:16" reads as a quarter past midnight this morning, sixteen hours before
 * the day it belongs to.
 *
 * This began as the finish time alone, on the grounds that the finish was
 * the only number that could overrun. Start day can now be told to run a day
 * whose window has passed, and then the stops overrun too: a stepper reading
 * "Arrive 0:04" for a place reached four minutes after midnight, sitting
 * above a warning that it shut at 19:00, is the same lie one line earlier.
 *
 * So: use this for anything the plan works out — arrivals, the finish. Use
 * `formatTime` for clock times the world imposes, which are opening hours and
 * the window the user set.
 */
export function formatDayTime(minutes: number): string {
  return isNextDay(minutes) ? `${formatTime(minutes)} next day` : formatTime(minutes);
}

/**
 * Whether a plan time has crossed midnight.
 *
 * The same question `formatDayTime` answers, for the places too narrow to
 * spend eight characters saying so — the plan timeline puts the words on
 * their own line under the arrival. Exported so the threshold lives here,
 * beside the formatter, rather than as a 1440 in a screen.
 */
export function isNextDay(minutes: number): boolean {
  return minutes >= 1440;
}
