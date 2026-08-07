import type { Visit } from '../../domain/diary';
import type { StartPlace } from '../../domain/types';
import { bayAreaPlaces } from '../../services/mock/bayAreaPlaces';
import {
  LATEST_HOME_BY_MIN,
  MIN_DAY_WINDOW_MIN,
  clampDayWindow,
  MAX_OUTING_MINUTES,
  MAX_STOPS,
  MIN_STOPS,
  REASON_PREVALENCE_MAX,
  SUGGESTION_HISTORY_THRESHOLD,
  deriveStopCount,
  explainedFirst,
  suggestGapFillers,
  EXPLAINED_BONUS,
  suppressCommonReasons,
  distinctPlacesVisited,
  hasEnoughHistory,
  rankPlaces,
  suggestDay,
} from '../planner';
import { formatDayEnd, formatTime, haversineKm } from '../geo';
import { findOverdue, startOfWeek, summarizeWeek } from '../summary';
import { fitTransform, layoutWall, CARD_W } from '../wallLayout';
import { buildWallCards } from '../../domain/diary';

const DAY = 86_400_000;
/** A Wednesday, so week boundaries are visible in the assertions. */
const NOW = new Date('2026-07-29T12:00:00').getTime();

const powell: StartPlace = {
  id: 'lm-powell-station',
  name: 'Powell St Station',
  kind: 'station',
  location: { latitude: 37.7844, longitude: -122.4079 },
};

function visit(placeId: string, daysAgo: number, overrides: Partial<Visit> = {}): Visit {
  return {
    id: `v-${placeId}-${daysAgo}-${Math.random()}`,
    placeId,
    timestamp: NOW - daysAgo * DAY,
    wouldGoAgain: 'yes',
    ...overrides,
  };
}

describe('week boundaries', () => {
  it('starts the week on Monday at midnight', () => {
    const start = new Date(startOfWeek(NOW));
    expect(start.getDay()).toBe(1);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
  });

  it('treats a Sunday as belonging to the week that began six days earlier', () => {
    const sunday = new Date('2026-08-02T20:00:00').getTime();
    expect(startOfWeek(sunday)).toBe(startOfWeek(NOW));
  });
});

describe('weekly summary', () => {
  it('is empty and harmless for a diary with no visits', () => {
    const s = summarizeWeek(bayAreaPlaces, [], NOW);
    expect(s.visitCount).toBe(0);
    expect(s.placeCount).toBe(0);
    expect(s.districts).toEqual([]);
    expect(s.goAgain).toEqual([]);
    expect(s.overdue).toBeNull();
  });

  it('counts only visits inside the current week', () => {
    const visits = [
      visit('tartine-bakery', 1), // this week
      visit('golden-gate-bakery', 2), // this week
      visit('mission-dolores', 10), // last week
    ];
    const s = summarizeWeek(bayAreaPlaces, visits, NOW);
    expect(s.visitCount).toBe(2);
    expect(s.placeCount).toBe(2);
  });

  it('counts repeat visits to one place once in placeCount', () => {
    const visits = [visit('tartine-bakery', 0), visit('tartine-bakery', 1)];
    const s = summarizeWeek(bayAreaPlaces, visits, NOW);
    expect(s.visitCount).toBe(2);
    expect(s.placeCount).toBe(1);
  });

  it('flags a place as new only on the week it was first stamped', () => {
    const returning = [visit('tartine-bakery', 90), visit('tartine-bakery', 1)];
    expect(summarizeWeek(bayAreaPlaces, returning, NOW).newPlaceCount).toBe(0);

    const firstTime = [visit('tartine-bakery', 1)];
    expect(summarizeWeek(bayAreaPlaces, firstTime, NOW).newPlaceCount).toBe(1);
  });

  it('collects districts and ranks themes by frequency', () => {
    const visits = [
      visit('la-taqueria', 1), // Mission, food
      visit('el-farolito', 1), // Mission, food
      visit('mission-dolores', 2), // Castro & Haight, historical
    ];
    const s = summarizeWeek(bayAreaPlaces, visits, NOW);
    expect(s.districts.sort()).toEqual(['Castro & Haight', 'Mission']);
    expect(s.themes[0]).toEqual({ theme: 'food', count: 2 });
  });

  it('lists only would-go-again yes places as highlights', () => {
    const visits = [
      visit('tartine-bakery', 1, { wouldGoAgain: 'yes' }),
      visit('haight-ashbury', 1, { wouldGoAgain: 'no' }),
    ];
    const s = summarizeWeek(bayAreaPlaces, visits, NOW);
    expect(s.goAgain.map((p) => p.id)).toEqual(['tartine-bakery']);
  });

  it('counts photos attached to this week\'s visits', () => {
    const visits = [
      visit('tartine-bakery', 1, { photoUri: 'file:///a.jpg' }),
      visit('golden-gate-bakery', 1),
      visit('mission-dolores', 20, { photoUri: 'file:///old.jpg' }),
    ];
    expect(summarizeWeek(bayAreaPlaces, visits, NOW).photoCount).toBe(1);
  });
});

describe('overdue nudge', () => {
  it('surfaces a loved place not visited in a long time', () => {
    const visits = [visit('mission-dolores', 120, { wouldGoAgain: 'yes' })];
    const overdue = findOverdue(bayAreaPlaces, visits, NOW);
    expect(overdue?.place.id).toBe('mission-dolores');
    expect(overdue?.daysSince).toBe(120);
  });

  it('never nudges toward a place the user said no to', () => {
    const visits = [visit('haight-ashbury', 200, { wouldGoAgain: 'no' })];
    expect(findOverdue(bayAreaPlaces, visits, NOW)).toBeNull();
  });

  it('ignores places visited recently', () => {
    const visits = [visit('mission-dolores', 5, { wouldGoAgain: 'yes' })];
    expect(findOverdue(bayAreaPlaces, visits, NOW)).toBeNull();
  });

  it('picks the longest-neglected of several candidates', () => {
    const visits = [
      visit('mission-dolores', 70, { wouldGoAgain: 'yes' }),
      visit('golden-gate-bakery', 300, { wouldGoAgain: 'yes' }),
    ];
    expect(findOverdue(bayAreaPlaces, visits, NOW)?.place.id).toBe('golden-gate-bakery');
  });
});

