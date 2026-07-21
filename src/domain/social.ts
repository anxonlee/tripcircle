/**
 * Social + trip vocabulary for Phases 2–4 (PRD §14): shared wishlists,
 * plan sharing / clone loop, cost splitting, the public feed, profiles +
 * travel passport, and multi-stay trips.
 *
 * Kept free of React Native / provider imports, like domain/types.ts — this
 * is the shared schema the feed/trips services and UI speak. Places are still
 * referenced by id into the POI provider (PlacesService), never inlined.
 */
import type { Category } from './types';

export interface User {
  id: string;
  name: string;
  handle: string;
  /** 1–2 letters for the fallback avatar (no remote images in the mock). */
  initials: string;
  /** Avatar background — identity chrome, deliberately off the clay/category palette. */
  color: string;
  homeCity: string;
  bio?: string;
  followers?: number;
  following?: number;
}

/**
 * A shared day plan published to the feed (Phase 3). Stops reference real POI
 * ids so a clone rehydrates against the live PlacesService.
 */
export interface FeedPost {
  id: string;
  author: User;
  title: string;
  city: string;
  /** Primary theme first — drives the cover tint (max 2 shown). */
  themes: Category[];
  blurb: string;
  /** Ordered POI ids that make up the day. */
  stopIds: string[];
  durationMin: number;
  costYen: number;
  saves: number;
  clones: number;
  postedAgo: string;
}

export interface Comment {
  id: string;
  author: User;
  text: string;
  ago: string;
  likes: number;
}

export type TripKind = 'local' | 'shared' | 'multi';

/** One stay within a multi-city trip (Phase 4). */
export interface TripStay {
  id: string;
  city: string;
  dateLabel: string;
  placeIds: string[];
}

export interface Trip {
  id: string;
  title: string;
  city: string;
  kind: TripKind;
  dateLabel: string;
  /** Primary theme first — drives the trip card cover tint (max 2 shown). */
  coverThemes: Category[];
  members: User[];
  /** Flat stop list for local/shared day trips. */
  placeIds: string[];
  /** Per-city legs for multi-stay trips. */
  stays?: TripStay[];
  costYen: number;
  /** Feed post this trip was cloned from, if any. */
  clonedFromTitle?: string;
}

/** One person's share of a trip's spend (Phase 2 cost splitting). */
export interface CostShare {
  user: User;
  /** What they actually paid up front. */
  paidYen: number;
}

/** A visited-city stamp in the travel passport (Phase 3). */
export interface PassportStamp {
  city: string;
  country: string;
  /** 2–3 letter stamp mark. */
  code: string;
  visits: number;
  lastVisited: string;
  color: string;
}
