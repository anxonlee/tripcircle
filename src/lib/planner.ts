import { aggregateAll, type PlaceStats, type Visit } from '../domain/diary';
import type { CuratedPlace, StartPlace } from '../domain/types';
import { haversineKm } from './geo';

/**
 * The thin planner (PRD FD5) — "a simple optimized day out from the curated
 * dataset and the user's frequency/recency history."
 *
 * This module only CHOOSES which places belong in a day; ordering, transport,
 * and timing stay with the optimizer. Keeping selection separate is what lets
 * the full Balanced/Fastest optimizer arrive in Phase 2 without touching the
 * ranking logic.
 *
 * ⚠️ The scoring inputs are deliberately limited to Foundation + Curation +
 * the user's own diary. Google ratings and review counts are never consulted:
 * §12.2 forbids feeding stored Google values to the optimizer, and the whole
 * premise is that our curation plus your history beats a crowd average.
 */

/**
 * What kind of claim a reason makes. Prevalence is measured per kind rather
 * than per string, because "Not since 2 months ago" and "Not since 4 months
 * ago" are one label wearing two coats: counting the strings separately would
 * halve the measured prevalence of a reason that is really one reason.
 */
export type ReasonKind =
  | 'detour'
  | 'new'
  | 'regular'
  | 'overdue'
  | 'nearLoved'
  | 'district';

export interface Reason {
  kind: ReasonKind;
  /** What the user reads. */
  text: string;
  /**
   * Whether the reason states something about the user's own record *at this
   * place* — which is what earns exemption from the prevalence threshold
   * (§3.3.0.3), and is a narrower test than merely coming from the diary.
   *
   * The distinction is what bounds the label's spread. "A regular of yours"
   * and "Not since 3 months ago" can only attach to somewhere already in the
   * diary, so their prevalence is capped by how much of it overlaps the
   * candidate set — small, and meaningful when it is not.
   *
   * "Near somewhere you liked" and "A district you keep returning to" also
   * read the diary, but neither says anything about the candidate itself.
   * They are bounded by the dataset instead: one liked place in a dense
   * district lights up every neighbour, and the district label is true of
   * every unvisited place in it by definition. Measured, proximity reached
   * 34% of candidates on an eight-place diary — the exact failure the rule
   * exists to catch, admitted through an exemption meant for something else.
   */
  aboutThisPlace: boolean;
}

export interface Suggestion {
  place: CuratedPlace;
  score: number;
  /** Why this place is in the day — shown to the user, per PRD §1.3.3. */
  reasons: string[];
  /** The same reasons with their kind, which is what suppression works on. */
  reasonDetail: Reason[];
}

/**
 * Whether the user would rather be sent back to places they know or out to
 * ones they have not been.
 *
 * This trade-off was always in the scoring, as a set of constants nobody
 * could see: an unstamped place collected a flat bonus while a loved one
 * collected would-go-again, frequency and overdue boosts. Naming it makes the
 * product's choice the user's.
 */
export type SuggestionBias = 'familiar' | 'new';

/**
 * How each mode weights the two competing pulls. Multipliers, never filters:
 * "unstamped places are how the diary grows", and a mode that returned only
 * favourites would stop the memory wall growing altogether. Either mode can
 * still surface either kind — it leads with one.
 *
 * `familiar` is the identity, which is to say it is the ranking exactly as it
 * always behaved. There was briefly a third mode between these two, and it
 * was deleted because it could not differ from this one: measured at diary
 * sizes 4, 6, 10, 16 and 24, an evenly weighted ranking produced output
 * identical to a familiar-weighted one every time. Above it the day is
 * already saturated with stamped places, below it the theme spread caps how
 * many can appear, and at small diaries there simply are not more to promote.
 * The default was already the familiar one; this only says so.
 *
 * Penalties are deliberately not scaled. Disliking a place and having been
 * there yesterday are facts about the place, not preferences about the day.
 */