describe('suggestion history gate', () => {
  it('counts distinct places, not stamps', () => {
    const visits = [
      visit('tartine-bakery', 1),
      visit('tartine-bakery', 5),
      visit('tartine-bakery', 9),
      visit('golden-gate-bakery', 2),
    ];
    expect(distinctPlacesVisited(visits)).toBe(2);
  });

  it('stays shut for an empty diary', () => {
    expect(hasEnoughHistory([])).toBe(false);
  });

  it('stays shut for one place stamped many times', () => {
    const visits = [1, 5, 9, 14, 20].map((d) => visit('tartine-bakery', d));
    expect(visits.length).toBeGreaterThan(SUGGESTION_HISTORY_THRESHOLD);
    expect(hasEnoughHistory(visits)).toBe(false);
  });

  it('stays shut one place short of the threshold', () => {
    const visits = ['tartine-bakery', 'golden-gate-bakery', 'mission-dolores'].map((id) =>
      visit(id, 3)
    );
    expect(visits).toHaveLength(SUGGESTION_HISTORY_THRESHOLD - 1);
    expect(hasEnoughHistory(visits)).toBe(false);
  });

  it('opens at four distinct places', () => {
    const visits = [
      'tartine-bakery',
      'golden-gate-bakery',
      'mission-dolores',
      'union-square',
    ].map((id) => visit(id, 3));
    expect(hasEnoughHistory(visits)).toBe(true);
  });
});

describe('thin planner ranking', () => {
  it('drops places too far from the anchor to belong in a local day', () => {
    // From 24th St in the Mission, Valencia St is a few blocks and the de
    // Young is across the whole city in Golden Gate Park — the same kind of
    // trip the anchor radius exists to rule out of a local day.
    const missionDistrict: StartPlace = {
      id: 'lm-24th-st-station',
      name: '24th St Mission Station',
      kind: 'station',
      location: { latitude: 37.7522, longitude: -122.4184 },
    };
    const ids = rankPlaces(bayAreaPlaces, [], missionDistrict, NOW).map(
      (r) => r.place.id
    );
    expect(ids).not.toContain('crissy-field'); // 7.2km, up by the bridge
    expect(ids).toContain('valencia-street'); // right there on the doorstep
  });

  /**
   * The Bay Area catalogue is regional and the anchor radius is not: from
   * Powell St the ranking reaches 92 of 439 places, about a fifth. That is
   * the intended behaviour rather than a shortfall — `MAX_ANCHOR_KM` is a
   * deliberate statement that a day out stays on one side of the Bay — so the
   * bound worth asserting is that a central anchor reaches most of *San
   * Francisco*, not most of the dataset.
   */
  it('keeps most of the city in range from a central anchor', () => {
    const inSf = (p: { location: { latitude: number; longitude: number } }) =>
      p.location.latitude > 37.7 &&
      p.location.latitude < 37.83 &&
      p.location.longitude < -122.35;
    const sfPlaces = bayAreaPlaces.filter(inSf);
    const ranked = rankPlaces(bayAreaPlaces, [], powell, NOW);
    expect(ranked.length).toBeGreaterThan(sfPlaces.length * 0.6);
    // And emphatically not the whole Bay: that would be a day of travelling.
    expect(ranked.length).toBeLessThan(bayAreaPlaces.length * 0.4);
  });

  it('ranks a loved, long-unvisited place above an equivalent unstamped one', () => {
    const visits = [
      visit('golden-gate-bakery', 90, { wouldGoAgain: 'yes' }),
      visit('golden-gate-bakery', 120, { wouldGoAgain: 'yes' }),
    ];
    const ranked = rankPlaces(bayAreaPlaces, visits, powell, NOW);
    const loved = ranked.findIndex((r) => r.place.id === 'golden-gate-bakery');
    const unstamped = ranked.findIndex((r) => r.place.id === 'el-farolito');
    expect(loved).toBeLessThan(unstamped);
  });

  it('pushes down somewhere visited yesterday', () => {
    const fresh = rankPlaces(
      bayAreaPlaces,
      [visit('golden-gate-bakery', 1, { wouldGoAgain: 'yes' })],
      powell,
      NOW
    );
    const cold = rankPlaces(bayAreaPlaces, [], powell, NOW);
    const freshRank = fresh.findIndex((r) => r.place.id === 'golden-gate-bakery');
    const coldRank = cold.findIndex((r) => r.place.id === 'golden-gate-bakery');
    expect(freshRank).toBeGreaterThan(coldRank);
  });

  it('demotes a place the user said no to', () => {
    const ranked = rankPlaces(
      bayAreaPlaces,
      [visit('golden-gate-bakery', 30, { wouldGoAgain: 'no' })],
      powell,
      NOW
    );
    const disliked = ranked.find((r) => r.place.id === 'golden-gate-bakery')!;
    const median = ranked[Math.floor(ranked.length / 2)];
    expect(disliked.score).toBeLessThan(median.score);
  });

  /**
   * §12.2 forbids feeding stored Google values to the optimizer, and the
   * premise of the product is that curation plus your own history beats a
   * crowd average. `CuratedPlace` has no rating or review-count field at all,
   * so the strongest statement available is that ranking an empty diary uses
   * only fields we own — and that the one editorial signal it would use is
   * absent from this dataset rather than quietly faked from a crowd score.
   */
  it('never consults Google fields — ranking survives on curation alone', () => {
    const ranked = rankPlaces(bayAreaPlaces, [], powell, NOW);
    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked[0].place).not.toHaveProperty('rating');
    expect(ranked[0].place).not.toHaveProperty('reviewCount');
  });

  /**
   * Every seed record carries `worthDetour: false`: an OSM import holds no
   * editorial judgment, and synthesising one from a rating is exactly what
   * §12.2 rules out. So the detour reason never fires on this dataset, and
   * that is the intended state rather than a broken code path — this pins
   * both halves, so a future dataset that does curate detours still works and
   * nobody is tempted to backfill the field from Google.
   */
  it('never claims a detour on a dataset that curates none', () => {
    expect(bayAreaPlaces.every((p) => !p.worthDetour)).toBe(true);
    const ranked = rankPlaces(bayAreaPlaces, [], powell, NOW);
    expect(ranked.every((r) => !r.reasons.includes('Worth a detour'))).toBe(true);

    // The mechanism itself is intact: curate one and it earns the reason.
    const curated = { ...ranked[0].place, worthDetour: true };
    const withOne = rankPlaces([curated], [], powell, NOW);
    expect(withOne[0].reasons).toContain('Worth a detour');
  });

  it('explains its suggestions when the diary gives it something to say', () => {
    // Was 'explains every suggestion it makes', asserted against a diary of
    // four recent visits. The product no longer promises that: a reason true
    // of every card on screen is now dropped even when it leaves the card
    // blank, because a line true of everything distinguishes nothing.
    //
    // What it still promises, and what this now checks, is that a diary with
    // something in it produces cards that say why.
    const visits = [
      visit('tartine-bakery', 60),
      visit('golden-gate-bakery', 80),
      visit('mission-dolores', 100),
      visit('union-square', 120),
    ];
    expect(hasEnoughHistory(visits)).toBe(true);
    for (const s of suggestDay(bayAreaPlaces, visits, powell, 4, NOW)) {
      expect(s.reasons.length).toBeGreaterThan(0);
    }
  });
});

