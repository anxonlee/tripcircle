import type { Landmark, LatLng, CuratedPlace } from '../../domain/types';
import { bayAreaLandmarks } from '../mock/landmarks';
import { bayAreaPlaces } from '../mock/bayAreaPlaces';
import { haversineKm } from '../../lib/geo';
import type { PlacesService } from '../places';
import { fetchJson, placesEndpoint, placesHeaders } from './http';
import { toPlace, type GooglePlace } from './placeMapping';

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
 * STORAGE RULE (PRD §12.2) — Google-derived content is LIVE ONLY. Ratings,
 * hours, price level, photos and editorial text may be held in memory for the
 * session and must never be written to storage. The only Google value we are
 * permitted to persist is `google_place_id`, and it belongs on the Curation
 * record that links it to an `osm_id` — not in a blob of cached place content.
 *
 * An earlier revision persisted whole CuratedPlace objects to AsyncStorage so that
 * search results stayed resolvable across restarts. That was convenient and
 * not permissible, so it is gone. The consequence is intended: results found
 * through Google survive only the current session, while the Foundation and
 * Curation layers are what persist.
 */
export class GooglePlacesService implements PlacesService {
  /** Session-scoped only. Never serialised. */
  private discovered = new Map<string, CuratedPlace>();

  private remember(places: CuratedPlace[]): void {
    for (const p of places) this.discovered.set(p.id, p);
  }

  async searchLandmarks(query: string): Promise<Landmark[]> {
    // Start places stay on the curated landmark list by design: PRD §3.1 wants
    // recognisable public anchors, not arbitrary POIs.
    const q = query.trim().toLowerCase();
    if (!q) return bayAreaLandmarks;
    return bayAreaLandmarks.filter((lm) => lm.name.toLowerCase().includes(q));
  }

  async listPlaces(): Promise<CuratedPlace[]> {
    const seen = new Map<string, CuratedPlace>();
    for (const p of bayAreaPlaces) seen.set(p.id, p);
    for (const p of this.discovered.values()) seen.set(p.id, p);
    return [...seen.values()];
  }

  async getPlace(id: string): Promise<CuratedPlace | undefined> {
    return (
      this.discovered.get(id) ?? bayAreaPlaces.find((p) => p.id === id)
    );
  }

  /**
   * Text search against the real Places index, biased to the user's anchor.
   * Results are cached so they stay resolvable by id afterwards.
   */
  async searchPlaces(query: string, near?: LatLng): Promise<CuratedPlace[]> {
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
        .filter((p): p is CuratedPlace => p !== null);
      this.remember(places);
      return places;
    } catch {
      // Offline or quota-exhausted: fall back to filtering what we already have.
      const all = await this.listPlaces();
      const lower = q.toLowerCase();
      return all.filter((p) => p.name.toLowerCase().includes(lower));
    }
  }

  /**
   * Nearest places to a point, closest first.
   *
   * Served from what we already hold — the seed set plus anything discovered
   * this session — rather than a Nearby Search call. Stamping runs the moment
   * the user taps, so the screen must answer instantly, and a live call here
   * would also spend quota on every stamp for a question the local data
   * already answers well.
   */
  async nearbyPlaces(to: LatLng, limitKm = 1.5): Promise<CuratedPlace[]> {
    const all = await this.listPlaces();
    return all
      .map((place) => ({ place, km: haversineKm(to, place.location) }))
      .filter((x) => x.km <= limitKm)
      .sort((a, b) => a.km - b.km)
      .map((x) => x.place);
  }
}