const BIAS_WEIGHTS: Record<SuggestionBias, { known: number; unknown: number }> = {
  familiar: { known: 1, unknown: 1 },
  new: { known: 0.15, unknown: 2.5 },
};

/** What the diary says about the user, computed once per ranking. */
interface DiaryContext {
  /** Places they have stamped and would go back to. */
  loved: CuratedPlace[];
  /** The district they keep returning to, if there is one. */
  topDistrict: string | null;
}

interface ScoreContext {
  stats: PlaceStats | undefined;
  anchorKm: number;
  diary: DiaryContext;
  bias: { known: number; unknown: number };
  /** The user's outing window, when the caller knows it. */
  window: DayWindow | undefined;
}

/**
 * What a place loses for being shut through the user's day.
 *
 * Scaled by how much of the window it is closed for, so somewhere open
 * throughout loses nothing and somewhere open for none of it loses the lot.
 * Set above the `worthDetour` bonus of 3 deliberately: editorial enthusiasm
 * should not put a venue in a day that cannot visit it.
 *
 * The ranking had no notion of opening hours at all before this, which is how
 * a bar opening at 17:00 came to be suggested for a day starting at 09:00 —
 * measured at 467 minutes of waiting, 320 of which no reordering could
 * remove, because the problem was the choice rather than the sequence.
 */
const CLOSED_PENALTY = 4;

/** Days after which a loved place becomes a "you haven't been in a while". */
const REVISIT_SWEET_SPOT_DAYS = 45;
/**
 * Beyond this from the anchor, a place is a poor fit for a local day out.
 *
 * Six kilometres is a deliberate choice about what a Bay Area day out *is*,
 * not a radius inherited from a denser city. Measured from Powell St it
 * admits 92 of the 439 seed places — 21% — which is most of San Francisco and
 * nothing across the water: Powell to downtown Oakland is roughly 13km. So a
 * suggested day stays on one side of the Bay by construction.
 *
 * That is the right default even though the transport model can cross: a
 * crossing costs a BART fare and 20-odd minutes each way, and spending that
 * twice is a decision a user should make deliberately by choosing a start
 * place over there, rather than something the ranking does to them. Widening
 * this is how a "day out" becomes a day of travelling.
 */
const MAX_ANCHOR_KM = 6;
/** Close enough to somewhere they liked to be worth mentioning. */
const NEAR_LOVED_KM = 0.4;
/** Visits to one district before it counts as somewhere they keep returning to. */
const DISTRICT_AFFINITY_MIN = 2;

/**
 * A reason is shown only if it is true of this share of the candidates or
 * fewer (PRD §3.3.0.3). "Somewhere new" once appeared on 49 of 53 places,
 * which is noise wearing the costume of an explanation.
 */
export const REASON_PREVALENCE_MAX = 0.25;

/**
 * Distinct places the user must have visited before the Plan tab offers
 * suggestions (PRD §3.3.0.1). One stamp is not something to rank on, and
 * suggesting from it reproduces the vacuous-reason problem at a smaller
 * scale. The threshold is recorded here rather than in the screen so it can
 * be tuned and tested in one place.
 */
export const SUGGESTION_HISTORY_THRESHOLD = 4;

/** How many distinct places the diary holds. */
export function distinctPlacesVisited(visits: Visit[]): number {
  return new Set(visits.map((v) => v.placeId)).size;
}

/**
 * Whether there is enough of a diary to suggest from.
 *
 * The gate lives here and is applied by the caller rather than inside
 * `suggestDay`, which stays pure: ranking with an empty diary is a
 * meaningful thing to ask for and the tests do ask for it.
 */
export function hasEnoughHistory(visits: Visit[]): boolean {
  return distinctPlacesVisited(visits) >= SUGGESTION_HISTORY_THRESHOLD;
}