describe('displayed reasons must discriminate', () => {
  /** Four places, all stamped within the last fortnight. */
  const recent = [
    visit('tartine-bakery', 3),
    visit('golden-gate-bakery', 7),
    visit('mission-dolores', 11),
    visit('union-square', 14),
  ];

  /**
   * Ten places, each in a different dense pocket of the city — proximity
   * reaches 26% of the 92 candidates here, just over the threshold.
   *
   * Hong Kong needed only eight to hit 34%, and the difference is the point:
   * San Francisco is sparser relative to the candidate pool, so the loved
   * places have to be chosen for non-overlapping neighbourhoods to push the
   * label over the line at all. The rule still bites; it just takes more
   * diary to trip it.
   */
  const tenSpread = [
    visit('good-mong-kok', 3),
    visit('valencia-street', 20),
    visit('el-farolito', 40),
    visit('banh-mi-crunch', 60),
    visit('akari-japanese-bistro', 12),
    visit('yank-sing', 30),
    visit('castro-theatre', 55),
    visit('cal-academy', 100),
    visit('union-square', 75),
    visit('sfmoma', 90),
  ];

  /**
   * Enough history that every reason kind appears at least once — which
   * needs one place stamped three times over, since `regular` only attaches
   * from the third visit.
   */
  const fourteenMixed = [
    ...tenSpread,
    visit('good-mong-kok', 25),
    visit('good-mong-kok', 50),
    visit('el-farolito', 110),
    visit('haight-ashbury', 75),
  ];

  const prevalence = (ranked: ReturnType<typeof rankPlaces>, text: string) =>
    ranked.filter((r) => r.reasons.includes(text)).length / ranked.length;

  /**
   * Suppression is a display rule, not a ranking one: it changes what a card
   * says, never what is offered. Shown here with "Somewhere new", which is
   * the over-common reason this dataset actually produces — Hong Kong made
   * the same point with "Worth a detour", which no Bay record carries.
   */
  it('leaves the ranking unsuppressed, so curation is still visible there', () => {
    const ranked = rankPlaces(bayAreaPlaces, recent, powell, NOW);
    expect(prevalence(ranked, 'Somewhere new')).toBeGreaterThan(
      REASON_PREVALENCE_MAX
    );
  });

  it('drops a reason true of most of the candidate set', () => {
    const shown = suppressCommonReasons(rankPlaces(bayAreaPlaces, [], powell, NOW));
    // An empty diary makes every candidate new, so "Somewhere new" is true of
    // all 92 in range — noise wearing the costume of an explanation.
    expect(shown.every((s) => !s.reasons.includes('Somewhere new'))).toBe(true);
  });

  it('keeps every surviving reason under the threshold', () => {
    const shown = suppressCommonReasons(rankPlaces(bayAreaPlaces, recent, powell, NOW));
    const counts = new Map<string, number>();
    for (const s of shown) {
      for (const r of s.reasons) counts.set(r, (counts.get(r) ?? 0) + 1);
    }
    for (const [, c] of counts) {
      expect(c / shown.length).toBeLessThanOrEqual(REASON_PREVALENCE_MAX);
    }
  });

  it('protects a reason about the user\'s record at this place, whatever its spread', () => {
    const ranked = rankPlaces(bayAreaPlaces, recent, powell, NOW);
    const shown = suppressCommonReasons(ranked);
    const survives = shown.flatMap((s) =>
      s.reasonDetail.filter((r) => r.aboutThisPlace)
    );
    const before = ranked.flatMap((s) =>
      s.reasonDetail.filter((r) => r.aboutThisPlace)
    );
    expect(survives).toHaveLength(before.length);
  });

  it('marks only the reasons that name this place as protected', () => {
    // The test that matters for the exemption: reading the diary is not the
    // same as saying something about the candidate. Proximity and district
    // read it and say nothing about the place they are attached to.
    const kinds = new Map<string, boolean>();
    for (const s of rankPlaces(bayAreaPlaces, fourteenMixed, powell, NOW)) {
      for (const r of s.reasonDetail) kinds.set(r.kind, r.aboutThisPlace);
    }
    expect(kinds.get('regular')).toBe(true);
    expect(kinds.get('overdue')).toBe(true);
    expect(kinds.get('nearLoved')).toBe(false);
    expect(kinds.get('district')).toBe(false);
  });

  it('suppresses proximity once it stops discriminating', () => {
    // Measured at 26% of candidates on this diary. It was exempt on the
    // grounds of coming from the diary, which is the hole this closes.
    const ranked = rankPlaces(bayAreaPlaces, tenSpread, powell, NOW);
    const before =
      ranked.filter((s) => s.reasons.includes('Near somewhere you liked')).length /
      ranked.length;
    expect(before).toBeGreaterThan(REASON_PREVALENCE_MAX);

    const shown = suppressCommonReasons(ranked);
    expect(
      shown.some((s) => s.reasons.includes('Near somewhere you liked'))
    ).toBe(false);
  });

  it('keeps proximity when it does discriminate', () => {
    // The rule is a threshold, not a ban. On a smaller diary the same label
    // is true of 15% of candidates and earns its place.
    const shown = suppressCommonReasons(rankPlaces(bayAreaPlaces, recent, powell, NOW));
    expect(
      shown.some((s) => s.reasons.includes('Near somewhere you liked'))
    ).toBe(true);
  });

  it('measures prevalence per reason kind, not per string', () => {
    // "Not since 2 months ago" and "Not since 4 months ago" are one reason.
    // Counting the strings apart would halve what the rule sees.
    const old = [
      visit('tartine-bakery', 60),
      visit('golden-gate-bakery', 80),
      visit('mission-dolores', 100),
      visit('union-square', 120),
    ];
    const texts = new Set(
      rankPlaces(bayAreaPlaces, old, powell, NOW)
        .flatMap((s) => s.reasonDetail)
        .filter((r) => r.kind === 'overdue')
        .map((r) => r.text)
    );
    expect(texts.size).toBeGreaterThan(1);
  });

  it('puts an explainable candidate above one with nothing left to say', () => {
    // Checked before the on-screen rule runs, since that rule can strip a
    // card the ordering legitimately promoted. What is asserted is the
    // ordering: everything the ranking could explain sits above everything
    // it could not.
    const shown = suppressCommonReasons(rankPlaces(bayAreaPlaces, recent, powell, NOW));
    const ordered = [...shown].sort(
      (a, b) =>
        (b.reasons.length > 0 ? 1 : 0) - (a.reasons.length > 0 ? 1 : 0) ||
        b.score - a.score
    );
    const lastExplained = ordered.findIndex((s) => s.reasons.length === 0);
    expect(lastExplained).toBeGreaterThan(0);
    expect(ordered.slice(0, lastExplained).every((s) => s.reasons.length > 0)).toBe(
      true
    );
  });

  it('never prints the same reason on every card', () => {
    // The failure this rule exists for: five cards reading "Near somewhere
    // you liked · A district you keep returning to", word for word. The
    // prevalence threshold passed them both — proximity is true of 15% of
    // the 53 candidates — but on screen they were true of five out of five.
    const day = suggestDay(bayAreaPlaces, recent, powell, 5, NOW);
    expect(day.length).toBeGreaterThan(1);
    const texts = new Set(day.flatMap((s) => s.reasons));
    for (const text of texts) {
      expect(day.every((s) => s.reasons.includes(text))).toBe(false);
    }
  });

  it('keeps reasons of the same kind when they say different things', () => {
    // Four overdue places, each naming a different gap, tell each other
    // apart. Prevalence treats them as one reason on purpose; the on-screen
    // rule must not, or a day of revisits comes back blank.
    const old = [
      visit('tartine-bakery', 60),
      visit('golden-gate-bakery', 80),
      visit('mission-dolores', 100),
      visit('union-square', 120),
    ];
    const day = suggestDay(bayAreaPlaces, old, powell, 5, NOW);
    expect(day.filter((s) => s.reasons.length > 0).length).toBeGreaterThan(1);
  });

  /**
   * The bonus settles near-ties and nothing more. Asserted against
   * `explainedFirst` directly rather than through a dataset fixture, because
   * on this dataset the case cannot be built: an explained candidate is
   * almost always one the diary has lifted with would-go-again, frequency and
   * overdue boosts at once, so it leads on raw score by 5 or more and no
   * bonus is doing the work. Hong Kong could stage the comparison on a denser
   * catalogue; here it would be a test of San Francisco's geography.
   *
   * What must hold either way is that the bonus is bounded — an unexplained
   * candidate ahead by more than `EXPLAINED_BONUS` keeps its place. When this
   * was an absolute sort key it did not, and explainability quietly outranked
   * preferences the user had set explicitly.
   */
  it('lets a decisive score beat explainability rather than always losing to it', () => {
    const place = bayAreaPlaces[0];
    const blank = {
      place,
      score: 10,
      reasons: [] as string[],
      reasonDetail: [],
    };
    const explained = {
      place: bayAreaPlaces[1],
      score: 10 - EXPLAINED_BONUS - 0.5,
      reasons: ['A regular of yours'],
      reasonDetail: [
        { kind: 'regular' as const, text: 'A regular of yours', aboutThisPlace: true },
      ],
    };
    expect(explainedFirst([explained, blank])[0]).toBe(blank);

    // And inside the bonus, explainability is what settles it.
    const nearTie = { ...explained, score: 10 - EXPLAINED_BONUS + 0.5 };
    expect(explainedFirst([blank, nearTie])[0]).toBe(nearTie);
  });

  it('earns a reason from proximity to somewhere the user liked', () => {
    const shown = suppressCommonReasons(rankPlaces(bayAreaPlaces, recent, powell, NOW));
    expect(
      shown.some((s) => s.reasons.includes('Near somewhere you liked'))
    ).toBe(true);
  });

  it('says nothing about a district visited only once', () => {
    const oneEach = [
      visit('tartine-bakery', 5), // Mission
      visit('mission-dolores', 6), // Castro & Haight
      visit('union-square', 7), // Downtown & SoMa
      visit('de-young-museum', 8), // The Avenues
    ];
    const ranked = rankPlaces(bayAreaPlaces, oneEach, powell, NOW);
    expect(
      ranked.some((s) => s.reasons.includes('A district you keep returning to'))
    ).toBe(false);
  });
});

