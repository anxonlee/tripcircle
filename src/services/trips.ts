import type { CostShare, Trip } from '../domain/social';
import { costSharesByTrip, trips } from './mock/trips';

/**
 * Saved-trips provider boundary (Phases 2 & 4). Multi-stay trips, shared
 * trips, and the cost-split ledger all resolve through here so a sync layer
 * can replace the mock without touching the screens.
 */
export interface TripsService {
  listTrips(): Promise<Trip[]>;
  getTrip(id: string): Promise<Trip | undefined>;
  getCostShares(tripId: string): Promise<CostShare[]>;
}

class MockTripsService implements TripsService {
  async listTrips(): Promise<Trip[]> {
    return trips;
  }
  async getTrip(id: string): Promise<Trip | undefined> {
    return trips.find((t) => t.id === id);
  }
  async getCostShares(tripId: string): Promise<CostShare[]> {
    return costSharesByTrip[tripId] ?? [];
  }
}

export const tripsService: TripsService = new MockTripsService();