function scorePlace(place: CuratedPlace, ctx: ScoreContext): Suggestion {
  const reasonDetail: Reason[] = [];
  let score = 0;

  // ——— Curation: our editorial judgment ———
  if (place.worthDetour) {
    score += 3;
    reasonDetail.push({
      kind: 'detour',
      text: 'Worth a detour',
      aboutThisPlace: false,
    });
  }

  // ——— The diary: frequency and recency (PRD §3A.5) ———
  const stats = ctx.stats;
  if (stats) {
    const { goAgain, visitCount, daysSinceLastVisit } = stats;

    // Would-go-again is the ranking signal. The penalty is not weighted by
    // the bias: wanting familiar places is not wanting places you disliked.
    score += goAgain.yes * 2.5 * ctx.bias.known;
    score -= goAgain.no * 4;

    // Frequency → preference. Sub-linear: eight visits is a favourite, not
    // eight times better than one.
    score += Math.log2(1 + visitCount) * 1.5 * ctx.bias.known;
    if (visitCount >= 3 && goAgain.no === 0) {
      reasonDetail.push({
        kind: 'regular',
        text: 'A regular of yours',
        aboutThisPlace: true,
      });
    }

    // Recency → timely nudge. Loved but not recently seen scores highest;
    // somewhere visited last week is not news.
    //
    // The penalty tapers across the whole revisit window rather than
    // switching off after three days. Under the old cliff, a place stamped a
    // fortnight ago kept its would-go-again and frequency boosts with nothing
    // set against them and outranked everywhere unvisited, so a diary of four
    // recent places produced four suggestions to go straight back to them.
    if (goAgain.yes > 0) {
      if (daysSinceLastVisit >= REVISIT_SWEET_SPOT_DAYS) {
        score += 3 * ctx.bias.known;
        const months = Math.floor(daysSinceLastVisit / 30);
        reasonDetail.push({
          kind: 'overdue',
          text: `Not since ${months} month${months === 1 ? '' : 's'} ago`,
          aboutThisPlace: true,
        });
      } else {
        score -= 5 * (1 - daysSinceLastVisit / REVISIT_SWEET_SPOT_DAYS);
      }
    }
  } else {
    // Unstamped places are how the diary grows, so they are not penalised —
    // an all-favourites day would make the wall stop growing. Even in the
    // familiar mode the bonus is reduced, never removed, for that reason.
    score += 1.5 * ctx.bias.unknown;
    reasonDetail.push({
      kind: 'new',
      text: 'Somewhere new',
      aboutThisPlace: false,
    });
  }

  // ——— Affinities drawn from the diary ———
  // These read the diary but say nothing about the candidate itself, so they
  // face the prevalence threshold like any dataset-derived label. They were
  // briefly exempt on the grounds of being diary-derived, and proximity
  // promptly reached 34% of candidates — see `Reason.aboutThisPlace`.
  //
  // Both are about somewhere the user has not been. Telling someone that a
  // place they stamped a fortnight ago is near a place they liked is not a
  // reason to go back, it is a fact about the map.
  const { loved, topDistrict } = ctx.diary;
  const unstamped = !stats;
  if (
    unstamped &&
    loved.some((l) => haversineKm(l.location, place.location) <= NEAR_LOVED_KM)
  ) {
    reasonDetail.push({
      kind: 'nearLoved',
      text: 'Near somewhere you liked',
      aboutThisPlace: false,
    });
  }
  if (unstamped && topDistrict && place.district === topDistrict) {
    reasonDetail.push({
      kind: 'district',
      text: 'A district you keep returning to',
      aboutThisPlace: false,
    });
  }

  // ——— Practicality: keep the day walkable from the anchor ———
  score -= ctx.anchorKm * 0.4;

  // ——— Practicality: and open while the user is actually out ———
  if (ctx.window) {
    const span = Math.max(0, ctx.window.homeByMin - ctx.window.dayStartMin);
    if (span > 0) {
      const openShare = openMinutesInWindow(place, ctx.window) / span;
      score -= (1 - openShare) * CLOSED_PENALTY;
    }
  }

  return {
    place,
    score,
    reasons: reasonDetail.map((r) => r.text),
    reasonDetail,
  };
}

