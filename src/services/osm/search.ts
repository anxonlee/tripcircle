import type { CuratedPlace, District, LatLng } from '../../domain/types';
import { haversineKm } from '../../lib/geo';
import { districtFor } from '../../lib/myPlace';
import { type OsmElement, osmToPlace, rankOsmResults } from '../../lib/osmPlace';

/**
 * Live place search against OpenStreetMap, through Photon.
 *
 * This is the free half of the provider question: no account, no card, no
 * key, and it searches the same map the built-in list was imported from — so
 * a friend looking for their local café finds it instead of being told no
 * places match.
 *
 * Photon rather than Overpass, which was the first attempt and the wrong
 * tool. Overpass answers "what is around here of this kind" and is excellent
 * at it, but finding a place by name means a case-insensitive regex over
 * every name in the search radius, and OSM names are not indexed for that.
 * A 20km search for "Philz" timed out on the public server after 23 seconds.
 * Photon exists specifically for search-as-you-type over OSM and answered
 * the same query in under a second.
 *
 * What this is not: a routing provider. It answers "what is there", never
 * "how long does it take", so travel times stay as the app's own estimates.
 *
 * OSM data is ODbL, which has two consequences the Google path does not
 * have: results may be kept on the device (see useFoundPlacesStore), and the
 * attribution must be shown — it is, on the privacy screen.
 */

const PHOTON_URL = 'https://photon.komoot.io/api/';

/** Named so the instance operators can identify the traffic. */
const USER_AGENT = 'TripCircle/1.0 (day planner; contact via App Store listing)';

/** Enough to choose from, few enough to read. */
export const MAX_RESULTS = 12;

/**
 * Asked for more than we show.
 *
 * Photon ranks by relevance and proximity across everything in OSM, so a
 * search returns streets and neighbourhoods alongside places you can visit.
 * Most of those are dropped here, and asking for only twelve would often
 * leave two after filtering.
 */
const FETCH_LIMIT = 40;

/** A search box cannot wait on a slow public server. */
const TIMEOUT_MS = 8_000;

/** The attribution ODbL requires wherever these results are shown. */
export const OSM_ATTRIBUTION = 'Place data © OpenStreetMap contributors (ODbL)';

/** Shortest query worth a round trip. Two letters matches half the map. */
export const MIN_QUERY_LENGTH = 3;

interface PhotonFeature {
  properties?: {
    osm_type?: string;
    osm_id?: number;
    osm_key?: string;
    osm_value?: string;
    name?: string;
    city?: string;
    street?: string;
  };
  geometry?: { coordinates?: number[] };
}

interface PhotonResponse {
  features?: PhotonFeature[];
}

export function buildSearchUrl(query: string, near: LatLng): string {
  const params = new URLSearchParams({
    q: query.trim(),
    // Biases results towards the day's start place rather than filtering to
    // it. A hard box would hide a place two streets over the edge.
    lat: String(near.latitude),
    lon: String(near.longitude),
    limit: String(FETCH_LIMIT),
    lang: 'en',
  });
  return `${PHOTON_URL}?${params.toString()}`;
}

/**
 * A Photon feature in the shape the OSM mapper already understands.
 *
 * Photon flattens the one tag it considers primary into `osm_key`/
 * `osm_value` rather than returning the whole tag set. Rebuilding a tag
 * object from it means `lib/osmPlace` needs no Photon-specific branch, and
 * the theme rules stay tested against one shape.
 *
 * The cost is real and worth naming: no `opening_hours` comes back, so every
 * result gets category-default hours marked estimated. Better than inventing
 * precision, and the card says the hours are a guess.
 */
export function featureToElement(feature: PhotonFeature): OsmElement | null {
  const p = feature.properties;
  const coords = feature.geometry?.coordinates;
  if (!p?.osm_id || !p.name || !coords || coords.length < 2) return null;

  const type =
    p.osm_type === 'W' ? 'way' : p.osm_type === 'R' ? 'relation' : 'node';

  const tags: Record<string, string> = { name: p.name };
  if (p.osm_key && p.osm_value) tags[p.osm_key] = p.osm_value;

  return {
    type,
    id: p.osm_id,
    lon: coords[0],
    lat: coords[1],
    tags,
  };
}

/**
 * Searches, and returns nothing rather than throwing.
 *
 * Every caller is a search box with a perfectly good local list behind it. A
 * failed lookup should mean the user sees the built-in results they would
 * have seen anyway, never an error where their day should be.
 */
export async function searchOsm(
  query: string,
  near: LatLng | undefined,
  districtReference: readonly { location: LatLng; district: District }[]
): Promise<CuratedPlace[]> {
  const term = query.trim();
  if (term.length < MIN_QUERY_LENGTH || !near) return [];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(buildSearchUrl(term, near), {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const json = (await res.json()) as PhotonResponse;

    const places: CuratedPlace[] = [];
    for (const feature of json.features ?? []) {
      const element = featureToElement(feature);
      if (!element) continue;
      const point = { latitude: element.lat!, longitude: element.lon! };
      // Streets, cities and postcodes come back too. The mapper rejects
      // anything with no recognisable theme, which is exactly those.
      const place = osmToPlace(element, districtFor(point, districtReference));
      if (place) places.push(place);
    }
    // Ranked before deduped, so the branch that survives is the nearest one
    // rather than whichever Photon happened to list first.
    const ranked = rankOsmResults(places, near, places.length, haversineKm);
    return dedupeByName(ranked).slice(0, MAX_RESULTS);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * One entry per name.
 *
 * A chain has branches, and a venue mapped as both a node and the building
 * around it arrives twice. Keeping the first is enough — they are ranked by
 * distance, so the first is the nearest, and a list that repeats itself
 * reads as broken.
 */
function dedupeByName(places: CuratedPlace[]): CuratedPlace[] {
  const seen = new Set<string>();
  return places.filter((p) => {
    const key = p.name.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
