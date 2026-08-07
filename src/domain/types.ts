/**
 * Core domain types shared by services, the optimizer, and the UI.
 * Keep this file free of React Native / provider imports — it defines the
 * vocabulary everything else speaks (PRD §12: provider-swappable schema).
 *
 * PRD §12.2 models a place as THREE layers with different licensing and
 * caching rules. That split is load-bearing, not bookkeeping:
 *
 *   Foundation  (OSM/Geoapify) — cached, ODbL, factual skeleton
 *   Enrichment  (Google)       — LIVE ONLY, never written to storage
 *   Curation    (ours)         — cached, proprietary, what the planner uses
 *
 * Foundation and Curation are merged into `CuratedPlace` below, since we own
 * or may cache both. Enrichment is a separate type precisely so it cannot be
 * stored by accident — see the warning on `PlaceEnrichment`.
 */

/**
 * Fixed category set (PRD §6.1). The PRD's curation table calls this field
 * `themes` while §6.1 calls the palette "categories" — same concept, so the
 * type keeps the color-system name and the field keeps the PRD's.
 */
export type Category =
  | 'food'
  | 'historical'
  | 'shopping'
  | 'nature'
  | 'nightlife'
  | 'cafe';

export interface LatLng {
  latitude: number;
  longitude: number;
}

/**
 * Opening window in minutes since midnight (e.g. 9:00 = 540).
 * `close` may exceed 1440 for venues open past midnight (e.g. 26:00 = 1560).
 * `null` means always open (streets, parks with no gate).
 */
export interface OpenHours {
  open: number;
  close: number;
}

/** Our own price assessment, independent of Google's `priceLevel`. */
export type PriceBand = 'free' | '$' | '$$' | '$$$';

/**
 * Bay Area launch districts. A closed union rather than a free string because
 * the memory wall auto-arranges cards by district (PRD §3A.3) and the planner
 * clusters by it — a typo would silently create a phantom district sitting
 * next to the real one.
 *
 * The 17 entries were chosen against the actual shape of the seed dataset,
 * not against a map: every place is assigned to its nearest centroid (see
 * `DISTRICT_CENTROIDS` in services/mock/bayAreaPlaces.ts), and the set was
 * rebalanced until no district held more than a quarter of the places. The
 * largest, Palo Alto, holds 17%. Names beyond San Francisco are city-scale
 * rather than neighbourhood-scale because the seed data outside the city is
 * too sparse to support finer distinctions honestly.
 */
export type District =
  | 'Mission'
  | 'Downtown & SoMa'
  | 'North Beach'
  | 'Marina'
  | 'Castro & Haight'
  | 'The Avenues'
  | 'Sausalito'
  | 'Berkeley'
  | 'Oakland'
  | 'Alameda'
  | 'Hayward'
  | 'Pacifica'
  | 'Half Moon Bay'
  | 'San Mateo'
  | 'Redwood City'
  | 'Palo Alto'
  | 'Mountain View';

/**
 * Foundation + Curation, merged. This is what the app lists, what the wall
 * renders, and the ONLY place data the optimizer may consume (PRD §12.2:
 * "never fed to the optimizer as stored values" applies to Google data).
 *
 * Deliberately absent: rating and reviewCount. Those are Google enrichment
 * and live on `PlaceEnrichment`, fetched live on detail open only.
 */
export interface CuratedPlace {
  id: string;
  name: string;
  location: LatLng;
  district: District;
  /** Primary theme first (drives split-pin left half, PRD §6.1). */
  themes: Category[];
  /** 0 = free, 4 = splurge. Retained as the source `priceBand` derives from. */
  priceLevel: 0 | 1 | 2 | 3 | 4;
  /** Published price signal. Prefer this over `avgCostUsd` in any UI. */
  priceBand: PriceBand;
  /**
   * Estimated spend per visit in USD (entry fee / typical meal). An estimate
   * on an unverified fixture — never printed as money, and deliberately not
   * part of the day total the optimizer reports.
   */
  avgCostUsd: number;
  /**
   * Standout places the optimizer may route out of the way for. Every seed
   * record is `false`: an OSM import carries no editorial judgment, and
   * synthesising one from rating or review count is forbidden by §12.2 and
   * would defeat the premise that curation beats a crowd average.
   */
  worthDetour: boolean;
  openHours: OpenHours | null;
  /** Typical time spent at the place, minutes. */
  visitDurationMin: number;
  /**
   * True when `openHours` is a category-level default rather than the venue's
   * real hours. Bulk-imported places often have no hours tagged upstream, and
   * a planner must not present a guessed window as fact.
   */
  hoursEstimated?: boolean;
  /** OpenStreetMap object this record came from, e.g. "node/7025326100". */
  osmRef?: string;
  description?: string;
  /**
   * Insider note — which entrance, what to order. Curation, and absent from
   * every seed record for the same reason `worthDetour` is false: an OSM
   * import has none, and inventing them would be writing fiction into a
   * dataset the header calls unverified.
   */
  tips?: string;
}

/**
 * Google Places enrichment. ⚠️ LIVE ONLY — PRD §12.2.
 *
 * Rules this type exists to enforce:
 *  - NEVER written to AsyncStorage, a database, or any cache beyond the
 *    in-memory lifetime of an open place-detail screen.
 *  - Fetched ONLY on place-detail open. Never in list views, never
 *    speculatively, never for the optimizer.
 *  - Never exported, never included in shared posts or clones.
 *  - Only `googlePlaceId` may be persisted.
 *
 * Nothing in this app should ever hold a `PlaceEnrichment` in a store.
 */
export interface PlaceEnrichment {
  googlePlaceId: string;
  rating: number | null;
  reviewCount: number | null;
  /** Google's own hours, which may disagree with our cached `openHours`. */
  hours: OpenHours | null;
  photoUrls: string[] | null;
  /** Google's 0–4 price level. Distinct from our `priceBand`. */
  priceLevel: number | null;
  /** Wall-clock ms when fetched, so stale in-memory copies are detectable. */
  fetchedAt: number;
}

/** Derive the published band from the 0–4 level the seed data carries. */
export function bandFor(level: 0 | 1 | 2 | 3 | 4): PriceBand {
  return level === 0 ? 'free' : level === 1 ? '$' : level === 2 ? '$$' : '$$$';
}

/** Public landmarks offered as start places (PRD §3.1: landmark-first). */
export interface Landmark {
  id: string;
  name: string;
  kind: 'station' | 'plaza' | 'park' | 'landmark';
  location: LatLng;
}

/**
 * The user's chosen anchor. Location is ALWAYS coarse-snapped (~100m) before
 * it reaches this type — construct via `makeStartPlace` in lib/geo.ts.
 */
export interface StartPlace {
  id: string;
  name: string;
  kind: Landmark['kind'];
  location: LatLng;
}

/**
 * Bay Area modes. Kept distinct rather than collapsed into one "transit"
 * because their fare structures differ in kind, not degree — Muni charges a
 * flat fare per boarding, BART charges by distance, the ferry charges per
 * crossing, and driving charges nothing to board but pays for parking. An
 * optimizer that cannot see those differences cannot trade between them.
 */
export type TransportMode =
  | 'walk'
  | 'muni'
  | 'bart'
  | 'ferry'
  | 'rideshare'
  | 'drive';

/** One travel option between two points, for one mode. */
export interface LegEstimate {
  mode: TransportMode;
  durationMin: number;
  costUsd: number;
  distanceKm: number;
}