describe('a day that runs past midnight', () => {
  it('says so, rather than reading as the wrong day', () => {
    // 24:16 rendered as "0:16" is a quarter past midnight this morning —
    // sixteen hours before the day it belongs to. Observed on a real plan.
    expect(formatTime(24 * 60 + 16)).toBe('0:16');
    expect(formatDayEnd(24 * 60 + 16)).toBe('0:16 next day');
  });

  it('leaves a time inside the day alone', () => {
    expect(formatDayEnd(21 * 60)).toBe('21:00');
    expect(formatDayEnd(LATEST_HOME_BY_MIN)).toBe('23:59');
  });

  it('treats midnight itself as the next day', () => {
    expect(formatDayEnd(24 * 60)).toBe('0:00 next day');
  });
});

describe('the latest a day may end', () => {
  it('never reaches midnight, because formatTime wraps there', () => {
    expect(LATEST_HOME_BY_MIN).toBeLessThan(24 * 60);
    expect(formatTime(LATEST_HOME_BY_MIN)).toBe('23:59');
    expect(formatTime(24 * 60)).toBe('0:00'); // what it used to render as
  });

  it('still covers effectively the whole day for sizing', () => {
    const ranked = rankPlaces(bayAreaPlaces, [], powell, NOW);
    const toMidnight = deriveStopCount(ranked, {
      dayStartMin: 9 * 60,
      homeByMin: 24 * 60,
    });
    const toLatest = deriveStopCount(ranked, {
      dayStartMin: 9 * 60,
      homeByMin: LATEST_HOME_BY_MIN,
    });
    expect(toLatest).toBe(toMidnight);
  });
});

