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
 * The week was the MVP's cadence; month and year arrived with Phase 2 and are
 * the same summary over a longer window rather than a different report. That
 * is deliberate — a year that counted different things could not be compared
 * with the weeks that made it up.
 */

const DAY_MS = 86_400_000;

/**
 * How far back a recap reaches.
 *
 * Calendar periods, not rolling ones: "this month" is the month on the wall,
 * because that is the month the user means. A rolling 30 days would be more
 * even and would never line up with anything they remember.
 */
export type Period = 'week' | 'month' | 'year';

export interface PeriodSummary {
  period: Period;
  /** Inclusive start / exclusive end, epoch ms. */
  startMs: number;
  endMs: number;
  visitCount: number;
  /** Distinct places stamped in the window. */
  placeCount: number;
  /** Places stamped in the window that had never been stamped before. */
  newPlaceCount: number;
  districts: District[];
  /** Themes touched, most frequent first. */
  themes: { theme: Category; count: number }[];
  photoCount: number;
  /** Places answered "yes" in the window — its highlights. */
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

/**
 * The window a period covers, as [start, end).
 *
 * Month and year are built with `Date` rather than by adding days, because
 * neither has a fixed length: months run 28 to 31 days, and a clock change
 * inside the window makes even a "31 day" month 30 days and 23 hours. Adding
 * `31 * DAY_MS` would put the boundary an hour into the next month twice a
 * year, which is the kind of bug that only shows up in October.
 *
 * The week keeps its day arithmetic, and the same caveat applies to it in a
 * milder form: a clock change moves the end by an hour, which cannot move a
 * visit across the boundary because the boundary is midnight local either
 * way.
 */
export function periodRange(
  period: Period,
  now: number = Date.now()
): { startMs: number; endMs: number } {
  const d = new Date(now);
  if (period === 'week') {
    const startMs = startOfWeek(now);
    return { startMs, endMs: startMs + 7 * DAY_MS };
  }
  if (period === 'month') {
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    return { startMs: start.getTime(), endMs: end.getTime() };
  }
  const start = new Date(d.getFullYear(), 0, 1);
  const end = new Date(d.getFullYear() + 1, 0, 1);
  return { startMs: start.getTime(), endMs: end.getTime() };
}

/** How long a loved place must go unvisited before it counts as overdue. */
const OVERDUE_DAYS = 60;

/** The week, kept as its own name because most callers only want that one. */
export function summarizeWeek(
  places: CuratedPlace[],
  visits: Visit[],
  now: number = Date.now()
): PeriodSummary {
  return summarize(places, visits, 'week', now);
}

export function summarize(
  places: CuratedPlace[],
  visits: Visit[],
  period: Period = 'week',
  now: number = Date.now()
): PeriodSummary {
  const { startMs, endMs } = periodRange(period, now);
  const byId = new Map(places.map((p) => [p.id, p]));

  const inPeriod = visits.filter(
    (v) => v.timestamp >= startMs && v.timestamp < endMs
  );

  const placeIds = new Set(inPeriod.map((v) => v.placeId));
  const districts = new Set<District>();
  const themeCounts = new Map<Category, number>();
  const goAgainIds = new Set<string>();
  let photoCount = 0;

  for (const v of inPeriod) {
    const place = byId.get(v.placeId);
    if (!place) continue;
    districts.add(place.district);
    for (const theme of place.themes) {
      themeCounts.set(theme, (themeCounts.get(theme) ?? 0) + 1);
    }
    if (v.photoUri) photoCount += 1;
    if (v.wouldGoAgain === 'yes') goAgainIds.add(v.placeId);
  }

  // "New" means first ever stamped inside the window, judged against the
  // whole log — so a place first visited in March is not new again in the
  // yearly recap that contains March.
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
    period,
    startMs,
    endMs,
    visitCount: inPeriod.length,
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
