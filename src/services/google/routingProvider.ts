import type { LatLng, LegEstimate, TransportMode } from '../../domain/types';
import * as mockTransport from '../mock/transport';
import type { LegOptionsFn, RoutingService } from '../routing';
import { fetchJson, googleUrl } from './http';

/** Google's mode names for the Distance Matrix API. */
const GOOGLE_MODE: Record<TransportMode, string> = {
  walk: 'walking',
  transit: 'transit',
  taxi: 'driving',
};

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

/** Rideshare pricing isn't in the Maps APIs, so we estimate from real driving. */
function rideshareUsd(km: number, min: number): number {
  return 2.8 + km * 1.15 + min * 0.35;
}

function keyOf(a: LatLng, b: LatLng): string {
  const r = (n: number) => n.toFixed(5);
  return `${r(a.latitude)},${r(a.longitude)}|${r(b.latitude)},${r(b.longitude)}`;
}

/**
 * Google Distance Matrix implementation of RoutingService.
 *
 * The optimizer is pure and synchronous, so it cannot await anything mid-plan.
 * `getLegOptionsFn(points)` therefore prefetches the full N×N matrix — one
 * request per travel mode — and hands back a plain lookup function. This is
 * exactly the seam the mock was designed around, so the optimizer itself is
 * unchanged.
 *
 * Any leg Google can't answer for falls back to the local estimate, so a
 * partial API failure degrades quality instead of breaking planning.
 */
export class GoogleRoutingService implements RoutingService {
  async estimateLeg(
    from: LatLng,
    to: LatLng,
    mode: TransportMode
  ): Promise<LegEstimate> {
    const table = await this.fetchMatrix([from], [to], mode);
    return table.get(keyOf(from, to)) ?? mockTransport.estimateLeg(from, to, mode);
  }

  async legOptions(from: LatLng, to: LatLng): Promise<LegEstimate[]> {
    const fn = await this.getLegOptionsFn([from, to]);
    return fn(from, to);
  }

  async getLegOptionsFn(points: LatLng[] = []): Promise<LegOptionsFn> {
    if (points.length < 2) return mockTransport.legOptions;

    const modes: TransportMode[] = ['walk', 'transit', 'taxi'];
    const tables = await Promise.all(
      modes.map((m) =>
        this.fetchMatrix(points, points, m).catch(
          () => new Map<string, LegEstimate>()
        )
      )
    );
    const byMode = new Map<TransportMode, Map<string, LegEstimate>>();
    modes.forEach((m, i) => byMode.set(m, tables[i]));

    return (from: LatLng, to: LatLng): LegEstimate[] => {
      const key = keyOf(from, to);
      const fallback = mockTransport.legOptions(from, to);
      const out: LegEstimate[] = [];
      for (const mode of modes) {
        const hit = byMode.get(mode)?.get(key);
        if (hit) {
          // Apply the same "is this mode sensible here" rules as the mock.
          if (mode === 'walk' && hit.distanceKm > MAX_WALK_KM) continue;
          if (mode === 'transit' && hit.distanceKm < MIN_TRANSIT_KM) continue;
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

  private async fetchMatrix(
    origins: LatLng[],
    destinations: LatLng[],
    mode: TransportMode
  ): Promise<Map<string, LegEstimate>> {
    const table = new Map<string, LegEstimate>();
    const enc = (p: LatLng[]) =>
      p.map((c) => `${c.latitude},${c.longitude}`).join('|');

    const url = googleUrl('/maps/api/distancematrix/json', {
      origins: enc(origins),
      destinations: enc(destinations),
      mode: GOOGLE_MODE[mode],
      units: 'metric',
    });

    const res = await fetchJson<MatrixResponse>(url);
    if (res.status !== 'OK' || !res.rows) return table;

    res.rows.forEach((row, i) => {
      row.elements?.forEach((el, j) => {
        if (el.status !== 'OK' || !el.duration || !el.distance) return;
        if (i === j && origins[i] === destinations[j]) return;
        const km = el.distance.value / 1000;
        const min = Math.ceil(el.duration.value / 60);
        let costUsd = 0;
        if (mode === 'transit') {
          // Google returns real fares for Bay Area transit when it has them.
          costUsd = el.fare?.value ?? mockTransport.estimateLeg(
            origins[i],
            destinations[j],
            'transit'
          ).costUsd;
        } else if (mode === 'taxi') {
          costUsd = rideshareUsd(km, min);
        }
        table.set(keyOf(origins[i], destinations[j]), {
          mode,
          durationMin: min,
          costUsd: Math.round(costUsd * 100) / 100,
          distanceKm: km,
        });
      });
    });
    return table;
  }
}