/** Read the shape of the diary once, rather than per candidate. */
function readDiary(
  places: CuratedPlace[],
  stats: Map<string, PlaceStats>
): DiaryContext {
  const loved = places.filter((p) => (stats.get(p.id)?.goAgain.yes ?? 0) > 0);

  const perDistrict = new Map<string, number>();
  for (const p of loved) {
    perDistrict.set(p.district, (perDistrict.get(p.district) ?? 0) + 1);
  }
  const [top] = [...perDistrict.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
  );

  return {
    loved,
    topDistrict: top && top[1] >= DISTRICT_AFFINITY_MIN ? top[0] : null,
  };
}

/**
 * Rank every published place for a day starting from `startPlace`.
 * Highest score first. Places beyond a sensible radius are dropped entirely.
 */
export function rankPlaces(
  places: CuratedPlace[],
  visits: Visit[],
  startPlace: StartPlace,
  now: number = Date.now(),
  bias: SuggestionBias = 'familiar',
  window?: DayWindow
): Suggestion[] {
  const stats = aggregateAll(visits, now);
  const diary = readDiary(places, stats);
  const weights = BIAS_WEIGHTS[bias];
  return places
    .map((place) => {
      const anchorKm = haversineKm(startPlace.location, place.location);
      return { place, anchorKm };
    })
    .filter((x) => x.anchorKm <= MAX_ANCHOR_KM)
    // Somewhere shut for every minute of the day cannot be suggested at all.
    // A penalty would only push it down the list; there is no ordering in
    // which it can be visited.
    .filter((x) => !window || openMinutesInWindow(x.place, window) > 0)
    .map(({ place, anchorKm }) =>
      scorePlace(place, {
        stats: stats.get(place.id),
        anchorKm,
        diary,
        bias: weights,
        window,
      })
    )
    .sort((a, b) => b.score - a.score || a.place.id.localeCompare(b.place.id));
}

/**
 * Drop reasons true of too much of the candidate set (PRD §3.3.0.3).
 *
 * This runs over the ranked set rather than inside `scorePlace`, because
 * prevalence is a property of the whole set and a single place cannot see it.
 * Keeping it out of the ranking also means the score is unaffected: this
 * changes what a card says, not what is offered.
 */
export function suppressCommonReasons(ranked: Suggestion[]): Suggestion[] {
  if (ranked.length === 0) return [];

  const seen = new Map<ReasonKind, number>();
  for (const s of ranked) {
    for (const r of s.reasonDetail) {
      seen.set(r.kind, (seen.get(r.kind) ?? 0) + 1);
    }
  }

  const keep = (r: Reason) =>
    r.aboutThisPlace ||
    (seen.get(r.kind) ?? 0) / ranked.length <= REASON_PREVALENCE_MAX;

  return ranked.map((s) => {
    const reasonDetail = s.reasonDetail.filter(keep);
    return { ...s, reasonDetail, reasons: reasonDetail.map((r) => r.text) };
  });
}

/**
 * What being explainable is worth, in the same units as the score.
 *
 * Calibrated against the gap it has to close rather than picked, and
 * re-measured for the Bay rather than carried over. On the tightest case —
 * four places all stamped within a fortnight, ranked against the 92 seed
 * places within `MAX_ANCHOR_KM` of Powell St — the best unexplainable
 * candidate scores 1.34 and the fourth-best explainable one 0.06, a gap of
 * 1.28. Two is the smallest whole number that clears it.
 *
 * Hong Kong measured 3.52 on the same test and used four. The number does not
 * travel because the gap it closes is a property of the score distribution,
 * which depends on the dataset's density and how much of it a diary covers:
 * 92 candidates spread scores more thinly than 53 did.
 *
 * It is deliberately not large enough to reproduce the absolute ordering it
 * replaced, where anything explainable beat anything that was not whatever
 * the score gap — that quietly outranked preferences the user had set
 * explicitly, because the explainable pool skews towards places already in
 * the diary.
 */
