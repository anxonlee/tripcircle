/**
 * Core domain types shared by services, the optimizer, and the UI.
 * Keep this file free of React Native / provider imports — it defines the
 * vocabulary everything else speaks (PRD §12: provider-swappable schema).
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

export interface Place {
  id: string;
  name: string;
  location: LatLng;
  /** Primary category first (drives split-pin left half, PRD §6.1). */
  categories: Category[];
  /** 0 = free, 4 = splurge. */
  priceLevel: 0 | 1 | 2 | 3 | 4;
  /** Estimated spend per visit in USD (entry fee / typical meal). */
  avgCostUsd: number;
  openHours: OpenHours | null;
  /** Typical time spent at the place, minutes. */
  visitDurationMin: number;
  /**
   * Provider-supplied rating, 0–5. Optional on purpose: the seed dataset has
   * no licensable source for these, so they are absent rather than invented.
   * Only a live POI provider populates them — never assume they exist.
   */
  rating?: number;
  reviewCount?: number;
  /**
   * True when `openHours` is a category-level default rather than the venue's
   * real hours. Bulk-imported places often have no hours tagged upstream, and
   * a planner must not present a guessed window as fact.
   */
  hoursEstimated?: boolean;
  /** OpenStreetMap object this record came from, e.g. "node/7025326100". */
  osmRef?: string;
  description?: string;
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

export type TransportMode = 'walk' | 'transit' | 'taxi';

/** One travel option between two points, for one mode. */
export interface LegEstimate {
  mode: TransportMode;
  durationMin: number;
  costUsd: number;
  distanceKm: number;
}
