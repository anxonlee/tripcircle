import { LATEST_HOME_BY_MIN } from '../planner';
import {
  DATASET_CITY,
  decodeDayLink,
  encodeDayLink,
  SHAREABLE_GOALS,
  TRIP_LINK_VERSION,
  unresolvedCount,
  type SharedDay,
} from '../tripLink';

/**
 * A link crosses between two phones running two builds, through a chat client
 * that feels free to edit it. These pin what must survive that trip, and what
 * must never make it in.
 */

const KNOWN = new Set([
  'ferry-building',
  'union-square',
  'dolores-park',
  'caffe-trieste',
  'golden-gate-park',
]);

const day = (over: Partial<SharedDay> = {}): SharedDay => ({
  city: DATASET_CITY,
  placeIds: ['ferry-building', 'union-square', 'dolores-park'],
  window: { dayStartMin: 540, homeByMin: 1200 },
  goal: 'balanced',
  ...over,
});

describe('encodeDayLink', () => {
  it('round-trips a day unchanged', () => {
    const result = decodeDayLink(encodeDayLink(day()), KNOWN);
    expect(result).toEqual({ ok: true, day: day() });
  });

  it('keeps the order, because the order is the plan', () => {
    const reversed = day({ placeIds: ['dolores-park', 'union-square', 'ferry-building'] });
    const result = decodeDayLink(encodeDayLink(reversed), KNOWN);
    expect(result.ok && result.day.placeIds).toEqual([
      'dolores-park',
      'union-square',
      'ferry-building',
    ]);
  });

  it('has nowhere to put a start place', () => {
    // The guarantee is structural, not a filter that could be forgotten:
    // there is no field, so there is nothing to leak. If someone adds one,
    // this fails and they have to come and read §3.1.
    const link = encodeDayLink(day());
    expect(Object.keys(day())).toEqual(['city', 'placeIds', 'window', 'goal']);
    expect(link).not.toMatch(/lat|lng|start|home[^-]|coord/i);
  });

  it('carries no coordinates at all', () => {
    expect(encodeDayLink(day())).not.toMatch(/\d+\.\d+/);
  });

  it('refuses to smuggle an id that is not a slug', () => {
    const dirty = day({ placeIds: ['ferry-building', 'evil&v=99', 'union-square'] });
    expect(encodeDayLink(dirty)).toBe(
      `pirtsf://d?v=1&c=sf&w=540-1200&g=balanced&p=ferry-building,union-square`
    );
  });

  it('clamps a window that could not have been planned', () => {
    const link = encodeDayLink(day({ window: { dayStartMin: 900, homeByMin: 60 } }));
    const result = decodeDayLink(link, KNOWN);
    expect(result.ok && result.day.window.homeByMin).toBeGreaterThan(
      result.ok ? result.day.window.dayStartMin : 0
    );
  });

  it.each(SHAREABLE_GOALS)('round-trips the %s objective', (goal) => {
    const result = decodeDayLink(encodeDayLink(day({ goal })), KNOWN);
    expect(result.ok && result.day.goal).toBe(goal);
  });
});

