import { GOALS, isGoal, type Goal } from './optimizer';
import { clampDayWindow, LATEST_HOME_BY_MIN, type DayWindow } from './planner';

/**
 * Sharing a day as a link (PRD §14 F11, "link-only" of the §343 privacy
 * ladder, in the Phase 1 shape that has no accounts and no server).
 *
 * A shared day is the stops, in order, and the window and objective they were
 * planned against. It is deliberately NOT a route: legs, times, and costs are
 * all recomputed on the other side, because a route is only true relative to
 * where someone starts.
 *
 * WHAT IS NEVER IN A LINK: the start place. §3.1 is unconditional — start
 * places are "never serialized into shared posts, clones, or exports" — and
 * §342 says a clone re-anchors to the cloner's own. Both point the same way,
 * and the reason is not tidiness: a start place plus a shared day is a
 * statement about where someone lives and when they are not home. Nothing
 * here can carry one, because there is no field for it.
 *
 * Also absent: the diary. Which places someone has stamped, how often, and
 * what they thought is the private half of the app, and none of it is needed
 * to rebuild the day.
 *
 * The payload is readable rather than encoded. Base64 would be shorter by
 * about a fifth and would hide from the sender exactly what they are about to
 * send, which is a bad trade for a link whose whole claim is that it carries
 * less than you would expect.
 *
 *   pirtsf://d?v=1&c=sf&w=540-1439&g=balanced&p=ferry-building,union-square
 *
 * A day with a time fixed to one of its stops carries a sixth key:
 *
 *   ...&p=ferry-building,union-square&t=union-square:1140
 *
 * The city tag is what stops a Hong Kong day opening silently empty on a
 * build carrying a different dataset. Place ids are shared vocabulary between
 * two copies of the app; they are meaningless to anyone else, which is the
 * cost of the app-to-app scope and the reason `decodeDayLink` reports what it
 * could not resolve rather than quietly dropping it.
 */

/**
 * NOT `pirt`. That scheme belongs to the Hong Kong build, and iOS does not
 * arbitrate between two installed apps claiming one scheme — it picks, and
 * which one it picks is not something either app can rely on. Two apps
 * sharing a scheme is the same trap as two apps sharing a bundle identifier,
 * with the failure moved from install time to the moment a friend taps a
 * link. The city tag below is the second line of defence, not the first.
 */
export const TRIP_LINK_SCHEME = 'pirtsf';

/** Bumped only when a change would make an older build misread a link. */
export const TRIP_LINK_VERSION = 1;

/**
 * Which place dataset the ids belong to. This build carries the Bay Area
 * set; the Hong Kong build says `hk`, and a link from one opens on the other
 * as a named refusal rather than an empty day.
 */
export const DATASET_CITY = 'sf';

export interface SharedDay {
  city: string;
  /** Ordered stops. The order is the point — a shared day is an arrangement. */
  placeIds: string[];
  window: DayWindow;
  goal: Goal;
  /**
   * Times the sender fixed by hand, place id to minutes since midnight
   * (PRD F6, §3.4). Absent when they fixed none, which is most days.
   *
   * These travel because a pin is part of the arrangement, not part of the
   * route: "we are at the table at seven" survives being re-anchored to
   * someone else's start place, where an arrival time does not. Sharing the
   * order but not the times would hand over half a plan and no way to see
   * which half was missing.
   */
  pinnedTimes?: Record<string, number>;
}

export type DecodeResult =
  | { ok: true; day: SharedDay }
  | { ok: false; reason: DecodeFailure };

export type DecodeFailure =
  /** Not one of ours, or not a day link. */
  | { kind: 'notADayLink' }
  /** Written by a newer build than this one. */
  | { kind: 'tooNew'; version: number }
  /** A real day, for a place dataset this build does not carry. */
  | { kind: 'otherCity'; city: string }
  /** Ours, right city, but nothing survived parsing. */
  | { kind: 'empty' };