describe('setting the day window', () => {
  it('allows the whole 24 hours', () => {
    expect(clampDayWindow({ dayStartMin: 0, homeByMin: LATEST_HOME_BY_MIN })).toEqual({
      dayStartMin: 0,
      homeByMin: LATEST_HOME_BY_MIN,
    });
  });

  it('leaves an ordinary window alone', () => {
    const w = { dayStartMin: 10 * 60, homeByMin: 18 * 60 };
    expect(clampDayWindow(w)).toEqual(w);
  });

  it('never lets the day end past 23:59', () => {
    expect(
      clampDayWindow({ dayStartMin: 9 * 60, homeByMin: 24 * 60 }).homeByMin
    ).toBe(LATEST_HOME_BY_MIN);
    expect(
      clampDayWindow({ dayStartMin: 9 * 60, homeByMin: 30 * 60 }).homeByMin
    ).toBe(LATEST_HOME_BY_MIN);
  });

  it('never lets the day start before midnight of the same day', () => {
    expect(clampDayWindow({ dayStartMin: -120, homeByMin: 18 * 60 }).dayStartMin).toBe(0);
  });

  it('refuses a window that ends before it starts', () => {
    const w = clampDayWindow({ dayStartMin: 18 * 60, homeByMin: 9 * 60 });
    expect(w.homeByMin).toBeGreaterThan(w.dayStartMin);
  });

  it('keeps at least the minimum window when the end is dragged down', () => {
    const w = clampDayWindow({ dayStartMin: 12 * 60, homeByMin: 12 * 60 + 5 });
    expect(w.homeByMin - w.dayStartMin).toBe(MIN_DAY_WINDOW_MIN);
  });

  it('pushes the end along when the start is dragged up against it', () => {
    const w = clampDayWindow({ dayStartMin: 23 * 60 + 50, homeByMin: 23 * 60 + 55 });
    expect(w.homeByMin).toBe(LATEST_HOME_BY_MIN);
    expect(w.homeByMin - w.dayStartMin).toBeGreaterThanOrEqual(MIN_DAY_WINDOW_MIN);
  });

  it('never produces a window crossing midnight', () => {
    for (let start = 0; start < 24 * 60; start += 37) {
      for (const end of [0, start - 60, start, start + 5, 24 * 60, 40 * 60]) {
        const w = clampDayWindow({ dayStartMin: start, homeByMin: end });
        expect(w.dayStartMin).toBeGreaterThanOrEqual(0);
        expect(w.homeByMin).toBeLessThanOrEqual(LATEST_HOME_BY_MIN);
        expect(w.homeByMin).toBeGreaterThan(w.dayStartMin);
      }
    }
  });

  it('changes the day it derives', () => {
    const ranked = rankPlaces(bayAreaPlaces, [], powell, NOW);
    const wide = clampDayWindow({ dayStartMin: 0, homeByMin: 24 * 60 });
    const narrow = clampDayWindow({ dayStartMin: 9 * 60, homeByMin: 12 * 60 });
    expect(deriveStopCount(ranked, narrow)).toBeLessThan(
      deriveStopCount(ranked, wide)
    );
  });
});

