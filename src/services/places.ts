import { config } from '../config';
import { haversineKm } from '../lib/geo';
import type { Landmark, LatLng, CuratedPlace } from '../domain/types';
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
  listPlaces(): Promise<CuratedPlace[]>;
  getPlace(id: string): Promise<CuratedPlace | undefined>;
  /** Free-text place search, biased toward `near` when supplied. */
  searchPlaces(query: string, near?: LatLng): Promise<CuratedPlace[]>;
  /**
   * Places nearest a point, closest first. Resolves "where am I" at stamp
   * time from a single foreground location fix.
   */
  nearbyPlaces(to: LatLng, limitKm?: number): Promise<CuratedPlace[]>;
}

class MockPlacesService implements PlacesService {
  async searchLandmarks(query: string): Promise<Landmark[]> {
    const q = query.trim().toLowerCase();
    if (!q) return bayAreaLandmarks;
    return bayAreaLandmarks.filter((lm) => lm.name.toLowerCase().includes(q));
  }

  async listPlaces(): Promise<CuratedPlace[]> {
    return bayAreaPlaces;
  }

  async getPlace(id: string): Promise<CuratedPlace | undefined> {
    return bayAreaPlaces.find((p) => p.id === id);
  }

  async searchPlaces(query: string): Promise<CuratedPlace[]> {
    const q = query.trim().toLowerCase();
    if (!q) return bayAreaPlaces;
    return bayAreaPlaces.filter((p) => p.name.toLowerCase().includes(q));
  }

  async nearbyPlaces(to: LatLng, limitKm = 1.5): Promise<CuratedPlace[]> {
    return bayAreaPlaces
      .map((place) => ({ place, km: haversineKm(to, place.location) }))
      .filter((x) => x.km <= limitKm)
      .sort((a, b) => a.km - b.km)
      .map((x) => x.place);
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
