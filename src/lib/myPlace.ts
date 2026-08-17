/**
 * Places the user adds for themselves.
 *
 * The dataset cannot hold every corner café, and the app's answer to a
 * missing one has so far been "then you cannot plan around it". This is the
 * private half of fixing that: a place only its author can see, stored on
 * their device, planned with exactly like any other. It is deliberately NOT
 * a contribution to the shared dataset — that is a later phase with a
 * moderation obligation attached, and nothing here should be mistaken for a
 * first step towards shipping it early.
 *
 * The awkward part is that `CuratedPlace` wants ten fields and a person will
 * willingly give four. Everything below exists to make that gap honest:
 * what the user says is recorded, what we infer is inferred conservatively,
 * and anything we would be guessing at is marked as a guess rather than
 * quietly presented as fact.
 *
 * Pure, so the derivation and its defaults can be tested without a device.
 */

import type {
  Category,
  CuratedPlace,
  District,
  LatLng,
  OpenHours,
  PriceBand,
} from '../domain/types';
import { haversineKm } from './geo';

/**
 * How long someone would spend, as three choices rather than a number.
 *
 * A minutes field invites precision nobody has — the difference between 40
 * and 45 minutes at a café is noise, and asking for it implies the planner
 * respects it more than it does. Three buckets carry the only distinction
 * that changes a day's shape: a stop, a visit, or an afternoon.
 */
export const STAY_LENGTHS = [
  { id: 'quick', label: 'A quick stop', minutes: 30 },
  { id: 'visit', label: 'An hour or so', minutes: 60 },
  { id: 'long', label: 'Half a day', minutes: 180 },
] as const;

export type StayLength = (typeof STAY_LENGTHS)[number]['id'];

export function stayMinutes(stay: StayLength): number {
  return STAY_LENGTHS.find((s) => s.id === stay)?.minutes ?? 60;
}

/**
 * What the user says about opening times.
 *
 * 'unknown' and 'always' are genuinely different answers and must not be
 * collapsed. `CuratedPlace.openHours = null` means always open, which lets
 * the planner schedule a stop at any hour — correct for a park, badly wrong
 * for a café whose hours the user simply did not know. So an unanswered
 * question becomes a conservative daytime window flagged as estimated, and
 * only a deliberate "always open" becomes null.
 */
export type DraftHours =
  | { kind: 'unknown' }
  | { kind: 'always' }
  | { kind: 'window'; open: number; close: number };

export interface MyPlaceDraft {
  name: string;
  location: LatLng;
  theme: Category;
  stay: StayLength;
  priceBand: PriceBand;
  hours: DraftHours;
}

/**
 * The window an unanswered hours question becomes.
 *
 * Wide enough not to cut a real day short, narrow enough that the planner
 * does not put a stop somewhere at 23:00. Always paired with
 * `hoursEstimated`, which is what stops the UI presenting it as fact.
 */
export const ASSUMED_HOURS: OpenHours = { open: 9 * 60, close: 18 * 60 };

/** A user place carries its origin, and whether it has been put away. */
export interface MyPlace extends CuratedPlace {
  source: 'mine';
  addedAt: number;
  /**
   * Soft-deleted. The diary stores visits by place id, so removing a place
   * outright would orphan every stamp against it — a data-loss-shaped bug in
   * the one store that must never lose anything. Hidden places leave Explore
   * and planning but stay resolvable for the wall.
   */
  hidden?: boolean;
}

const PRICE_LEVEL: Record<PriceBand, 0 | 1 | 2 | 3 | 4> = {
  free: 0,
  $: 1,
  $$: 2,
  $$$: 3,
};

/** Matches the id shape shared links accept, so a day carrying one encodes. */
export function newMyPlaceId(now: number, random: number): string {
  const stamp = Math.floor(now).toString(36);
  const tail = Math.floor(random * 0xfffff).toString(36);
  return `mine-${stamp}-${tail}`;
}

export function isMyPlaceId(id: string): boolean {
  return id.startsWith('mine-');
}

/**
 * The district whose nearest known place this one sits by.
 *
 * Districts are a closed union used for clustering the wall and the planner,
 * so a user place cannot invent one. Borrowing the label of the nearest place
 * we already know is crude, and it is also exactly how the seed dataset
 * assigns them — nearest centroid, an approximation acknowledged as such.
 *
 * Takes its reference list as an argument rather than importing the dataset,
 * both because this file must stay pure and because place data may only be
 * reached through the service boundary (PRD §12).
 */
