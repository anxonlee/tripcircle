import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Landmark, LatLng, Place } from '../../domain/types';
import { bayAreaLandmarks } from '../mock/landmarks';
import { bayAreaPlaces } from '../mock/bayAreaPlaces';
import type { PlacesService } from '../places';
import { fetchJson, placesEndpoint, placesHeaders } from './http';
import { toPlace, type GooglePlace } from './placeMapping';

const CACHE_KEY = 'tripcircle-discovered-places';

const PLACE_FIELDS = [
  'places.id',
  'places.displayName',
  'places.location',
  'places.types',
  'places.primaryType',
  'places.priceLevel',
  'places.rating',
  'places.userRatingCount',
  'places.regularOpeningHours',
  'places.editorialSummary',
].join(',');

/** Bay Area center, used to bias searches when there is no anchor yet. */
const BAY_AREA_CENTER: LatLng = { latitude: 37.7749, longitude: -122.4194 };
const SEARCH_RADIUS_M = 30000;

/**
 * Google Places (New) implementation of PlacesService.
 *
 * `listPlaces()` must keep returning "every place the app can resolve by id",
 * because a dozen screens map stored ids back to places through it. So every
 * place we discover via search is written to a persisted cache and folded into
 * that list — selections then survive an app restart. The curated Bay Area set
 * stays in as a seed so a brand-new install is never an empty map.
 */
export class GooglePlacesService implements PlacesService {
  private discovered = new Map<string, Place>();
  private loaded: Promise<void>;

  constructor() {
    this.loaded = this.load();
  }

  private async load(): Promise<void> {
    try {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      if (!raw) return;
      const list = JSON.parse(raw) as Place[];
      for (const p of list) this.discovered.set(p.id, p);
    } catch {
      // A corrupt cache is not worth failing a launch over.
    }
  }

  private async persist(): Promise<void> {
    try {
      await AsyncStorage.setItem(
        CACHE_KEY,
        JSON.stringify([...this.discovered.values()])
      );
    } catch {
      // Non-fatal: the cache is an optimisation, not a source of truth.
    }
  }

  private remember(places: Place[]): void {
    for (const p of places) this.discovered.set(p.id, p);
    void this.persist();
  }

  async searchLandmarks(query: string): Promise<Landmark[]> {
    // Start places stay on the curated landmark list by design: PRD §3.1 wants
    // recognisable public anchors, not arbitrary POIs.
    const q = query.trim().toLowerCase();
    if (!q) return bayAreaLandmarks;
    return bayAreaLandmarks.filter((lm) => lm.name.toLowerCase().includes(q));
  }

  async listPlaces(): Promise<Place[]> {
    await this.loaded;
    const seen = new Map<string, Place>();
    for (const p of bayAreaPlaces) seen.set(p.id, p);
    for (const p of this.discovered.values()) seen.set(p.id, p);
    return [...seen.values()];
  }

  async getPlace(id: string): Promise<Place | undefined> {
    await this.loaded;
    return (
      this.discovered.get(id) ?? bayAreaPlaces.find((p) => p.id === id)
    );
  }

  /**
   * Text search against the real Places index, biased to the user's anchor.
   * Results are cached so they stay resolvable by id afterwards.
   */
  async searchPlaces(query: string, near?: LatLng): Promise<Place[]> {
    const q = query.trim();
    if (!q) return [];
    try {
      const body = {
        textQuery: q,
        maxResultCount: 20,
        locationBias: {
          circle: {
            center: near ?? BAY_AREA_CENTER,
            radius: SEARCH_RADIUS_M,
          },
        },
      };
      const res = await fetchJson<{ places?: GooglePlace[] }>(
        placesEndpoint('/v1/places:searchText'),
        {
          method: 'POST',
          headers: placesHeaders(PLACE_FIELDS),
          body: JSON.stringify(body),
        }
      );
      const places = (res.places ?? [])
        .map(toPlace)
        .filter((p): p is Place => p !== null);
      this.remember(places);
      return places;
    } catch {
      // Offline or quota-exhausted: fall back to filtering what we already have.
      const all = await this.listPlaces();
      const lower = q.toLowerCase();
      return all.filter((p) => p.name.toLowerCase().includes(lower));
    }
  }
}
