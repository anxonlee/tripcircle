import { config } from '../config';
import type { Landmark, LatLng, Place } from '../domain/types';
import { bayAreaLandmarks } from './mock/landmarks';
import { bayAreaPlaces } from './mock/bayAreaPlaces';

/**
 * THE provider boundary for POI data (PRD §12: map/POI licensing).
 * Components and stores may only reach place data through this interface —
 * never import mock data (or a provider SDK) directly.
 *
 * Methods are async even though the mock is instant, because every real
 * provider is.
 */
export interface PlacesService {
  /** Landmark suggestions for start-place setup. Empty query = popular list. */
  searchLandmarks(query: string): Promise<Landmark[]>;
  /**
   * Every place the app can resolve by id — the curated set plus anything
   * discovered through search. Screens map stored ids back to places with it.
   */
  listPlaces(): Promise<Place[]>;
  getPlace(id: string): Promise<Place | undefined>;
  /** Free-text place search, biased toward `near` when supplied. */
  searchPlaces(query: string, near?: LatLng): Promise<Place[]>;
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

  async searchPlaces(query: string): Promise<Place[]> {
    const q = query.trim().toLowerCase();
    if (!q) return bayAreaPlaces;
    return bayAreaPlaces.filter((p) => p.name.toLowerCase().includes(q));
  }
}

export const mockPlacesService: PlacesService = new MockPlacesService();

/**
 * App-wide singleton. Swap the implementation here, nowhere else.
 * The real provider engages only when a Google key (or proxy) is configured,
 * so the app stays fully usable on mock data during development.
 */
function resolvePlacesService(): PlacesService {
  if (!config.useRealProviders) return mockPlacesService;
  // Required lazily so the mock build never pulls in provider code.
  const { GooglePlacesService } = require('./google/placesProvider') as
    typeof import('./google/placesProvider');
  return new GooglePlacesService();
}

export const placesService: PlacesService = resolvePlacesService();

/** True when place search hits a live provider rather than the curated list. */
export const placeSearchIsLive = config.useRealProviders;
