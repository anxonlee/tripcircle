import type { LatLng, LegEstimate, TransportMode } from '../../domain/types';
import {
  type FetchRect,
  type GoogleMode,
  LegCache,
  type RawLeg,
  elementCount,
  planFetch,
  pointKey,
} from '../../lib/legCache';
import * as mockTransport from '../mock/transport';
import type { LegOptionsFn, RoutingService } from '../routing';
import { fetchJson, googleUrl } from './http';

/**
 * Google's Distance Matrix travel modes. Several of our modes share one Google
 * mode — Muni, BART and the ferry are all `transit` to Google, and rideshare
 * and driving are both `driving` — so we query each Google mode once and reuse
 * the result, then apply our own fare model on top. Google returns transit
 * fares where it has them, but cannot tell us which operator was used.
 */
const GOOGLE_MODE: Record<TransportMode, GoogleMode> = {
  walk: 'walking',
  muni: 'transit',
  bart: 'transit',
  ferry: 'transit',
  rideshare: 'driving',
  drive: 'driving',
};

const APP_MODES: TransportMode[] = [
  'walk', 'muni', 'bart', 'ferry', 'rideshare', 'drive',
];

/** The three requests those six modes actually collapse into. */
const GOOGLE_MODES: GoogleMode[] = ['walking', 'transit', 'driving'];

interface MatrixResponse {
  status: string;
  rows?: {
    elements?: {
      status: string;
      duration?: { value: number };
      distance?: { value: number };
      fare?: { value: number; currency: string };
    }[];
  }[];
}

/** Same caps as the mock model, so mode choice stays comparable. */
const MAX_WALK_KM = 3.5;
const MIN_TRANSIT_KM = 0.6;
const MIN_DRIVE_KM = 1.5;

/** Rideshare pricing isn't in the Maps APIs, so we estimate from real driving. */
function rideshareUsd(km: number, min: number): number {
  return 2.8 + km * 1.15 + min * 0.35;
}

/**
 * Google Distance Matrix implementation of RoutingService.
 *
 * The optimizer is pure and synchronous, so it cannot await anything mid-plan.
 * `getLegOptionsFn(points)` therefore fills a cache up front and hands back a
 * plain lookup function. This is exactly the seam the mock was designed
 * around, so the optimizer itself is unchanged.
 *
 * Distance Matrix bills per origin-destination element, so the arithmetic of
 * what we ask for matters more than how many requests we make. Two things
 * keep it down. The cache in lib/legCache means a day is bought once rather
 * than once per solve — the four objectives re-solve the same day, and
 * adding a ninth place buys seventeen pairs rather than eighty-one. And every
 * fetch is keyed on Google's mode rather than ours, so the transit request
 * that answers for Muni also answers for BART and the ferry instead of being
 * bought three times over.
 *
 * Known gap: Distance Matrix caps a request at 25 origins, 25 destinations
 * and 100 elements. Nothing here chunks, so a day of eleven or more places
 * would have its whole matrix rejected and fall back to local estimates.
 *
 * Any leg Google can't answer for falls back to the local estimate, so a
 * partial API failure degrades quality instead of breaking planning.
 */
export class GoogleRoutingService implements RoutingService {
  /**
   * Lives for the life of the process, not the screen. A plan screen that
   * remounts — which is every navigation back to it — must not re-buy the day
   * it already paid for.
   */
  private readonly cache = new LegCache();

  /**
   * Identical requests in flight at the same moment.
   *
   * Two screens mounting together, or a selection change landing while the
   * first fetch is still out, would otherwise buy the same rectangle twice.
   * Sharing the promise costs nothing and closes the window.
   */
  private readonly inFlight = new Map<string, Promise<void>>();

  async estimateLeg(
    from: LatLng,
    to: LatLng,
    mode: TransportMode
  ): Promise<LegEstimate> {
    const now = Date.now();
    await this.warm([from, to], now);
    return (
      this.derive(mode, from, to, now) ?? mockTransport.estimateLeg(from, to, mode)
    );
  }

  async legOptions(from: LatLng, to: LatLng): Promise<LegEstimate[]> {
    const fn = await this.getLegOptionsFn([from, to]);
    return fn(from, to);
  }

