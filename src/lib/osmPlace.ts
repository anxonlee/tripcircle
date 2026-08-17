/**
 * Turning a raw OpenStreetMap object into something the planner can use.
 *
 * The built-in list is 441 places and will never be every café in the Bay
 * Area. Overpass is the way out that costs nothing and needs no account: the
 * same source the bulk import came from, queried live instead of once.
 *
 * The work is all in the gap between what OSM records and what a day out
 * needs. OSM knows tags; the planner needs a theme, a visit length, opening
 * hours and a price. Only the first is really derivable, so the rule here is
 * the same as everywhere else in this app: infer conservatively, and mark
 * what was inferred rather than presenting a default as a fact.
 *
 * Pure, so all of that is testable without a network.
 */

import type {
  Category,
  CuratedPlace,
  District,
  LatLng,
  OpenHours,
} from '../domain/types';

/** What Overpass hands back for `out center`. */
export interface OsmElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/**
 * Which tag makes a place what it is.
 *
 * Ordered, and the order matters: a museum café is a museum, and a shop
 * inside a station is a shop. First match wins, so the more specific
 * identities sit above the broader ones.
 */
const THEME_RULES: { key: string; values: string[]; theme: Category }[] = [
  { key: 'amenity', values: ['cafe'], theme: 'cafe' },
  { key: 'amenity', values: ['bar', 'pub', 'nightclub', 'biergarten'], theme: 'nightlife' },
  { key: 'amenity', values: ['restaurant', 'fast_food', 'food_court', 'ice_cream'], theme: 'food' },
  { key: 'shop', values: ['bakery', 'pastry', 'coffee', 'deli'], theme: 'food' },
  { key: 'tourism', values: ['museum', 'gallery', 'artwork'], theme: 'historical' },
  { key: 'historic', values: ['*'], theme: 'historical' },
  { key: 'tourism', values: ['attraction', 'viewpoint'], theme: 'historical' },
  { key: 'leisure', values: ['park', 'garden', 'nature_reserve'], theme: 'nature' },
  { key: 'natural', values: ['beach', 'peak', 'wood'], theme: 'nature' },
  { key: 'shop', values: ['*'], theme: 'shopping' },
  { key: 'amenity', values: ['marketplace'], theme: 'shopping' },
];

export function themeFor(tags: Record<string, string>): Category | null {
  for (const rule of THEME_RULES) {
    const value = tags[rule.key];
    if (!value) continue;
    if (rule.values.includes('*') || rule.values.includes(value)) return rule.theme;
  }
  return null;
}

/**
 * How long someone spends, by what the place is.
 *
 * Category-level defaults, which is exactly what the bulk import used. They
 * are not measurements and nothing here pretends otherwise; they exist so a
 * day containing one of these has a shape at all.
 */
const STAY_BY_THEME: Record<Category, number> = {
  cafe: 40,
  food: 60,
  historical: 75,
  shopping: 45,
  nature: 60,
  nightlife: 90,
};

/** Same, for the hours a place is likely open when OSM does not say. */
const ASSUMED_HOURS_BY_THEME: Record<Category, OpenHours> = {
  cafe: { open: 7 * 60, close: 18 * 60 },
  food: { open: 11 * 60, close: 22 * 60 },
  historical: { open: 10 * 60, close: 17 * 60 },
  shopping: { open: 10 * 60, close: 19 * 60 },
  nature: { open: 6 * 60, close: 21 * 60 },
  nightlife: { open: 17 * 60, close: 24 * 60 },
};

function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59) return null;
  return h * 60 + min;
}

/**
 * As much of an `opening_hours` tag as can be read honestly.
 *
 * OSM's opening_hours grammar is a small language — day ranges, month
 * ranges, public holidays, exceptions, "sunset", weeks of the year. Parsing
 * it properly is a library, and half-parsing it is how a planner ends up
 * confidently sending someone to a closed door.
 *
 * So this reads only what is unambiguous: `24/7`, and a single plain
 * `HH:MM-HH:MM` window optionally prefixed by day names. Anything else
 * returns null, and the caller falls back to a category default it marks as
 * estimated. A window we decline to read is not a window we get wrong.
 */