/** Slugs are the only shape a place id takes; anything else is not one. */
const PLACE_ID = /^[a-z0-9-]+$/;

/**
 * Builds the link. Ids are filtered to the slug shape rather than escaped:
 * an id needing escaping is not an id this build produced, and a link is a
 * bad place to find that out.
 */
export function encodeDayLink(day: SharedDay): string {
  const ids = day.placeIds.filter((id) => PLACE_ID.test(id));
  const w = clampDayWindow(day.window);
  const params = [
    `v=${TRIP_LINK_VERSION}`,
    `c=${day.city}`,
    `w=${w.dayStartMin}-${w.homeByMin}`,
    `g=${day.goal}`,
    `p=${ids.join(',')}`,
  ];
  /**
   * Appended rather than folded into `p`, and the version is deliberately
   * not bumped for it.
   *
   * Builds 6–10 are already in TestFlight and read a link by looking up the
   * five keys they know; an unknown sixth is ignored, so a pinned day opens
   * on them as the same day without the times. Bumping the version would
   * instead make those builds refuse the link outright — a day nobody can
   * open is a worse outcome than a day missing a constraint, and the whole
   * point of `tooNew` is to protect against changes that would be *misread*,
   * which this is not.
   */
  const pins = encodePins(day.pinnedTimes, ids, w);
  if (pins) params.push(`t=${pins}`);
  return `${TRIP_LINK_SCHEME}://d?${params.join('&')}`;
}

/**
 * Reads a link back, tolerating everything a link can pick up between two
 * phones: a trailing bracket from a chat client, a stray query key from a
 * future build, a window that no longer makes sense.
 *
 * `known` is the set of place ids this build carries. Ids outside it are
 * dropped and counted by the caller against what it asked for, so the user is
 * told "two of these are not in your places" instead of receiving a shorter
 * day than the one that was sent.
 */
export function decodeDayLink(url: string, known: Set<string>): DecodeResult {
  const params = parseDayUrl(url);
  if (!params) return { ok: false, reason: { kind: 'notADayLink' } };

  const version = Number(params.get('v') ?? '');
  if (!Number.isFinite(version) || version < 1) {
    return { ok: false, reason: { kind: 'notADayLink' } };
  }
  if (version > TRIP_LINK_VERSION) {
    return { ok: false, reason: { kind: 'tooNew', version } };
  }

  const city = params.get('c') ?? '';
  if (city !== DATASET_CITY) {
    return { ok: false, reason: { kind: 'otherCity', city: city || 'unknown' } };
  }

  const placeIds = (params.get('p') ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => PLACE_ID.test(id) && known.has(id));
  // Deduplicate, keeping first position: the same place twice in one day is
  // not something the planner has a meaning for.
  const unique = placeIds.filter((id, i) => placeIds.indexOf(id) === i);
  if (unique.length === 0) return { ok: false, reason: { kind: 'empty' } };

  const window = parseWindow(params.get('w') ?? null);

  return {
    ok: true,
    day: {
      city,
      placeIds: unique,
      window,
      goal: parseGoal(params.get('g') ?? null),
      pinnedTimes: parsePins(params.get('t') ?? null, unique, window),
    },
  };
}

/**
 * "id:540,other-id:780". Pairs whose place is not in the day are dropped
 * before sending: a pin without its stop describes nothing, and carrying it
 * would let a link say something about a place it does not contain.
 */
function encodePins(
  pins: Record<string, number> | undefined,
  ids: string[],
  window: DayWindow
): string | null {
  if (!pins) return null;
  const parts = ids
    .filter((id) => Number.isFinite(pins[id]))
    .map((id) => [id, Math.round(pins[id])] as const)
    .filter(([, min]) => min >= window.dayStartMin && min <= window.homeByMin)
    .map(([id, min]) => `${id}:${min}`);
  return parts.length > 0 ? parts.join(',') : null;
}

