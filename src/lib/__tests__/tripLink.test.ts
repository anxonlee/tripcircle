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
