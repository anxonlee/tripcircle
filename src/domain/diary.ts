/**
 * The place diary (PRD §3A) — the Phase 1 core.
 *
 * The Place/Visit split is the whole differentiator versus check-in apps
 * that keep one static record per place. Notes, ratings, photos, and
 * would-go-again attach to the INDIVIDUAL VISIT: the same ramen shop visited
 * eight times has eight independent notes. Aggregates (`visitCount`,
 * `lastVisitedAt`) are always derived from the visit log, never stored
 * alongside it — a stored counter is a counter that drifts.
 */

import { LEGACY_PLACE_NAMES } from './legacyPlaceNames';
import type { CuratedPlace } from './types';

/**
 * The one required field on a stamp (PRD §3A.1). A cleaner preference signal
 * than a star rating, and the ranking input the thin planner consumes.
 */
export type WouldGoAgain = 'yes' | 'maybe' | 'no';

/** Optional one-tap context chips. UI ships in Phase 2 (PRD §14). */
export interface ContextTags {
  companion?: 'solo' | 'date' | 'family' | 'friends';
  occasion?: string;
  pace?: 'relaxed' | 'packed';
}

/**
 * One recorded visit. Created by tap-to-stamp; immutable except for the
 * optional fields the user may fill in afterwards.
 *
 * Privacy (PRD §3A.6): this is sensitive behavioral data. Visit history is
 * private by default and never leaves the device in Phase 1. `photoUri` is a
 * local file URI — photos are private, and photo sharing is gated behind
 * moderation tooling in Phase 3.
 */
export interface Visit {
  id: string;
  /** References CuratedPlace.id. */
  placeId: string;
  /**
   * The place's name as it stood when the visit was stamped.
   *
   * Denormalised deliberately, against the usual instinct. A visit is a
   * record of something that happened, and it must stay readable when the
   * thing it points at is gone — a place the user removed, an id a provider
   * retired, or a whole dataset swapped underneath it, which is exactly what
   * happened when Hong Kong became the Bay Area and every stamp before the
   * switch turned into "Unknown place".
   *
   * The live record still wins when there is one, so a place that is renamed
   * reads by its current name. This is the floor, not the source of truth.
   *
   * Optional because visits written before it existed do not have it.
   */
  placeName?: string;
  /** Epoch ms, captured automatically at stamp time. */
  timestamp: number;
  wouldGoAgain: WouldGoAgain;
  /** Optional 1–5. Never blocks the save. */
  rating?: number;
  /** Unique to THIS visit, not to the place. */
  note?: string;
  /** Local file URI. Never uploaded in Phase 1. */
  photoUri?: string;
  contextTags?: ContextTags;
}

/**
 * Per-place aggregates derived from the visit log. `visitCount` and
 * `lastVisitedAt` are the two signals the planner consumes most (PRD §3A.2).
 */
export interface PlaceStats {
  placeId: string;
  visitCount: number;
  /** Epoch ms of the most recent visit. */
  lastVisitedAt: number;
  /** Days since the last visit — the recency signal (PRD §3A.5). */
  daysSinceLastVisit: number;
  /** Counts by answer, for the would-go-again trend. */
  goAgain: Record<WouldGoAgain, number>;
  /** Mean of the ratings that were given; null if none were. */
  avgRating: number | null;
  /** Visits carrying a photo — drives which cards look rich on the wall. */
  photoCount: number;
}

/**
 * How long a visit stays editable after it was stamped.
 *
 * A stamp is a record of a moment, not a document — letting it be rewritten
 * indefinitely would turn the diary into something you curate after the fact,
 * and the planner reads would-go-again as what you thought at the time. Two
 * days is enough to fix a typo or add the note you meant to write on the way
 * home, and short enough that the log stays a log. Deleting stays available
 * for good; only rewriting expires.
 */
export const EDIT_WINDOW_MS = 48 * 60 * 60 * 1000;

/** Whether a visit is still inside its edit window. */
export function canEditVisit(visit: Visit, now: number = Date.now()): boolean {
  return now - visit.timestamp < EDIT_WINDOW_MS;
}

/** Milliseconds of edit window left, floored at zero. */
export function editWindowLeft(visit: Visit, now: number = Date.now()): number {
  return Math.max(0, visit.timestamp + EDIT_WINDOW_MS - now);
}

