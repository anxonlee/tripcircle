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

/** Minutes-since-midnight → "9:05" / "17:30" display string. */
export function formatTime(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = String(Math.round(m % 60)).padStart(2, '0');
  return `${h}:${mm}`;
}

/**
 * The finish time of a day, which may legitimately fall past midnight.
 *
 * `formatTime` wraps modulo 1440. That is right for a closing time of 26:00,
 * which reads correctly as "2:00", and wrong for anything naming the end of
 * *this* day: a day finishing at 24:16 rendered as "0:16" reads as a quarter
 * past midnight this morning — sixteen hours before the day it belongs to,
 * and the one number on the screen a user would plan around.
 *
 * Use this for the finish. Use `formatTime` everywhere else.
 */
export function formatDayEnd(minutes: number): string {
  return minutes >= 1440 ? `${formatTime(minutes)} next day` : formatTime(minutes);
}