export function parseOpeningHours(raw: string | undefined): OpenHours | null | 'always' {
  if (!raw) return null;
  const value = raw.trim();
  if (value === '24/7') return 'always';
  // One rule only. A semicolon means the week is not uniform, and which of
  // the parts applies today is exactly the question this cannot answer.
  if (value.includes(';') || value.includes(',')) return null;
  if (/PH|SH|sunset|sunrise|off/i.test(value)) return null;

  const m = /(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/.exec(value);
  if (!m) return null;
  const open = toMinutes(m[1]);
  const close = toMinutes(m[2]);
  if (open == null || close == null) return null;
  // A window running past midnight is written as a smaller closing time.
  const closeAdjusted = close <= open ? close + 24 * 60 : close;
  if (closeAdjusted - open < 30) return null;
  return { open, close: closeAdjusted };
}

/** Stable, and shaped like an id a shared link will carry. */
export function osmPlaceId(element: OsmElement): string {
  return `osm-${element.type}-${element.id}`;
}

export function isOsmPlaceId(id: string): boolean {
  return id.startsWith('osm-');
}

export function osmLocation(element: OsmElement): LatLng | null {
  if (element.lat != null && element.lon != null) {
    return { latitude: element.lat, longitude: element.lon };
  }
  if (element.center) {
    return { latitude: element.center.lat, longitude: element.center.lon };
  }
  return null;
}

/**
 * An OSM object as a place, or null if it is not one.
 *
 * Rejected: anything with no name, no position, or no recognisable theme. A
 * nameless node is not something anyone can be sent to, and a place with no
 * theme has nothing to colour a pin with or to plan around.
 */
export function osmToPlace(
  element: OsmElement,
  district: District
): CuratedPlace | null {
  const tags = element.tags ?? {};
  const name = tags.name?.trim();
  if (!name) return null;

  const location = osmLocation(element);
  if (!location) return null;

  const theme = themeFor(tags);
  if (!theme) return null;

  const parsed = parseOpeningHours(tags.opening_hours);
  const openHours: OpenHours | null =
    parsed === 'always' ? null : parsed !== null ? parsed : ASSUMED_HOURS_BY_THEME[theme];
  // Estimated whenever the hours are ours rather than the map's. "Always
  // open" is the map's answer and is not a guess.
  const hoursEstimated = parsed === null;

  return {
    id: osmPlaceId(element),
    name,
    location,
    district,
    themes: [theme],
    // OSM carries no price. The band is a placeholder that the UI is told
    // not to print — see priceEstimated — rather than a claim about cost.
    priceLevel: 1,
    priceBand: '$',
    priceEstimated: true,
    avgCostUsd: 0,
    // Editorial, and an import carries none. Same rule as the bulk import.
    worthDetour: false,
    openHours,
    visitDurationMin: STAY_BY_THEME[theme],
    ...(hoursEstimated ? { hoursEstimated: true } : {}),
    source: 'osm',
    osmRef: `${element.type}/${element.id}`,
  };
}

/**
 * The best of a result set, nearest first.
 *
 * Overpass returns whatever matched, in no useful order, and a search box
 * showing forty identical bakeries is worse than one showing five. Ordering
 * by distance from where the day starts is the only ranking signal available
 * without inventing a quality score.
 */
export function rankOsmResults(
  places: CuratedPlace[],
  near: LatLng | undefined,
  limit: number,
  distanceKm: (a: LatLng, b: LatLng) => number
): CuratedPlace[] {
  if (!near) return places.slice(0, limit);
  return [...places]
    .sort((a, b) => distanceKm(near, a.location) - distanceKm(near, b.location))
    .slice(0, limit);
}