/** Stable id for a new stamp. Not cryptographic; local-only data. */
export function newVisitId(): string {
  return `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const DAY_MS = 86_400_000;

/**
 * Aggregate one place's visits. Pure, so the planner and the wall can call
 * it freely and it stays trivially testable.
 */
export function aggregateVisits(
  placeId: string,
  visits: Visit[],
  now: number = Date.now()
): PlaceStats | null {
  const mine = visits.filter((v) => v.placeId === placeId);
  if (mine.length === 0) return null;

  const goAgain: Record<WouldGoAgain, number> = { yes: 0, maybe: 0, no: 0 };
  let lastVisitedAt = 0;
  let ratingSum = 0;
  let ratingCount = 0;
  let photoCount = 0;

  for (const v of mine) {
    /*
     * Only the three answers we know. A restored backup is a file the user
     * could have edited, and `goAgain[answer] += 1` on an unknown key writes
     * NaN under it — a number that then spreads silently through the ranking
     * the planner reads. The visit still counts; only the unreadable opinion
     * is dropped.
     */
    if (v.wouldGoAgain in goAgain) goAgain[v.wouldGoAgain] += 1;
    if (v.timestamp > lastVisitedAt) lastVisitedAt = v.timestamp;
    if (typeof v.rating === 'number') {
      ratingSum += v.rating;
      ratingCount += 1;
    }
    if (v.photoUri) photoCount += 1;
  }

  return {
    placeId,
    visitCount: mine.length,
    lastVisitedAt,
    daysSinceLastVisit: Math.max(0, Math.floor((now - lastVisitedAt) / DAY_MS)),
    goAgain,
    avgRating: ratingCount > 0 ? ratingSum / ratingCount : null,
    photoCount,
  };
}

/** Aggregate every place that has at least one visit, keyed by place id. */
export function aggregateAll(
  visits: Visit[],
  now: number = Date.now()
): Map<string, PlaceStats> {
  const byPlace = new Map<string, Visit[]>();
  for (const v of visits) {
    const list = byPlace.get(v.placeId);
    if (list) list.push(v);
    else byPlace.set(v.placeId, [v]);
  }

  const out = new Map<string, PlaceStats>();
  for (const [placeId, list] of byPlace) {
    const stats = aggregateVisits(placeId, list, now);
    if (stats) out.set(placeId, stats);
  }
  return out;
}

/** A place's visits, newest first — the single-place timeline (PRD §3A.3). */
export function visitTimeline(placeId: string, visits: Visit[]): Visit[] {
  return visits
    .filter((v) => v.placeId === placeId)
    .sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * A place card as the memory wall renders it: the curated place, its derived
 * stats, and the most recent visit (whose note and photo the card shows).
 */
export interface WallCard {
  place: CuratedPlace;
  stats: PlaceStats;
  latestVisit: Visit;
}

/**
 * What to call the place a visit points at.
 *
 * Four sources, in order of how much they can be trusted:
 *
 *  1. The live record, so a renamed place reads by its current name.
 *  2. The name the visit stored for itself when it was stamped.
 *  3. The archive of names this build no longer carries.
 *  4. An admission.
 *
 * The last one is deliberately not "Unknown place". The place is not
 * unknown — the person standing in it knew exactly where they were, and
 * telling them otherwise makes the app look like it lost their day rather
 * than merely lost a name.
 */
export const FORGOTTEN_PLACE_LABEL = 'A place TripCircle no longer has';

export function visitPlaceName(
  visit: Visit,
  place: CuratedPlace | undefined
): string {
  // Blank is as absent as missing. `??` alone would hand back an empty
  // string and render a nameless row, which is worse than admitting the loss.
  const first = [
    place?.name,
    visit.placeName,
    LEGACY_PLACE_NAMES[visit.placeId],
  ].find((n) => typeof n === 'string' && n.trim().length > 0);
  return first?.trim() ?? FORGOTTEN_PLACE_LABEL;
}

/** True when nothing beyond a name survives — no location, no themes. */
export function visitPlaceIsForgotten(
  visit: Visit,
  place: CuratedPlace | undefined
): boolean {
  return !place;
}

export function buildWallCards(
  places: CuratedPlace[],
  visits: Visit[],
  now: number = Date.now()
): WallCard[] {
  const stats = aggregateAll(visits, now);
  const byId = new Map(places.map((p) => [p.id, p]));
  const cards: WallCard[] = [];

  for (const [placeId, s] of stats) {
    const place = byId.get(placeId);
    if (!place) continue; // stamped place no longer in the dataset
    const latestVisit = visitTimeline(placeId, visits)[0];
    cards.push({ place, stats: s, latestVisit });
  }

  // Newest first, so a fresh stamp is the card the wall focuses on.
  return cards.sort((a, b) => b.stats.lastVisitedAt - a.stats.lastVisitedAt);
}