describe('suggestion bias', () => {
  /** Ten places, all aged past the revisit window so revisits are live. */
  const tenAged = bayAreaPlaces
    .slice(0, 10)
    .flatMap((p, i) => [visit(p.id, 50 + i * 3), visit(p.id, 90 + i * 3)]);
  const stampedIds = new Set(tenAged.map((v) => v.placeId));
  const window = { dayStartMin: 9 * 60, homeByMin: 18 * 60 };

  const stampedCount = (bias: 'familiar' | 'new') =>
    suggestDay(bayAreaPlaces, tenAged, powell, window, NOW, bias).filter((s) =>
      stampedIds.has(s.place.id)
    ).length;

  it('leads with places the user knows by default', () => {
    expect(stampedCount('familiar')).toBeGreaterThan(stampedCount('new'));
  });

  it('is the ranking as it always was, so the default changes nothing', () => {
    const withDefault = suggestDay(bayAreaPlaces, tenAged, powell, window, NOW).map(
      (s) => s.place.id
    );
    const explicit = suggestDay(
      bayAreaPlaces,
      tenAged,
      powell,
      window,
      NOW,
      'familiar'
    ).map((s) => s.place.id);
    expect(withDefault).toEqual(explicit);
  });

  it('biases rather than filters, so neither mode excludes the other kind', () => {
    // The memory wall stops growing if a day can only hold favourites, and a
    // diary the user cannot revisit is just a list of strangers.
    const familiar = suggestDay(bayAreaPlaces, tenAged, powell, window, NOW, 'familiar');
    const fresh = suggestDay(bayAreaPlaces, tenAged, powell, window, NOW, 'new');
    expect(fresh.some((s) => !stampedIds.has(s.place.id))).toBe(true);
    expect(familiar.some((s) => stampedIds.has(s.place.id))).toBe(true);
  });
});

describe('suggesting only what is open while the user is out', () => {
  const diary = [
    visit('tartine-bakery', 3),
    visit('golden-gate-bakery', 7),
    visit('mission-dolores', 11),
    visit('union-square', 14),
  ];
  /** Opens at 17:00 — unreachable before mid-afternoon. */
  const lateOpening = bayAreaPlaces.find((p) => p.id === 'house-of-prime-rib')!;

  it('never suggests somewhere that opens after the day ends', () => {
    expect(lateOpening.openHours!.open).toBeGreaterThan(14 * 60);
    const morning = suggestDay(
      bayAreaPlaces,
      diary,
      powell,
      { dayStartMin: 9 * 60, homeByMin: 14 * 60 },
      NOW
    );
    expect(morning.some((s) => s.place.id === lateOpening.id)).toBe(false);
  });

  it('suggests nowhere shut for the whole window, whatever its score', () => {
    const morning = suggestDay(
      bayAreaPlaces,
      diary,
      powell,
      { dayStartMin: 9 * 60, homeByMin: 14 * 60 },
      NOW
    );
    for (const s of morning) {
      if (!s.place.openHours) continue;
      expect(s.place.openHours.open).toBeLessThan(14 * 60);
      expect(s.place.openHours.close).toBeGreaterThan(9 * 60);
    }
  });

  it('ranks a late opener higher for an evening than for a morning', () => {
    // The penalty has to work in both directions, or it is just a filter.
    const at = (dayStartMin: number, homeByMin: number) =>
      rankPlaces(bayAreaPlaces, diary, powell, NOW, 'familiar', {
        dayStartMin,
        homeByMin,
      }).findIndex((s) => s.place.id === lateOpening.id);

    const evening = at(17 * 60, LATEST_HOME_BY_MIN);
    const wholeDay = at(9 * 60, LATEST_HOME_BY_MIN);
    expect(evening).toBeGreaterThanOrEqual(0);
    expect(evening).toBeLessThan(wholeDay);
  });

  it('leaves the ranking alone when no window is given', () => {
    // rankPlaces is called without a window by the tests that predate this
    // and by anything asking "what is good near here", which is a question
    // about places rather than about a day.
    const ranked = rankPlaces(bayAreaPlaces, diary, powell, NOW);
    expect(ranked.some((s) => s.place.id === lateOpening.id)).toBe(true);
  });
});

describe('recency penalty', () => {
  it('does not suggest going straight back to somewhere from last week', () => {
    // The old penalty switched off after three days, so a place stamped a
    // fortnight ago kept its would-go-again and frequency boosts unopposed
    // and outranked everywhere unvisited.
    const visits = [
      visit('tartine-bakery', 3),
      visit('golden-gate-bakery', 7),
      visit('mission-dolores', 11),
      visit('union-square', 14),
    ];
    const day = suggestDay(bayAreaPlaces, visits, powell, 4, NOW);
    const stamped = new Set(visits.map((v) => v.placeId));
    expect(day.every((s) => !stamped.has(s.place.id))).toBe(true);
  });

  it('tapers rather than switching off, so nearer visits are pushed down further', () => {
    const rankOf = (daysAgo: number) =>
      rankPlaces(
        bayAreaPlaces,
        [visit('golden-gate-bakery', daysAgo, { wouldGoAgain: 'yes' })],
        powell,
        NOW
      ).find((r) => r.place.id === 'golden-gate-bakery')!.score;

    expect(rankOf(2)).toBeLessThan(rankOf(20));
    expect(rankOf(20)).toBeLessThan(rankOf(40));
  });

  it('still lifts a loved place once it is past the revisit window', () => {
    const ranked = rankPlaces(
      bayAreaPlaces,
      [visit('golden-gate-bakery', 90, { wouldGoAgain: 'yes' })],
      powell,
      NOW
    );
    const revisit = ranked.find((r) => r.place.id === 'golden-gate-bakery')!;
    expect(revisit.reasons).toContain('Not since 3 months ago');
  });
});