export const EXPLAINED_BONUS = 2;

/**
 * Favour candidates that can be explained, without letting that decide alone.
 *
 * The history gate exists because a suggestion nobody can justify should not
 * be made (§3.3.0.1), and this is the same principle at the level of one
 * card: once suppression has run, a place with nothing specific left to say
 * about it is a worse suggestion than one that has. Without any such push, a
 * diary of recent visits produced four cards with a blank reason line.
 *
 * It used to be an absolute sort key — anything explainable beat anything
 * that was not, whatever the score gap. That quietly outranked every other
 * signal, including preferences the user had set explicitly, because the
 * explainable pool skews towards places already in the diary: `overdue`
 * legitimately attaches to all of them. A bounded bonus keeps the intent and
 * gives the rest of the ranking its say back.
 */
export function explainedFirst(suggestions: Suggestion[]): Suggestion[] {
  const withBonus = (s: Suggestion) =>
    s.score + (s.reasons.length > 0 ? EXPLAINED_BONUS : 0);
  return [...suggestions].sort(
    (a, b) =>
      withBonus(b) - withBonus(a) || a.place.id.localeCompare(b.place.id)
  );
}

/** The user's outing window, minutes since midnight. */
export interface DayWindow {
  dayStartMin: number;
  homeByMin: number;
}

/**
 * The latest a day may end: 23:59, not midnight.
 *
 * `formatTime` wraps modulo 1440, so a `homeByMin` of 1440 renders as "0:00"
 * and the optimizer's over-time warning read "past your 0:00 target". Worse,
 * that warning fires on `homeMin > homeByMin`, so at midnight it could only
 * trigger for a day ending the following morning — it was switched off in
 * practice. One minute short of midnight covers the same day and keeps both
 * working.
 */
export const LATEST_HOME_BY_MIN = 24 * 60 - 1;

/**
 * Shortest window the user may set. Below half an hour the day is degenerate
 * — there is no outing that fits — and the floor of `MIN_STOPS` would be
 * promising stops the time cannot hold.
 */
export const MIN_DAY_WINDOW_MIN = 30;

/**
 * Force a window into the range the planner and the optimizer can both use.
 *
 * The whole 24 hours is reachable: 00:00 to 23:59 clamps to itself. What is
 * not reachable is a window that ends before it starts, or one that crosses
 * midnight — `homeByMin` stays in the same day, so an outing running into the
 * small hours is out of scope rather than silently wrapped.
 */
export function clampDayWindow(window: DayWindow): DayWindow {
  const latestStart = LATEST_HOME_BY_MIN - MIN_DAY_WINDOW_MIN;
  const dayStartMin = Math.round(
    Math.min(Math.max(0, window.dayStartMin), latestStart)
  );
  const homeByMin = Math.round(
    Math.min(
      Math.max(window.homeByMin, dayStartMin + MIN_DAY_WINDOW_MIN),
      LATEST_HOME_BY_MIN
    )
  );
  return { dayStartMin, homeByMin };
}

/** Fewest stops worth calling a day out. A one-stop day is an errand. */
export const MIN_STOPS = 2;
/**
 * Most stops a *suggested* day may hold.
 *
 * A product decision rather than a derived one: five is as much as anyone
 * wants handed to them unasked. It does not constrain a day the user builds
 * themselves — a selection is theirs and is never trimmed (§3.3.0).
 *
 * This binds at the top of the range where `MAX_OUTING_MINUTES` used to, so
 * the two limits now work at opposite ends. Measured from a central anchor,
 * the derivation varies across roughly four to seven hours — 2, 2, 3, 4, 5 —
 * and is pinned by the floor below that band and by this cap above it. So a
 * morning out and a whole day are still different days; a whole day and a
 * fifteen-hour window are not.
 *
 * An earlier version of this constant sat at twelve and was described as a
 * backstop that bound nothing. That was true then and is not now.
 */