/**
 * Read back against the day that survived parsing, not against the raw
 * string. A pin for a place this build could not resolve has nothing to
 * attach to, and one outside the shared window describes a day the link
 * itself says is not being had.
 */
function parsePins(
  raw: string | null,
  placeIds: string[],
  window: DayWindow
): Record<string, number> | undefined {
  if (!raw) return undefined;
  const inDay = new Set(placeIds);
  const out: Record<string, number> = {};
  for (const pair of raw.split(',')) {
    const at = pair.lastIndexOf(':');
    if (at < 0) continue;
    const id = pair.slice(0, at).trim();
    if (!PLACE_ID.test(id) || !inDay.has(id)) continue;
    // First wins, matching the query parser: a repeated id is malformed,
    // and taking the last would let anything appended rewrite it.
    if (id in out) continue;
    const min = Number(pair.slice(at + 1).trim());
    if (!Number.isFinite(min)) continue;
    const rounded = Math.round(min);
    if (rounded < window.dayStartMin || rounded > window.homeByMin) continue;
    out[id] = rounded;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** How many of the link's stops this build could not place. */
export function unresolvedCount(url: string, known: Set<string>): number {
  const params = parseDayUrl(url);
  if (!params) return 0;
  const raw = (params.get('p') ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
  const seen = new Set<string>();
  let missing = 0;
  for (const id of raw) {
    if (seen.has(id)) continue;
    seen.add(id);
    if (!known.has(id)) missing += 1;
  }
  return missing;
}

/**
 * `pirt://d?...` only.
 *
 * Parsed by hand rather than with `URLSearchParams`, which React Native ships
 * only as a partial polyfill — the same reason the payload is not base64.
 * A link that decodes on one runtime and not another is the worst kind of
 * bug to find in a beta, and the whole grammar here is five keys.
 */
function parseDayUrl(url: string): Map<string, string> | null {
  const trimmed = url.trim();
  const prefix = `${TRIP_LINK_SCHEME}://d?`;
  if (!trimmed.toLowerCase().startsWith(prefix)) return null;
  // Chat clients cheerfully append a closing bracket or full stop to a bare
  // link. Neither belongs to any value we read, and both make ids unknown.
  const query = trimmed.slice(prefix.length).replace(/[).,\]]+$/, '');

  const params = new Map<string, string>();
  for (const pair of query.split('&')) {
    if (!pair) continue;
    const at = pair.indexOf('=');
    if (at < 0) continue;
    // First wins. A duplicated key is a malformed link, and taking the last
    // would let anything appended after a valid one rewrite it.
    const key = pair.slice(0, at);
    if (!params.has(key)) params.set(key, pair.slice(at + 1));
  }
  return params;
}

/** "540-1439" back to a window, clamped. Anything unreadable falls to default. */
function parseWindow(raw: string | null): DayWindow {
  const [a, b] = (raw ?? '').split('-');
  return clampDayWindow({
    dayStartMin: minutesOr(a, DEFAULT_START_MIN),
    homeByMin: minutesOr(b, LATEST_HOME_BY_MIN),
  });
}

/**
 * A missing half of the window falls back rather than parsing.
 * `Number('')` is 0, not NaN, so a link with no window at all would otherwise
 * read as a day starting at midnight — a plausible-looking value arrived at
 * by accident, which is worse than an obviously absent one.
 */
function minutesOr(raw: string | undefined, fallback: number): number {
  const text = (raw ?? '').trim();
  if (text === '') return fallback;
  const value = Number(text);
  return Number.isFinite(value) ? value : fallback;
}

const DEFAULT_START_MIN = 9 * 60;

function parseGoal(raw: string | null): Goal {
  return isGoal(raw) ? raw : 'balanced';
}

/** Exported for the tests, so the goal list cannot drift from the encoder. */
export const SHAREABLE_GOALS = GOALS;