describe('stop count derived from the day window', () => {
  const ranked = () => rankPlaces(bayAreaPlaces, [], powell, NOW);
  const at = (dayStartMin: number, homeByMin: number) =>
    deriveStopCount(ranked(), { dayStartMin, homeByMin });

  it('gives a short afternoon fewer stops than a full day', () => {
    expect(at(12 * 60, 15 * 60)).toBeLessThan(at(9 * 60, 24 * 60));
  });

  it('never derives fewer than two, however short the window', () => {
    expect(at(9 * 60, 9 * 60 + 20)).toBe(MIN_STOPS);
    expect(at(9 * 60, 9 * 60)).toBe(MIN_STOPS);
  });

  it('never derives more than the cap, however long the window', () => {
    expect(at(0, 24 * 60)).toBeLessThanOrEqual(MAX_STOPS);
  });

  it('never offers more than five places unasked', () => {
    // A product limit on what the planner hands over uninvited, and the
    // binding one at the top of the range. It does not apply to a day the
    // user builds themselves — a selection is never trimmed (§3.3.0).
    expect(MAX_STOPS).toBe(5);
    expect(at(0, 24 * 60)).toBe(MAX_STOPS);
    expect(suggestDay(bayAreaPlaces, [], powell, { dayStartMin: 0, homeByMin: 24 * 60 }, NOW))
      .toHaveLength(MAX_STOPS);
  });

  it('stops growing once the window passes the longest outing', () => {
    // Both windows hold more time than anyone spends out, so both should
    // size the same day. The extra three hours buy nothing.
    expect(at(9 * 60, 24 * 60)).toBe(at(9 * 60, 21 * 60));
  });

  it('sizes a day no longer than the scope in §3.3', () => {
    const ranked = rankPlaces(bayAreaPlaces, [], powell, NOW);
    const stops = deriveStopCount(ranked, { dayStartMin: 0, homeByMin: 24 * 60 });
    const sample = ranked.slice(0, MAX_STOPS).map((s) => s.place);
    const dwell =
      sample.reduce((sum, p) => sum + p.visitDurationMin, 0) / sample.length;
    // Dwell alone, before any travel, must already fit inside the ceiling.
    expect(stops * dwell).toBeLessThanOrEqual(MAX_OUTING_MINUTES);
  });

  it('still shortens the day when the window is the tighter limit', () => {
    // Below the cap the time model governs, so a narrower window must still
    // produce a shorter day. It varies across roughly four to seven hours;
    // outside that band the floor and the cap take over.
    expect(at(9 * 60, 13 * 60)).toBeLessThan(at(9 * 60, 14 * 60));
    expect(at(9 * 60, 14 * 60)).toBeLessThan(at(9 * 60, 16 * 60));
  });

  it('counts open hours, not clock hours', () => {
    // Four windows of identical length at different times of day. If the
    // derivation were dividing clock minutes they would all be equal.
    const dawn = at(5 * 60, 12 * 60);
    const earlyMorning = at(6 * 60, 13 * 60);
    const midday = at(9 * 60, 16 * 60);
    const evening = at(17 * 60, LATEST_HOME_BY_MIN);
    expect(dawn).toBeLessThan(earlyMorning);
    expect(earlyMorning).toBeLessThan(midday);
    // Dawn and evening both floor at MIN_STOPS here, so they cannot be
    // ordered against each other — San Francisco is shut at both ends of
    // this range, where Hong Kong's evening still had somewhere to go.
    expect(evening).toBeLessThan(midday);
  });

  it('derives nothing from an empty candidate set', () => {
    expect(deriveStopCount([], { dayStartMin: 9 * 60, homeByMin: 24 * 60 })).toBe(0);
  });

  it('is what suggestDay uses when handed a window', () => {
    const window = { dayStartMin: 10 * 60, homeByMin: 18 * 60 };
    const day = suggestDay(bayAreaPlaces, [], powell, window, NOW);
    expect(day).toHaveLength(deriveStopCount(ranked(), window));
  });

  it('still honours an explicit count, which is what the tests pass', () => {
    expect(suggestDay(bayAreaPlaces, [], powell, 3, NOW)).toHaveLength(3);
  });
});