describe('decodeDayLink', () => {
  it('ignores anything that is not one of our links', () => {
    for (const url of [
      'https://example.com/d?v=1&c=sf&p=union-square',
      'pirtsf://stamp?placeId=union-square',
      'pirtsf://d',
      '',
      'not a url',
    ]) {
      expect(decodeDayLink(url, KNOWN)).toEqual({
        ok: false,
        reason: { kind: 'notADayLink' },
      });
    }
  });

  it('survives the punctuation a chat client staples on', () => {
    const link = encodeDayLink(day());
    for (const tail of [')', '.', ',', ']', ').']) {
      const result = decodeDayLink(link + tail, KNOWN);
      expect(result.ok && result.day.placeIds).toEqual(day().placeIds);
    }
  });

  it('says so rather than guessing when the link is from a newer build', () => {
    const link = `pirtsf://d?v=${TRIP_LINK_VERSION + 1}&c=sf&w=540-1200&g=balanced&p=union-square`;
    expect(decodeDayLink(link, KNOWN)).toEqual({
      ok: false,
      reason: { kind: 'tooNew', version: TRIP_LINK_VERSION + 1 },
    });
  });

  it('names the city rather than opening an empty day', () => {
    // The Hong Kong build shares the id vocabulary's shape but not its words.
    const link = 'pirtsf://d?v=1&c=hk&w=540-1200&g=balanced&p=tai-kwun';
    expect(decodeDayLink(link, KNOWN)).toEqual({
      ok: false,
      reason: { kind: 'otherCity', city: 'hk' },
    });
  });

  it('drops stops this build does not carry, keeping the rest', () => {
    const link = 'pirtsf://d?v=1&c=sf&w=540-1200&g=fastest&p=ferry-building,ghost-bar,union-square';
    const result = decodeDayLink(link, KNOWN);
    expect(result.ok && result.day.placeIds).toEqual(['ferry-building', 'union-square']);
  });

  it('reports an empty day rather than adopting nothing', () => {
    const link = 'pirtsf://d?v=1&c=sf&w=540-1200&g=fastest&p=ghost-bar,other-ghost';
    expect(decodeDayLink(link, KNOWN)).toEqual({
      ok: false,
      reason: { kind: 'empty' },
    });
  });

  it('collapses a place repeated in one day', () => {
    const link = 'pirtsf://d?v=1&c=sf&w=540-1200&g=balanced&p=union-square,ferry-building,union-square';
    const result = decodeDayLink(link, KNOWN);
    expect(result.ok && result.day.placeIds).toEqual(['union-square', 'ferry-building']);
  });

  it('falls back to a real day rather than midnight when the window is missing', () => {
    // Number('') is 0, so the naive read starts the day at 00:00 — a value
    // that looks deliberate and is not.
    const result = decodeDayLink('pirtsf://d?v=1&c=sf&g=balanced&p=union-square', KNOWN);
    expect(result.ok && result.day.window).toEqual({
      dayStartMin: 9 * 60,
      homeByMin: LATEST_HOME_BY_MIN,
    });
  });

  it('falls back on a half-written window too', () => {
    const result = decodeDayLink('pirtsf://d?v=1&c=sf&w=600-&g=balanced&p=union-square', KNOWN);
    expect(result.ok && result.day.window).toEqual({
      dayStartMin: 600,
      homeByMin: LATEST_HOME_BY_MIN,
    });
  });

  it('falls back on an objective this build does not have', () => {
    const result = decodeDayLink(
      'pirtsf://d?v=1&c=sf&w=540-1200&g=scenic&p=union-square',
      KNOWN
    );
    expect(result.ok && result.day.goal).toBe('balanced');
  });

  it('cannot have a key appended to overwrite an earlier one', () => {
    // The appended city is a different one on purpose: if the later key won,
    // this would decode as an other-city refusal instead of a day.
    const link =
      'pirtsf://d?v=1&c=sf&w=540-1200&g=balanced&p=union-square&c=hk&p=ferry-building';
    const result = decodeDayLink(link, KNOWN);
    expect(result.ok && result.day.placeIds).toEqual(['union-square']);
  });

  it('ignores keys a future build might add', () => {
    const link = 'pirtsf://d?v=1&c=sf&w=540-1200&g=balanced&p=union-square&note=hello';
    expect(decodeDayLink(link, KNOWN).ok).toBe(true);
  });
});

describe('unresolvedCount', () => {
  it('counts what the recipient is missing', () => {
    const link = 'pirtsf://d?v=1&c=sf&w=540-1200&g=fastest&p=ferry-building,ghost,other-ghost';
    expect(unresolvedCount(link, KNOWN)).toBe(2);
  });

  it('counts a repeated missing place once', () => {
    const link = 'pirtsf://d?v=1&c=sf&w=540-1200&g=fastest&p=ghost,ghost';
    expect(unresolvedCount(link, KNOWN)).toBe(1);
  });

  it('is zero for a day that fully resolves', () => {
    expect(unresolvedCount(encodeDayLink(day()), KNOWN)).toBe(0);
  });
});