export const MAX_STOPS = 5;

/**
 * How many ranked candidates the sizing estimate averages over.
 *
 * Deliberately wider than `MAX_STOPS`. The estimate needs a stable mean dwell
 * and mean hop, and taking them from only the five places that will be chosen
 * makes the answer depend on its own output — with four hops, one long leg
 * moves the whole estimate.
 */
const SIZING_SAMPLE = 12;

/**
 * The longest outing the planner will size for, in minutes.
 *
 * §3.3 scopes the planning unit at 3–8 hours from one start place. Without
 * this the derivation sizes whatever the window physically holds, and a
 * window is not an outing: someone free from nine until midnight is not going
 * to spend eleven unbroken hours moving between places, stopping only for as
 * long as each visit takes. Availability weighting cannot express that,
 * because it measures when the city is open rather than how long a person
 * stays out.
 *
 * It still governs everything below the cap, which is most of the range. It
 * is also what keeps the derivation honest as the dataset changes: eight
 * hours of ninety-minute museums is a different number of stops from eight
 * hours of twenty-minute snack stops, which a fixed cap cannot say.
 */
export const MAX_OUTING_MINUTES = 8 * 60;

/**
 * Door-to-door speed used only to size the day, km/h.
 *
 * Calibrated against the transport model rather than guessed, and re-measured
 * for the Bay: across the legs of the top-ranked chain from Powell St, mean
 * straight-line hop is 1.03km and the fastest mode averages 7.7 minutes, an
 * implied 8.0 km/h. Close to the 8.7 the Hong Kong model produced, but the
 * agreement is a coincidence of two different mixes — shorter hops here,
 * against a slower average mode — and not a reason to have skipped measuring.
 *
 * ⚠️ TEMP FIXTURE, and deliberately crude. Real leg times belong to the
 * optimizer; the planner does not import it, because how many stops fit is a
 * different question from how to travel between them.
 */
const SIZING_SPEED_KMH = 8.0;

/** How much of `window` this place is open for, in minutes. */
function openMinutesInWindow(place: CuratedPlace, window: DayWindow): number {
  const { dayStartMin: start, homeByMin: end } = window;
  const span = Math.max(0, end - start);
  // No authored hours means an outdoor place with nothing to be shut.
  if (!place.openHours) return span;
  const from = Math.max(start, place.openHours.open);
  const to = Math.min(end, place.openHours.close);
  return Math.max(0, to - from);
}

/**
 * The window's usable minutes: each minute weighted by the share of
 * candidates open through it.
 *
 * A clock window is not an outing window. Widening the day to the full 24
 * hours adds hours in which almost nothing is open, and dividing raw clock
 * minutes by a dwell estimate would derive a day of stops that cannot be
 * visited. Weighting by availability means a longer window still buys more
 * stops, but at a falling rate, which is what the opening hours actually say.
 */
function usableMinutes(places: CuratedPlace[], window: DayWindow): number {
  if (places.length === 0) return 0;
  const total = places.reduce((sum, p) => sum + openMinutesInWindow(p, window), 0);
  return total / places.length;
}

/** Mean straight-line hop along a chain of places, km. */
function meanLegKm(places: CuratedPlace[]): number {
  if (places.length < 2) return 0;
  let km = 0;
  for (let i = 1; i < places.length; i++) {
    km += haversineKm(places[i - 1].location, places[i].location);
  }
  return km / (places.length - 1);
}

/**
 * How many stops fit the window (PRD §3.3.0.2). Derived from the time
 * available, the dwell estimates of the places in contention and the ground
 * between them — never fixed, and never asked for before the first output.
 */