describe('suggestDay', () => {
  it('returns the requested number of places', () => {
    expect(suggestDay(bayAreaPlaces, [], powell, 4, NOW)).toHaveLength(4);
  });

  it('does not build a day out of five of the same theme', () => {
    const day = suggestDay(bayAreaPlaces, [], powell, 4, NOW);
    const counts = new Map<string, number>();
    for (const s of day) {
      const t = s.place.themes[0];
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    for (const n of counts.values()) expect(n).toBeLessThanOrEqual(2);
  });

  it('is deterministic for the same diary', () => {
    const a = suggestDay(bayAreaPlaces, [], powell, 4, NOW).map((s) => s.place.id);
    const b = suggestDay(bayAreaPlaces, [], powell, 4, NOW).map((s) => s.place.id);
    expect(a).toEqual(b);
  });
});

describe('wall layout', () => {
  const cards = (ids: [string, number][]) =>
    buildWallCards(
      bayAreaPlaces,
      ids.map(([id, days]) => visit(id, days)),
      NOW
    );

  it('is empty for an empty diary', () => {
    const layout = layoutWall([]);
    expect(layout.cards).toEqual([]);
    expect(layout.width).toBe(0);
  });

  it('groups cards by district', () => {
    const layout = layoutWall(
      cards([
        ['la-taqueria', 1], // Mission
        ['el-farolito', 2], // Mission
        ['mission-dolores', 3], // Castro & Haight
      ])
    );
    expect(layout.clusters.map((c) => c.district)).toEqual([
      'Mission',
      'Castro & Haight',
    ]);
  });

  it('gives every card a distinct position', () => {
    const layout = layoutWall(
      cards([
        ['union-square', 1],
        ['golden-gate-bakery', 2],
        ['tartine-bakery', 3],
        ['mission-dolores', 4],
      ])
    );
    const keys = layout.cards.map((c) => `${c.x},${c.y}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('keeps a card tilted but only slightly, and always the same way', () => {
    const first = layoutWall(cards([['tartine-bakery', 1]])).cards[0];
    const second = layoutWall(cards([['tartine-bakery', 1]])).cards[0];
    expect(first.tilt).toBe(second.tilt);
    expect(Math.abs(first.tilt)).toBeLessThanOrEqual(3.5);
  });

  it('fit never zooms past 1:1 for a nearly empty board', () => {
    const layout = layoutWall(cards([['tartine-bakery', 1]]));
    const t = fitTransform(layout, { width: 390, height: 700 });
    expect(t.scale).toBeLessThanOrEqual(1);
    expect(t.scale).toBeGreaterThan(0);
  });

  it('fit shrinks a large board to fit the viewport', () => {
    const many = bayAreaPlaces.slice(0, 20).map((p, i) => [p.id, i + 1] as [string, number]);
    const layout = layoutWall(cards(many));
    const viewport = { width: 390, height: 700 };
    const t = fitTransform(layout, viewport);
    expect(layout.width * t.scale).toBeLessThanOrEqual(viewport.width);
    expect(layout.height * t.scale).toBeLessThanOrEqual(viewport.height);
  });

  it('centers the board within the viewport', () => {
    const layout = layoutWall(cards([['tartine-bakery', 1]]));
    const viewport = { width: 390, height: 700 };
    const t = fitTransform(layout, viewport);
    const right = t.translateX + layout.width * t.scale;
    expect(Math.round(t.translateX)).toBe(Math.round(viewport.width - right));
  });

  it('sizes a cluster wide enough for its cards', () => {
    // Both in the Mission, so they land in one cluster.
    const layout = layoutWall(
      cards([
        ['la-taqueria', 1],
        ['el-farolito', 2],
      ])
    );
    expect(layout.clusters[0].width).toBeGreaterThanOrEqual(CARD_W * 2);
  });
});

// ——— Gap fillers ——————————————————————————————————————————————————

describe('filling the gap in a day', () => {
  const place = (id: string) => bayAreaPlaces.find((p) => p.id === id)!;
  /** Morning bakery to evening bar — the day the strip exists for. */
  const bakery = place('golden-gate-bakery');
  const bar = place('zeitgeist');
  const gap = {
    fromMin: 9 * 60 + 25,
    toMin: 17 * 60,
    fromLocation: bakery.location,
    toLocation: bar.location,
  };
  const pool = bayAreaPlaces.filter((p) => p !== bakery && p !== bar);

  /**
   * The gate on the empty Plan tab needs four distinct places stamped. This
   * one deliberately does not: the hours and the corridor do the
   * constraining a diary would otherwise have to, and a first-time user with
   * seven empty hours is who it helps most.
   */
  it('suggests without any diary at all', () => {
    const fillers = suggestGapFillers(pool, [], powell, gap, NOW);
    expect(fillers.length).toBeGreaterThan(0);
  });

  it('offers only places open through the gap', () => {
    for (const f of suggestGapFillers(pool, [], powell, gap, NOW)) {
      if (!f.place.openHours) continue;
      expect(f.place.openHours.open).toBeLessThan(gap.toMin);
      expect(f.place.openHours.close).toBeGreaterThan(gap.fromMin);
    }
  });

  it('offers only visits that fit the time free', () => {
    for (const f of suggestGapFillers(pool, [], powell, gap, NOW)) {
      expect(f.place.visitDurationMin).toBeLessThanOrEqual(gap.toMin - gap.fromMin);
    }
  });

  it('offers nothing for a gap too short to spend', () => {
    const brief = { ...gap, toMin: gap.fromMin + 20 };
    expect(suggestGapFillers(pool, [], powell, brief, NOW)).toEqual([]);
  });

  it('never offers a place already in the day', () => {
    const fillers = suggestGapFillers(pool, [], powell, gap, NOW);
    expect(fillers.map((f) => f.place.id)).not.toContain(bakery.id);
    expect(fillers.map((f) => f.place.id)).not.toContain(bar.id);
  });

  /**
   * A detour, not a radius. Somewhere back past the anchor is nearer the
   * start place than the corridor and is still the wrong answer.
   */
  it('keeps to the corridor between the two ends', () => {
    const fillers = suggestGapFillers(pool, [], powell, gap, NOW);
    const direct = haversineKm(gap.fromLocation, gap.toLocation);
    for (const f of fillers) {
      const detour =
        haversineKm(gap.fromLocation, f.place.location) +
        haversineKm(f.place.location, gap.toLocation) -
        direct;
      expect(detour).toBeLessThanOrEqual(1.2);
    }
  });

  it('reads the diary when there is one, without needing it', () => {
    const loved = place('union-square');
    const visits = [visit('union-square', 90), visit('union-square', 120)];
    const withDiary = suggestGapFillers(pool, visits, powell, gap, NOW);
    expect(withDiary.map((f) => f.place.id)).toContain(loved.id);
  });
});
