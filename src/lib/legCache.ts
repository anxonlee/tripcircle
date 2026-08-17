/**
 * What we already know about a leg, and how little we still have to buy.
 *
 * Distance Matrix bills per element — one origin paired with one destination —
 * not per request. A day out of N places asks for an N×N matrix, so the cost
 * grows with the square of the day: eight places is 64 elements, and adding a
 * ninth naively costs another 81 rather than the 17 pairs that are genuinely
 * new. Re-solving for a different objective asks for the same matrix again.
 *
 * So the unit of caching here is the individual leg, not the matrix. That is
 * what makes an incremental change cheap: the planner below works out which
 * points the cache cannot fully answer for, and asks for only the rectangles
 * covering those.
 *
 * Pure and clock-injected, so the expiry and the arithmetic can be tested
 * without a device or a network.
 */

import type { LatLng } from '../domain/types';

/**
 * Google's own travel modes, which are fewer than ours. Muni, BART and the
 * ferry are one `transit` request; rideshare and driving are one `driving`
 * request. Caching against Google's mode rather than ours is what stops the
 * same journey being bought three times over.
 */
export type GoogleMode = 'walking' | 'transit' | 'driving';

/** Only what Google actually measured. Fares are our own model's job. */
export interface RawLeg {
  durationMin: number;
  distanceKm: number;
}

/**
 * How long a measurement stays usable.
 *
 * The requests carry no `departure_time`, so transit answers are relative to
 * when they were asked — a journey costed at 09:00 is not the same journey at
 * 18:00, and an evening plan built on morning frequencies would be quietly
 * wrong in the one direction that strands someone. Half an hour is long
 * enough to cover a session of adjusting a day and short enough that the
 * timetable underneath has not meaningfully moved.
 */
export const LEG_TTL_MS = 30 * 60 * 1000;

/**
 * Ceiling on remembered legs.
 *
 * Purely a memory guard. At three modes, this is roughly a 35-place day's
 * worth of pairs, far beyond anything a single day out reaches, so in practice
 * the TTL evicts long before the cap does.
 */
export const LEG_CACHE_CAP = 4000;

/**
 * Five decimal places is about a metre.
 *
 * Coordinates arrive from the curated dataset and from a coarse-snapped start
 * place, so they are already stable to far less than this; rounding exists so
 * that a float that has been through a round trip still finds its own entry.
 */
export function pointKey(p: LatLng): string {
  return `${p.latitude.toFixed(5)},${p.longitude.toFixed(5)}`;
}

export function legKey(mode: GoogleMode, from: LatLng, to: LatLng): string {
  return `${mode}|${pointKey(from)}|${pointKey(to)}`;
}

interface Entry {
  leg: RawLeg;
  at: number;
}

/** One rectangle of a Distance Matrix request: every origin against every destination. */
export interface FetchRect {
  origins: LatLng[];
  destinations: LatLng[];
}

/** What a set of rectangles will be billed as. */
export function elementCount(rects: FetchRect[]): number {
  return rects.reduce((n, r) => n + r.origins.length * r.destinations.length, 0);
}

/**
 * What one Distance Matrix request will accept.
 *
 * Exceeding any of these fails the whole request, not the excess — so an
 * unchunked eleven-place day loses every leg it asked for and silently falls
 * back to local estimates. Eleven places is not a normal day out, but a shared
 * link carries whatever the sender put in it.
 */
export const MAX_ORIGINS = 25;
export const MAX_DESTINATIONS = 25;
export const MAX_ELEMENTS = 100;

/**
 * Cuts a rectangle into tiles no request will refuse.
 *
 * Tiles rather than rows: the element ceiling binds long before the origin
 * and destination ones do, and tiling to the widest allowed strip keeps the
 * request count at the minimum the ceiling permits. A 25×25 rectangle is 625
 * elements and goes out as seven requests, which is exactly 625 over 100
 * rounded up.
 *
 * Splitting changes nothing about the bill. The same pairs are asked for
 * either way; this only decides how many envelopes they travel in.
 */
