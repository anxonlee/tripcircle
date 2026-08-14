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

  return {
    ok: true,
    day: {
      city,
      placeIds: unique,
      window: parseWindow(params.get('w') ?? null),
      goal: parseGoal(params.get('g') ?? null),
    },
  };
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
