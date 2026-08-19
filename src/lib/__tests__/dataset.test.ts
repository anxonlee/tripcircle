import { bayAreaPlaces } from '../../services/mock/bayAreaPlaces';
import { bayAreaLandmarks } from '../../services/mock/landmarks';

/**
 * Invariants of the seed place list.
 *
 * Not a claim that the data is correct — nothing here can check whether a
 * café really opens at nine, and the dataset must never be described as
 * verified. These check the things that are structurally checkable, which is
 * exactly the set of mistakes hand-editing a 400-entry literal produces:
 * a duplicated id, a transposed coordinate, a closing time before an opening
 * one.
 */

describe('place ids', () => {
  it('are unique', () => {
    // A duplicate id makes two places one place: selection, the diary and
    // the wall all key on it, and the second silently wins or loses.
    const seen = new Map<string, number>();
    for (const p of bayAreaPlaces) seen.set(p.id, (seen.get(p.id) ?? 0) + 1);
    expect([...seen.entries()].filter(([, n]) => n > 1)).toEqual([]);
  });

  it('are slugs, which is what the share link can carry', () => {
    // tripLink filters ids to this shape; one that fails it cannot be shared.
    const bad = bayAreaPlaces.filter((p) => !/^[a-z0-9-]+$/.test(p.id));
    expect(bad.map((p) => p.id)).toEqual([]);
  });

  it('are matched by unique names, so search cannot show two of one place', () => {
    const byName = new Map<string, string[]>();
    for (const p of bayAreaPlaces) {
      const key = p.name.trim().toLowerCase();
      byName.set(key, [...(byName.get(key) ?? []), p.id]);
    }
    expect([...byName.entries()].filter(([, ids]) => ids.length > 1)).toEqual([]);
  });
});

describe('coordinates', () => {
  it('all sit inside the Bay Area', () => {
    // A transposed or sign-flipped pair lands in the Indian Ocean and drags
    // the whole map view with it.
    const out = bayAreaPlaces.filter(
      (p) =>
        p.location.latitude < 36.9 ||
        p.location.latitude > 38.3 ||
        p.location.longitude < -123.2 ||
        p.location.longitude > -121.6
    );
    expect(out.map((p) => `${p.id} ${p.location.latitude},${p.location.longitude}`)).toEqual([]);
  });

  it('are not all on top of each other', () => {
    const distinct = new Set(
      bayAreaPlaces.map((p) => `${p.location.latitude},${p.location.longitude}`)
    );
    expect(distinct.size).toBe(bayAreaPlaces.length);
  });
});

describe('opening hours', () => {
  it('open before they close', () => {
    const bad = bayAreaPlaces.filter(
      (p) => p.openHours && p.openHours.close <= p.openHours.open
    );
    expect(bad.map((p) => p.id)).toEqual([]);
  });

  it('never claim to be open for longer than a day', () => {
    // `close` may pass 1440 — a bar shutting at 2am is 26:00 — but a window
    // wider than 24 hours describes a place that is never shut, which is
    // what `openHours: null` is for.
    const bad = bayAreaPlaces.filter(
      (p) => p.openHours && (p.openHours.open < 0 || p.openHours.close - p.openHours.open > 24 * 60)
    );
    expect(bad.map((p) => p.id)).toEqual([]);
  });

  it('are only ever consulted as a single window, which overnight hours strain', () => {
    /*
     * A limitation, pinned so it is a known one rather than a surprise.
     *
     * The schedule compares a visit time inside one day (0–1439) against
     * `open`/`close`. That works for a bar open 19:00–26:00, because the
     * only times anyone plans against are on the evening side. It does not
     * work for a place whose window covers a morning belonging to the
     * previous night's session: Golden Gate Produce Market runs 22:00–14:00,
     * and a plan for 10:00 is inside the real window but reads as five
     * hours before opening.
     *
     * If this count grows, the model needs real overnight support rather
     * than another entry on this list.
     */
    // Past 6am, i.e. into hours somebody would actually plan a visit in.
    // Closing at 1am or 2am is the ordinary late-night case and is fine.
    const wrapsIntoTheAfternoon = bayAreaPlaces.filter(
      (p) => p.openHours && p.openHours.close > 30 * 60
    );
    expect(wrapsIntoTheAfternoon.map((p) => p.id)).toEqual([
      'golden-gate-produce-market',
    ]);
  });

  it('never sit open for less time than the visit they suggest', () => {
    const bad = bayAreaPlaces.filter(
      (p) => p.openHours && p.openHours.close - p.openHours.open < p.visitDurationMin
    );
    expect(bad.map((p) => p.id)).toEqual([]);
  });
});

describe('planning fields', () => {
  it('give every place a visit duration worth scheduling', () => {
    const bad = bayAreaPlaces.filter(
      (p) => !Number.isFinite(p.visitDurationMin) || p.visitDurationMin <= 0 || p.visitDurationMin > 8 * 60
    );
    expect(bad.map((p) => p.id)).toEqual([]);
  });

  it('give every place at least one theme', () => {
    expect(bayAreaPlaces.filter((p) => p.themes.length === 0).map((p) => p.id)).toEqual([]);
  });

  it('agree between price band and price level', () => {
    const band = ['free', '$', '$$', '$$$', '$$$'] as const;
    const bad = bayAreaPlaces.filter((p) => band[p.priceLevel] !== p.priceBand);
    expect(bad.map((p) => `${p.id} ${p.priceLevel}/${p.priceBand}`)).toEqual([]);
  });

  it('have a name that is not blank', () => {
    expect(bayAreaPlaces.filter((p) => p.name.trim().length === 0)).toEqual([]);
  });
});

describe('landmarks', () => {
  it('have unique ids', () => {
    const ids = bayAreaLandmarks.map((l) => l.id);
    expect(ids.length).toBe(new Set(ids).size);
  });

  it('sit in the Bay Area too', () => {
    const out = bayAreaLandmarks.filter(
      (l) =>
        l.location.latitude < 36.9 ||
        l.location.latitude > 38.3 ||
        l.location.longitude < -123.2 ||
        l.location.longitude > -121.6
    );
    expect(out.map((l) => l.id)).toEqual([]);
  });
});