export function chunkRect(rect: FetchRect): FetchRect[] {
  const { origins, destinations } = rect;
  if (origins.length === 0 || destinations.length === 0) return [];

  const perRequestDestinations = Math.min(MAX_DESTINATIONS, destinations.length);
  const perRequestOrigins = Math.min(
    MAX_ORIGINS,
    origins.length,
    Math.floor(MAX_ELEMENTS / perRequestDestinations)
  );

  const out: FetchRect[] = [];
  for (let o = 0; o < origins.length; o += perRequestOrigins) {
    for (let d = 0; d < destinations.length; d += perRequestDestinations) {
      out.push({
        origins: origins.slice(o, o + perRequestOrigins),
        destinations: destinations.slice(d, d + perRequestDestinations),
      });
    }
  }
  return out;
}

export class LegCache {
  /**
   * Insertion-ordered, which is how the cap evicts: the oldest key is the
   * first one Map hands back. Writing an existing key deletes it first so a
   * refreshed leg moves to the back rather than keeping its original place.
   */
  private entries = new Map<string, Entry>();

  constructor(
    private readonly ttlMs: number = LEG_TTL_MS,
    private readonly cap: number = LEG_CACHE_CAP
  ) {}

  get size(): number {
    return this.entries.size;
  }

  get(mode: GoogleMode, from: LatLng, to: LatLng, now: number): RawLeg | null {
    const key = legKey(mode, from, to);
    const hit = this.entries.get(key);
    if (!hit) return null;
    if (now - hit.at >= this.ttlMs) {
      this.entries.delete(key);
      return null;
    }
    return hit.leg;
  }

  set(mode: GoogleMode, from: LatLng, to: LatLng, leg: RawLeg, now: number): void {
    const key = legKey(mode, from, to);
    this.entries.delete(key);
    this.entries.set(key, { leg, at: now });
    while (this.entries.size > this.cap) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
  }

  clear(): void {
    this.entries.clear();
  }
}

/**
 * The cheapest set of requests that would fill the gaps for these points.
 *
 * The obvious rule — unsettled means "missing a pair against anything" —
 * condemns the whole matrix the moment one place is added, because every
 * existing point is now missing its pair with the newcomer. What we want
 * instead is the largest group of points the cache can already answer for
 * *among themselves*, leaving the newcomers outside it.
 *
 * Finding the true largest such group is a clique problem, so this takes the
 * greedy route: repeatedly evict whichever point has the most gaps until the
 * survivors are complete against one another. On the case that actually
 * occurs — a settled day plus a place or two — it lands on exactly the right
 * answer, and a day out never has enough points for the cubic loop to matter.
 *
 * Two rectangles then cover every missing pair:
 *
 *   everything → unsettled   (this also covers unsettled → unsettled)
 *   unsettled  → settled
 *
 * Cold, that is the N×N matrix you would have asked for anyway, less one
 * diagonal. With one place added to eight known ones it is 17 elements
 * instead of 81. With nothing new it is no request at all, which is the case
 * that matters most: switching between the four objectives re-solves the day
 * four times against one purchase.
 *
 * Both are then cut to what a single request will accept, so what comes back
 * is a list of requests to make, not a shape to work out afterwards.
 *
 * The diagonal rides along inside the rectangle and is billed even though a
 * place-to-itself leg is meaningless. Distance Matrix has no way to exclude
 * it, and paying N of N² to keep the request shape simple is the better trade.
 */
export function planFetch(
  cache: LegCache,
  mode: GoogleMode,
  points: LatLng[],
  now: number
): FetchRect[] {
  if (points.length < 2) return [];

  const pairKnown = (a: LatLng, b: LatLng) =>
    cache.get(mode, a, b, now) !== null && cache.get(mode, b, a, now) !== null;

  let survivors = [...points];
  for (;;) {
    const gaps = survivors.map(
      (p) =>
        survivors.filter((q) => pointKey(q) !== pointKey(p) && !pairKnown(p, q)).length
    );
    const worst = gaps.reduce((best, n, i) => (n > gaps[best] ? i : best), 0);
    if (gaps[worst] === 0) break;
    survivors.splice(worst, 1);
  }

  const knownKeys = new Set(survivors.map(pointKey));
  const unsettled = points.filter((p) => !knownKeys.has(pointKey(p)));
  if (unsettled.length === 0) return [];
  const known = survivors;

  // Chunked here rather than at the call site so a caller cannot forget to.
  const rects: FetchRect[] = [{ origins: points, destinations: unsettled }];
  if (known.length > 0) rects.push({ origins: unsettled, destinations: known });
  return rects.flatMap(chunkRect);
}