  async getLegOptionsFn(points: LatLng[] = []): Promise<LegOptionsFn> {
    if (points.length < 2) return mockTransport.legOptions;

    // One timestamp for the whole plan: a leg must not expire between two
    // lookups within a single solve, or the day would be costed against two
    // different sets of numbers.
    const now = Date.now();
    await this.warm(points, now);

    return (from: LatLng, to: LatLng): LegEstimate[] => {
      const fallback = mockTransport.legOptions(from, to);
      const out: LegEstimate[] = [];
      for (const mode of APP_MODES) {
        const hit = this.derive(mode, from, to, now);
        if (hit) {
          // Apply the same "is this mode sensible here" rules as the mock.
          if (mode === 'walk' && hit.distanceKm > MAX_WALK_KM) continue;
          if (
            (mode === 'muni' || mode === 'bart') &&
            hit.distanceKm < MIN_TRANSIT_KM
          )
            continue;
          if (mode === 'drive' && hit.distanceKm < MIN_DRIVE_KM) continue;
          out.push(hit);
        } else {
          const f = fallback.find((o) => o.mode === mode);
          if (f) out.push(f);
        }
      }
      const options = out.length > 0 ? out : fallback;
      return options.sort((a, b) => a.costUsd - b.costUsd);
    };
  }

  /** How many elements the cache has saved paying for. Diagnostics only. */
  get cachedLegs(): number {
    return this.cache.size;
  }

  /**
   * Buys whatever these points still need, and nothing they don't.
   *
   * A failed mode is swallowed rather than thrown: its legs simply stay
   * missing, and every read falls through to the local estimate.
   */
  private async warm(points: LatLng[], now: number): Promise<void> {
    await Promise.all(
      GOOGLE_MODES.map(async (mode) => {
        const rects = planFetch(this.cache, mode, points, now);
        if (rects.length === 0) return;
        await Promise.all(
          rects.map((rect) => this.fetchRect(mode, rect, now).catch(() => undefined))
        );
      })
    );
  }

  private fetchRect(mode: GoogleMode, rect: FetchRect, now: number): Promise<void> {
    const key = `${mode}|${rect.origins.map(pointKey).join(';')}|${rect.destinations
      .map(pointKey)
      .join(';')}`;
    const pending = this.inFlight.get(key);
    if (pending) return pending;

    const run = this.requestMatrix(mode, rect, now).finally(() => {
      this.inFlight.delete(key);
    });
    this.inFlight.set(key, run);
    return run;
  }

  private async requestMatrix(
    mode: GoogleMode,
    rect: FetchRect,
    now: number
  ): Promise<void> {
    const enc = (p: LatLng[]) =>
      p.map((c) => `${c.latitude},${c.longitude}`).join('|');

    const url = googleUrl('/maps/api/distancematrix/json', {
      origins: enc(rect.origins),
      destinations: enc(rect.destinations),
      mode,
      units: 'metric',
    });

    // Guarded rather than bare: `__DEV__` is a React Native global and does
    // not exist under Jest, where a bare reference would throw.
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.log(
        `[PIRT] distance matrix ${mode}: ${elementCount([rect])} elements`
      );
    }

    const res = await fetchJson<MatrixResponse>(url);
    if (res.status !== 'OK' || !res.rows) return;

    res.rows.forEach((row, i) => {
      row.elements?.forEach((el, j) => {
        if (el.status !== 'OK' || !el.duration || !el.distance) return;
        const from = rect.origins[i];
        const to = rect.destinations[j];
        if (!from || !to || pointKey(from) === pointKey(to)) return;
        this.cache.set(
          mode,
          from,
          to,
          {
            durationMin: Math.ceil(el.duration.value / 60),
            distanceKm: el.distance.value / 1000,
          },
          now
        );
      });
    });
  }

  /**
   * Turns one measured journey into one of our modes.
   *
   * Google measures; we price. It returns a fare for some Bay Area transit
   * trips but never says which operator ran it, so it cannot be attributed to
   * a specific mode and our own fare model stays authoritative.
   */
  private derive(
    mode: TransportMode,
    from: LatLng,
    to: LatLng,
    now: number
  ): LegEstimate | null {
    const raw: RawLeg | null = this.cache.get(GOOGLE_MODE[mode], from, to, now);
    if (!raw) return null;

    let costUsd = 0;
    if (mode === 'muni' || mode === 'bart' || mode === 'ferry' || mode === 'drive') {
      costUsd = mockTransport.estimateLeg(from, to, mode).costUsd;
    } else if (mode === 'rideshare') {
      costUsd = rideshareUsd(raw.distanceKm, raw.durationMin);
    }

    return {
      mode,
      durationMin: raw.durationMin,
      costUsd: Math.round(costUsd * 100) / 100,
      distanceKm: raw.distanceKm,
    };
  }
}
