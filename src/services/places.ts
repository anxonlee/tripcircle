import { config } from '../config';
import { haversineKm } from '../lib/geo';
import type { Landmark, LatLng, CuratedPlace } from '../domain/types';
import { mergePlaces } from '../lib/myPlace';
import { useMyPlacesStore, visibleMyPlaces } from '../store/useMyPlacesStore';
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
 * Adds the user's own places to whatever the provider knows.
 *
 * A wrapper rather than an edit to each implementation: it has to apply to
 * the mock and to Google alike, and screens must not have to remember to ask
 * two sources. Every screen already reaches place data through this boundary,
 * so nothing above it changes.
 *
 * The store is read imperatively rather than subscribed to. This is a service,
 * not a component, and a place added mid-session is picked up by the next
 * call — which is the next time a screen mounts or the selection changes.
 */
function withMyPlaces(inner: PlacesService): PlacesService {
  const mine = () => visibleMyPlaces(useMyPlacesStore.getState().places);
  const matches = (p: CuratedPlace, q: string) =>
    p.name.toLowerCase().includes(q);

  return {
    // Start places are landmarks, and stay that way. A landmark is public by
    // design (PRD §3.1) — the whole point is that it is not your address —
    // and a place the user typed in is exactly the kind of thing that is.
    searchLandmarks: (query) => inner.searchLandmarks(query),

    async listPlaces() {
      return mergePlaces(await inner.listPlaces(), mine());
    },

    async getPlace(id) {
      // Asked first, so a hidden place still resolves for the diary: a stamp
      // against a place put away last week must not lose its name.
      const own = useMyPlacesStore.getState().places.find((p) => p.id === id);
      return own ?? inner.getPlace(id);
    },

    async searchPlaces(query, near) {
      const q = query.trim().toLowerCase();
      const own = q ? mine().filter((p) => matches(p, q)) : mine();
      return mergePlaces(await inner.searchPlaces(query, near), own);
    },

    async nearbyPlaces(to, limitKm = 1.5) {
      const own = mine().filter((p) => haversineKm(to, p.location) <= limitKm);
      // Nearby is ordered by distance and merging would break that, so the
      // combined list is re-sorted rather than concatenated.
      return mergePlaces(await inner.nearbyPlaces(to, limitKm), own).sort(
        (a, b) => haversineKm(to, a.location) - haversineKm(to, b.location)
      );
    },
  };
}

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

// Wrapped outside the resolver so the user's own places survive the day a
// key is configured and the provider underneath changes.
export const placesService: PlacesService = withMyPlaces(resolvePlacesService());

/** True when place search hits a live provider rather than the curated list. */
export const placeSearchIsLive = config.useRealProviders;

/**
 * Every place a stored visit could name, including ones put away.
 *
 * The diary is a record of where someone has been, and that record must not
 * change meaning because the place was later removed from planning. This is
 * the one caller that wants hidden places back: `listPlaces` deliberately
 * drops them so they cannot be planned, and a wall built on that list would
 * quietly lose the visit instead.
 *
 * A function rather than a fifth method on PlacesService, because no provider
 * has anything to contribute to it — the extra places are entirely ours.
 */
export async function listPlacesForHistory(): Promise<CuratedPlace[]> {
  const all = await placesService.listPlaces();
  const seen = new Set(all.map((p) => p.id));
  const own = useMyPlacesStore.getState().places.filter((p) => !seen.has(p.id));
  return [...all, ...own];
}