export function districtFor(
  location: LatLng,
  reference: readonly { location: LatLng; district: District }[],
  fallback: District = 'Downtown & SoMa'
): District {
  let best: District | null = null;
  let bestKm = Infinity;
  for (const r of reference) {
    const km = haversineKm(location, r.location);
    if (km < bestKm) {
      bestKm = km;
      best = r.district;
    }
  }
  return best ?? fallback;
}

export type DraftProblem =
  | 'no-name'
  | 'name-too-long'
  | 'no-location'
  | 'bad-window';

export const MAX_NAME_LENGTH = 60;

/** Everything wrong with a draft, so the form can say all of it at once. */
export function draftProblems(draft: Partial<MyPlaceDraft>): DraftProblem[] {
  const problems: DraftProblem[] = [];
  const name = (draft.name ?? '').trim();
  if (name.length === 0) problems.push('no-name');
  else if (name.length > MAX_NAME_LENGTH) problems.push('name-too-long');
  if (!draft.location) problems.push('no-location');
  if (draft.hours?.kind === 'window') {
    const { open, close } = draft.hours;
    // Close may pass midnight (26:00 = 1560) but must still follow open.
    if (!(open >= 0 && close > open && close <= 1560)) problems.push('bad-window');
  }
  return problems;
}

/**
 * A place already here that this draft is probably a second copy of.
 *
 * Same name within a couple of streets. The commonest way a personal list
 * turns into junk is the same café added three times from three different
 * pavements, and the cheapest moment to stop that is before it is saved.
 * Advisory only — the caller may still choose to add it.
 */
export const DUPLICATE_KM = 0.2;

export function findDuplicate(
  draft: Pick<MyPlaceDraft, 'name' | 'location'>,
  existing: readonly CuratedPlace[]
): CuratedPlace | null {
  const name = draft.name.trim().toLowerCase();
  if (!name) return null;
  return (
    existing.find(
      (p) =>
        p.name.trim().toLowerCase() === name &&
        haversineKm(draft.location, p.location) <= DUPLICATE_KM
    ) ?? null
  );
}

/**
 * Turns what the user told us into what the planner needs.
 *
 * Two of these defaults are load-bearing rather than arbitrary:
 *
 * `worthDetour` is always false. It is the flag that lets the optimiser route
 * out of its way for a place, it is an editorial judgment, and the seed
 * dataset sets it on nothing. A place must not be able to buy itself routing
 * privileges by being added by the person who benefits.
 *
 * `avgCostUsd` is 0 rather than a figure derived from the price band. It is
 * never printed as money and never enters the day's total, and inventing a
 * number for a field the user was not asked about is how an estimate becomes
 * a claim.
 */
export function draftToPlace(
  draft: MyPlaceDraft,
  district: District,
  id: string,
  now: number
): MyPlace {
  const hours: OpenHours | null =
    draft.hours.kind === 'always'
      ? null
      : draft.hours.kind === 'window'
        ? { open: draft.hours.open, close: draft.hours.close }
        : ASSUMED_HOURS;

  return {
    id,
    name: draft.name.trim(),
    location: draft.location,
    district,
    themes: [draft.theme],
    priceLevel: PRICE_LEVEL[draft.priceBand],
    priceBand: draft.priceBand,
    avgCostUsd: 0,
    worthDetour: false,
    openHours: hours,
    visitDurationMin: stayMinutes(draft.stay),
    ...(draft.hours.kind === 'unknown' ? { hoursEstimated: true } : {}),
    source: 'mine',
    addedAt: now,
  };
}

/**
 * The user's places merged into a provider's, ready for a screen.
 *
 * Hidden places are dropped. A user place shadows a provider place of the
 * same id rather than duplicating it, which matters only if a later phase
 * ever hands back something a user has also added, but costs nothing now.
 */
export function mergePlaces(
  provided: readonly CuratedPlace[],
  mine: readonly MyPlace[]
): CuratedPlace[] {
  const visible = mine.filter((p) => !p.hidden);
  const mineIds = new Set(visible.map((p) => p.id));
  return [...visible, ...provided.filter((p) => !mineIds.has(p.id))];
}