describe('pinned times', () => {
  const ok = (url: string) => {
    const r = decodeDayLink(url, KNOWN);
    if (!r.ok) throw new Error(`expected a day, got ${r.reason.kind}`);
    return r.day;
  };

  it('carries a time the sender fixed', () => {
    const url = encodeDayLink(day({ pinnedTimes: { 'union-square': 780 } }));
    expect(url).toContain('t=union-square:780');
    expect(ok(url).pinnedTimes).toEqual({ 'union-square': 780 });
  });

  it('says nothing at all when nothing is pinned', () => {
    // The commonest day. A trailing `t=` would be noise in every link sent.
    const url = encodeDayLink(day());
    expect(url).not.toContain('t=');
    expect(ok(url).pinnedTimes).toBeUndefined();
  });

  it('leaves the older keys where they were', () => {
    // Builds already in TestFlight read those five by name. This is the whole
    // reason the version does not move.
    const url = encodeDayLink(day({ pinnedTimes: { 'union-square': 780 } }));
    expect(url).toContain(`v=${TRIP_LINK_VERSION}`);
    expect(url).toContain(`c=${DATASET_CITY}`);
    expect(url).toContain('w=540-1200');
    expect(url).toContain('g=balanced');
    expect(url).toContain('p=ferry-building,union-square,dolores-park');
  });

  it('an older build reading it still gets the day', () => {
    // What a build with no `t` handling does: reads the five keys it knows
    // and ignores the sixth. Simulated by decoding a link with the key
    // stripped, which must produce the same day minus the times.
    const url = encodeDayLink(day({ pinnedTimes: { 'union-square': 780 } }));
    const stripped = url.replace(/&t=[^&]*/, '');
    expect(ok(stripped).placeIds).toEqual(ok(url).placeIds);
    expect(ok(stripped).pinnedTimes).toBeUndefined();
  });

  it('drops a pin for a place that is not in the day', () => {
    // A link must not be able to say something about a place it does not
    // carry — on either side of the trip.
    const url = encodeDayLink(
      day({ pinnedTimes: { 'golden-gate-park': 600, 'union-square': 780 } })
    );
    expect(url).not.toContain('golden-gate-park');
    expect(ok(url).pinnedTimes).toEqual({ 'union-square': 780 });
  });

  it('drops a pin for a place this build cannot resolve', () => {
    const url = `pirtsf://d?v=1&c=sf&w=540-1200&g=balanced&p=ferry-building,made-up-place&t=made-up-place:600`;
    expect(ok(url).pinnedTimes).toBeUndefined();
  });

  it('drops a time outside the shared window', () => {
    // The window travels in the same link. A pin outside it describes a day
    // the link itself says is not being had.
    const url = `pirtsf://d?v=1&c=sf&w=540-1200&g=balanced&p=union-square&t=union-square:1350`;
    expect(ok(url).pinnedTimes).toBeUndefined();
  });

  it('will not encode a time outside the window either', () => {
    const url = encodeDayLink(
      day({ window: { dayStartMin: 540, homeByMin: 1200 }, pinnedTimes: { 'union-square': 1350 } })
    );
    expect(url).not.toContain('t=');
  });

  it('keeps several', () => {
    const url = encodeDayLink(
      day({ pinnedTimes: { 'ferry-building': 600, 'dolores-park': 900 } })
    );
    expect(ok(url).pinnedTimes).toEqual({
      'ferry-building': 600,
      'dolores-park': 900,
    });
  });

  it('survives a chat client adding a full stop', () => {
    const url = encodeDayLink(day({ pinnedTimes: { 'union-square': 780 } }));
    expect(ok(`${url}.`).pinnedTimes).toEqual({ 'union-square': 780 });
  });

  it('takes the first of a repeated id rather than the last', () => {
    // Matching the query parser: anything appended must not rewrite what a
    // valid link already said.
    const url = `pirtsf://d?v=1&c=sf&w=540-1200&g=balanced&p=union-square&t=union-square:600,union-square:900`;
    expect(ok(url).pinnedTimes).toEqual({ 'union-square': 600 });
  });

  it('ignores a malformed pair without losing the day', () => {
    const url = `pirtsf://d?v=1&c=sf&w=540-1200&g=balanced&p=ferry-building,union-square&t=nonsense,union-square:abc,ferry-building:600`;
    const d = ok(url);
    expect(d.placeIds).toEqual(['ferry-building', 'union-square']);
    expect(d.pinnedTimes).toEqual({ 'ferry-building': 600 });
  });

  it('round-trips unchanged', () => {
    const original = day({
      pinnedTimes: { 'ferry-building': 600, 'union-square': 780 },
    });
    const back = ok(encodeDayLink(original));
    expect(back.placeIds).toEqual(original.placeIds);
    expect(back.pinnedTimes).toEqual(original.pinnedTimes);
  });

  it('still carries no start place', () => {
    // The rule the whole format exists under, restated against the new key.
    const url = encodeDayLink(day({ pinnedTimes: { 'union-square': 780 } }));
    expect(url).not.toMatch(/lat|lng|latitude|longitude|anchor|start|home=/i);
  });
});
