import type { Landmark, Place } from '../domain/types';
import { bayAreaLandmarks } from './mock/landmarks';
import { bayAreaPlaces } from './mock/bayAreaPlaces';

/**
 * THE provider boundary for POI data (PRD §12: map/POI licensing).
 * Components and stores may only reach place data through this interface —
 * never import mock data (or a future SDK) directly. Swapping to Google
 * Places / Foursquare later means writing one new class implementing this.
 *
 * Methods are async even though the mock is instant, because every real
 * provider will be.
 */
export interface PlacesService {
  /** Landmark suggestions for start-place setup. Empty query = popular list. */
  searchLandmarks(query: string): Promise<Landmark[]>;
  /** All saved/browsable places (the mock "wishlist" universe). */
  listPlaces(): Promise<Place[]>;
  getPlace(id: string): Promise<Place | undefined>;
}

class MockPlacesService implements PlacesService {
  async searchLandmarks(query: string): Promise<Landmark[]> {
    const q = query.trim().toLowerCase();
    if (!q) return bayAreaLandmarks;
    return bayAreaLandmarks.filter((lm) => lm.name.toLowerCase().includes(q));
  }

  async listPlaces(): Promise<Place[]> {
    return bayAreaPlaces;
  }

  async getPlace(id: string): Promise<Place | undefined> {
    return bayAreaPlaces.find((p) => p.id === id);
  }
}

/** App-wide singleton. Swap the implementation here, nowhere else. */
export const placesService: PlacesService = new MockPlacesService();