export function deriveStopCount(
  ranked: Suggestion[],
  window: DayWindow
): number {
  if (ranked.length === 0) return 0;

  // Size against the places plausibly in the day rather than the whole
  // catalogue: the tail of the ranking is not what the user is being offered.
  const sample = ranked.slice(0, SIZING_SAMPLE).map((s) => s.place);

  // Two separate limits, and both are real. Availability says how much of the
  // window the city is actually open for; the outing ceiling says how long
  // someone stays out. A fifteen-hour window fails the second long before it
  // fails the first.
  const minutes = Math.min(usableMinutes(sample, window), MAX_OUTING_MINUTES);

  const dwell =
    sample.reduce((sum, p) => sum + p.visitDurationMin, 0) / sample.length;
  const travel = (meanLegKm(sample) / SIZING_SPEED_KMH) * 60;

  const perStop = dwell + travel;
  if (perStop <= 0) return Math.min(ranked.length, MAX_STOPS);

  const derived = Math.floor(minutes / perStop);
  return Math.max(MIN_STOPS, Math.min(MAX_STOPS, derived));
}

/**
 * Pick a day's worth of places: the top-ranked ones, capped, and spread so a
 * day is not five bakeries. At most two places share a primary theme.
 *
 * `size` takes either an explicit count or the user's day window, in which
 * case the count is derived from it.
 */
export function suggestDay(
  places: CuratedPlace[],
  visits: Visit[],
  startPlace: StartPlace,
  size: number | DayWindow = 4,
  now: number = Date.now(),
  bias: SuggestionBias = 'familiar'
): Suggestion[] {
  const window = typeof size === 'number' ? undefined : size;
  const ranked = explainedFirst(
    suppressCommonReasons(
      rankPlaces(places, visits, startPlace, now, bias, window)
    )
  );
  const count =
    typeof size === 'number' ? size : deriveStopCount(ranked, size);
  const perTheme = new Map<string, number>();
  const chosen: Suggestion[] = [];

  for (const s of ranked) {
    if (chosen.length >= count) break;
    const primary = s.place.themes[0];
    const used = perTheme.get(primary) ?? 0;
    if (used >= 2) continue;
    perTheme.set(primary, used + 1);
    chosen.push(s);
  }
  return dropUniversalReasons(chosen);
}

/**
 * Drop any reason carried by every place on the screen (PRD §3.3.0.3).
 *
 * The prevalence threshold measures across the whole candidate set, which is
 * what catches a label true of 49 of 53 places. It cannot catch a label true
 * of 15% of the dataset that happens to land on all five places shown, and
 * that is what a user sees: five cards reading "Near somewhere you liked · A
 * district you keep returning to", word for word. §3.3.0.3 asks that a reason
 * be true of a quarter or fewer of the candidates *on screen*, and five of
 * five is not that.
 *
 * A second rule rather than a replacement, because the two catch different
 * things. Measuring only across the shown few would set a threshold on a
 * sample of five and would never have found the original problem.
 *
 * **This one compares the text, where prevalence compares the kind.** That
 * difference is deliberate and the rules would both be wrong the other way
 * round. Prevalence asks whether a kind of claim is common across the
 * dataset, so "not since 2 months ago" and "not since 4 months ago" have to
 * count as one reason or the measurement halves. This asks whether a sentence
 * tells these particular cards apart, and those two sentences do — a day of
 * four overdue places, each naming a different gap, is informative. Five
 * cards reading the same words is not.
 *
 * This can empty a card, and that is the accepted outcome: a line true of
 * everything on screen distinguishes nothing, and §3.3.0.3 holds that vacuous
 * reasoning is worse than none. Do not add a fallback label to fill the gap.
 */
export function dropUniversalReasons(shown: Suggestion[]): Suggestion[] {
  if (shown.length < 2) return shown;

  const saidByAll = shown[0].reasonDetail
    .map((r) => r.text)
    .filter((text) => shown.every((s) => s.reasons.includes(text)));
  if (saidByAll.length === 0) return shown;

  return shown.map((s) => {
    const reasonDetail = s.reasonDetail.filter((r) => !saidByAll.includes(r.text));
    return { ...s, reasonDetail, reasons: reasonDetail.map((r) => r.text) };
  });
}

