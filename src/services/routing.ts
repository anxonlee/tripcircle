import { config } from '../config';
import type { LatLng, LegEstimate, TransportMode } from '../domain/types';
import * as mockTransport from './mock/transport';

/**
 * THE provider boundary for routing/directions (PRD §12). Components and
 * stores may only get travel estimates through this interface.
 *
 * The optimizer is pure/synchronous, so it does NOT call this interface at
 * plan time. Instead it takes a `LegOptionsFn`. `getLegOptionsFn(points)`
 * prefetches whatever the provider needs for those points and returns a plain
 * synchronous lookup — the mock ignores the argument, the Google provider uses
 * it to fetch one distance matrix per mode. The optimizer never changes.
 */
export type LegOptionsFn = (from: LatLng, to: LatLng) => LegEstimate[];

export interface RoutingService {
  estimateLeg(from: LatLng, to: LatLng, mode: TransportMode): Promise<LegEstimate>;
  /** All sensible mode options for a leg, cheapest-first. */
  legOptions(from: LatLng, to: LatLng): Promise<LegEstimate[]>;
  /**
   * Synchronous leg estimator for the optimizer.
   * @param points every location the plan will route between (anchor + stops).
   */
  getLegOptionsFn(points?: LatLng[]): Promise<LegOptionsFn>;
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

export const mockRoutingService: RoutingService = new MockRoutingService();

/** App-wide singleton. Swap the implementation here, nowhere else. */
function resolveRoutingService(): RoutingService {
  if (!config.useRealProviders) return mockRoutingService;
  const { GoogleRoutingService } = require('./google/routingProvider') as
    typeof import('./google/routingProvider');
  return new GoogleRoutingService();
}

export const routingService: RoutingService = resolveRoutingService();

/** True when travel times come from a live provider rather than estimates. */
export const routingIsLive = config.useRealProviders;
