import { aggregateAll, type Visit } from '../domain/diary';
import type { Category, CuratedPlace, District } from '../domain/types';

/**
 * Weekly recap (PRD §3A.4, FD4).
 *
 * Composed on demand from the visit log — nothing is precomputed or stored,
 * so a recap can never disagree with the diary it summarizes. Sharing is a
 * deliberate act: this module produces data, and nothing here posts,
 * uploads, or exposes a location.
 *
 * Monthly and yearly recaps are Phase 2; the week is the MVP's cadence.
 */

const DAY_MS = 86_400_000;

export interface WeekSummary {
  /** Inclusive start / exclusive end, epoch ms. */
  startMs: number;
  endMs: number;
  visitCount: number;
  /** Distinct places stamped this week. */
  placeCount: number;
  /** Places stamped this week that had never been stamped before. */
  newPlaceCount: number;
  districts: District[];
  /** Themes touched, most frequent first. */
  themes: { theme: Category; count: number }[];
  photoCount: number;
  /** Places answered "yes" this week — the week's highlights. */
  goAgain: CuratedPlace[];
  /** The forward hook (§3A.4): somewhere loved but not visited in a while. */
  overdue: { place: CuratedPlace; daysSince: number } | null;
}

/** Start of the week (Monday 00:00 local) containing `now`. */
export function startOfWeek(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  // getDay: 0 = Sunday. Shift so Monday is the first day.
  const daysSinceMonday = (d.getDay() + 6) % 7;
  return d.getTime() - daysSinceMonday * DAY_MS;
}

/** How long a loved place must go unvisited before it counts as overdue. */
const OVERDUE_DAYS = 60;

export function summarizeWeek(
  places: CuratedPlace[],
  visits: Visit[],
  now: number = Date.now()
): WeekSummary {
  const startMs = startOfWeek(now);
  const endMs = startMs + 7 * DAY_MS;
  const byId = new Map(places.map((p) => [p.id, p]));

  const thisWeek = visits.filter(
    (v) => v.timestamp >= startMs && v.timestamp < endMs
  );

  const placeIds = new Set(thisWeek.map((v) => v.placeId));
  const districts = new Set<District>();
  const themeCounts = new Map<Category, number>();
  const goAgainIds = new Set<string>();
  let photoCount = 0;

  for (const v of thisWeek) {
    const place = byId.get(v.placeId);
    if (!place) continue;
    districts.add(place.district);
    for (const theme of place.themes) {
      themeCounts.set(theme, (themeCounts.get(theme) ?? 0) + 1);
    }
    if (v.photoUri) photoCount += 1;
    if (v.wouldGoAgain === 'yes') goAgainIds.add(v.placeId);
  }

  // "New" means first ever stamped this week, judged against the whole log.
  const firstSeen = new Map<string, number>();
  for (const v of visits) {
    const prev = firstSeen.get(v.placeId);
    if (prev == null || v.timestamp < prev) firstSeen.set(v.placeId, v.timestamp);
  }
  let newPlaceCount = 0;
  for (const id of placeIds) {
    const first = firstSeen.get(id);
    if (first != null && first >= startMs && first < endMs) newPlaceCount += 1;
  }

  return {
    startMs,
    endMs,
    visitCount: thisWeek.length,
    placeCount: placeIds.size,
    newPlaceCount,
    districts: [...districts],
    themes: [...themeCounts.entries()]
      .map(([theme, count]) => ({ theme, count }))
      .sort((a, b) => b.count - a.count || a.theme.localeCompare(b.theme)),
    photoCount,
    goAgain: [...goAgainIds].map((id) => byId.get(id)).filter((p): p is CuratedPlace => !!p),
    overdue: findOverdue(places, visits, now),
  };
}

/**
 * "You loved this place but haven't been in a while" (PRD §3A.5) — the
 * between-summary reason to return, and the recap's handoff to the planner.
 * Picks the longest-neglected place the user has actually said yes to.
 */
export function findOverdue(
  places: CuratedPlace[],
  visits: Visit[],
  now: number = Date.now()
): { place: CuratedPlace; daysSince: number } | null {
  const byId = new Map(places.map((p) => [p.id, p]));
  const stats = aggregateAll(visits, now);

  let best: { place: CuratedPlace; daysSince: number } | null = null;
  for (const s of stats.values()) {
    if (s.goAgain.yes === 0) continue; // never loved — not a nudge, just a place
    if (s.daysSinceLastVisit < OVERDUE_DAYS) continue;
    const place = byId.get(s.placeId);
    if (!place) continue;
    if (!best || s.daysSinceLastVisit > best.daysSince) {
      best = { place, daysSince: s.daysSinceLastVisit };
    }
  }
  return best;
}
