import type { LatLng, LegEstimate, TransportMode } from '../domain/types';
import * as mockTransport from './mock/transport';

/**
 * THE provider boundary for routing/directions (PRD §12). Components and
 * stores may only get travel estimates through this interface. A real
 * provider (Google Directions, GTFS, …) later implements this same class.
 *
 * The optimizer is pure/synchronous, so it does NOT call this interface at
 * plan time. Instead it takes a `LegOptionsFn`; `getLegOptionsFn()` hands the
 * app a snapshot function to inject. With a real async provider this becomes
 * "prefetch the leg matrix, then return a sync lookup" — the optimizer never
 * changes.
 */
export type LegOptionsFn = (from: LatLng, to: LatLng) => LegEstimate[];

export interface RoutingService {
  estimateLeg(from: LatLng, to: LatLng, mode: TransportMode): Promise<LegEstimate>;
  /** All sensible mode options for a leg, cheapest-first. */
  legOptions(from: LatLng, to: LatLng): Promise<LegEstimate[]>;
  /** Synchronous leg estimator for the optimizer to consume. */
  getLegOptionsFn(): Promise<LegOptionsFn>;
}

class MockRoutingService implements RoutingService {
  async estimateLeg(
    from: LatLng,
    to: LatLng,
    mode: TransportMode
  ): Promise<LegEstimate> {
    return mockTransport.estimateLeg(from, to, mode);
  }

  async legOptions(from: LatLng, to: LatLng): Promise<LegEstimate[]> {
    return mockTransport.legOptions(from, to);
  }

  async getLegOptionsFn(): Promise<LegOptionsFn> {
    return mockTransport.legOptions;
  }
}

/** App-wide singleton. Swap the implementation here, nowhere else. */
export const routingService: RoutingService = new MockRoutingService();