/**
 * How far off the line between the two ends of a gap a filler may sit.
 *
 * A detour, not a radius: the cost of a candidate is the extra ground walked
 * to include it, which is what a person actually pays. Judging by distance
 * from the anchor instead — the test `rankPlaces` already applies — would
 * happily offer somewhere back past the start place while the day waits half
 * a mile away. That distinction matters more here than in a compact city:
 * `MAX_ANCHOR_KM` is 6km, which from a central anchor spans most of San
 * Francisco, so the anchor test alone constrains almost nothing.
 *
 * Checked rather than inherited. On a Coit Tower to Zeitgeist corridor —
 * 3.9km apart, five hours free — 1.2km admits 25 of the 80 candidates open
 * in the window, and the ones it leads with sit on the line rather than near
 * it: Union Square at 0.11km of detour, Asian Art Museum at 0.00.
 */
const MAX_GAP_DETOUR_KM = 1.2;

/**
 * Minutes of the gap left unspent after a candidate's visit, below which it
 * does not fit. Covers getting there and getting on, at the sizing speed.
 */
const GAP_TRAVEL_ALLOWANCE_MIN = 20;

/** The free stretch a filler has to fit inside. */
export interface GapWindow {
  fromMin: number;
  toMin: number;
  fromLocation: { latitude: number; longitude: number };
  toLocation: { latitude: number; longitude: number };
}

/**
 * What could fill an empty stretch of a planned day (PRD §3.3.0).
 *
 * **This is an offer, never a substitution.** Nothing here enters the plan
 * until the user taps it — §3.3.0 permits the planner to offer an
 * alternative as "a distinct, dismissible element" and forbids it becoming
 * the default plan, and the caller is what has to honour that.
 *
 * It is deliberately not gated on diary history, where suggestions into an
 * empty Plan tab are (§3.3.0.1). That gate exists because a suggestion drawn
 * from nothing is arbitrary. This one is not drawn from nothing: the time
 * window and the corridor between two chosen places do the constraining that
 * a diary would otherwise have to. A first-time user with a bakery, a bar and
 * seven hours between them is the person this helps most, and answering them
 * with "stamp four places first" would be the empty state at its worst.
 *
 * The diary still improves the answer wherever it exists — `rankPlaces` reads
 * would-go-again, frequency, recency and district affinity as usual. It is no
 * longer required for the answer to be meaningful.
 */
export function suggestGapFillers(
  places: CuratedPlace[],
  visits: Visit[],
  startPlace: StartPlace,
  gap: GapWindow,
  now: number = Date.now(),
  limit: number = 3
): Suggestion[] {
  const minutes = gap.toMin - gap.fromMin;
  if (minutes <= 0) return [];

  const directKm = haversineKm(gap.fromLocation, gap.toLocation);
  const detourKm = (p: CuratedPlace) =>
    haversineKm(gap.fromLocation, p.location) +
    haversineKm(p.location, gap.toLocation) -
    directKm;

  // The gap is the window, so `rankPlaces` scores open-hours fit against the
  // free stretch rather than the whole day, and drops anything shut for all
  // of it.
  const ranked = rankPlaces(places, visits, startPlace, now, 'familiar', {
    dayStartMin: gap.fromMin,
    homeByMin: gap.toMin,
  }).filter(
    (s) =>
      s.place.visitDurationMin + GAP_TRAVEL_ALLOWANCE_MIN <= minutes &&
      detourKm(s.place) <= MAX_GAP_DETOUR_KM
  );

  // Same reason discipline as anywhere else. Most of these will end up with
  // no reason line at all, which is correct: "it fits your gap" is true of
  // every card here, so the strip's own heading says it once instead.
  return dropUniversalReasons(
    suppressCommonReasons(ranked).slice(0, Math.max(0, limit))
  );
}
