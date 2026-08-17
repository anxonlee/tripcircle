import type { CuratedPlace, District, LatLng } from '../../domain/types';
import {
  ASSUMED_HOURS,
  DUPLICATE_KM,
  MAX_NAME_LENGTH,
  type MyPlace,
  type MyPlaceDraft,
  districtFor,
  draftProblems,
  draftToPlace,
  findDuplicate,
  isMyPlaceId,
  mergePlaces,
  newMyPlaceId,
  stayMinutes,
} from '../myPlace';

const SF: LatLng = { latitude: 37.7749, longitude: -122.4194 };

const draft = (over: Partial<MyPlaceDraft> = {}): MyPlaceDraft => ({
  name: 'The corner café',
  location: SF,
  theme: 'cafe',
  stay: 'visit',
  priceBand: '$',
  hours: { kind: 'unknown' },
  ...over,
});

const place = (over: Partial<CuratedPlace> = {}): CuratedPlace => ({
  id: 'ferry-building',
  name: 'Ferry Building',
  location: SF,
  district: 'Downtown & SoMa',
  themes: ['food'],
  priceLevel: 2,
  priceBand: '$$',
  avgCostUsd: 20,
  worthDetour: false,
  openHours: { open: 600, close: 1200 },
  visitDurationMin: 60,
  ...over,
});

const mine = (over: Partial<MyPlace> = {}): MyPlace => ({
  ...place({ id: 'mine-abc-1', name: 'My spot' }),
  source: 'mine',
  addedAt: 1,
  ...over,
});

describe('newMyPlaceId', () => {
  it('is shaped like an id a shared link will carry', () => {
    // tripLink only encodes ids matching /^[a-z0-9-]+$/; a day containing a
    // user place has to survive being shared even though the recipient will
    // not resolve it.
    expect(newMyPlaceId(1_700_000_000_000, 0.42)).toMatch(/^[a-z0-9-]+$/);
  });

  it('tells its own places apart from the dataset', () => {
    expect(isMyPlaceId(newMyPlaceId(1, 0.5))).toBe(true);
    expect(isMyPlaceId('ferry-building')).toBe(false);
  });

  it('does not repeat itself within the same millisecond', () => {
    expect(newMyPlaceId(1, 0.1)).not.toBe(newMyPlaceId(1, 0.9));
  });
});

describe('districtFor', () => {
  const reference = [
    { location: { latitude: 37.7749, longitude: -122.4194 }, district: 'Mission' as District },
    { location: { latitude: 37.8044, longitude: -122.2712 }, district: 'Oakland' as District },
  ];

  it('borrows the label of the nearest place we know', () => {
    expect(districtFor({ latitude: 37.8, longitude: -122.27 }, reference)).toBe('Oakland');
    expect(districtFor({ latitude: 37.775, longitude: -122.42 }, reference)).toBe('Mission');
  });

  it('falls back rather than inventing a district', () => {
    // Districts are a closed union; a user place must not create a phantom.
    expect(districtFor(SF, [])).toBe('Downtown & SoMa');
  });
});

describe('draftProblems', () => {
  it('is happy with a filled-in draft', () => {
    expect(draftProblems(draft())).toEqual([]);
  });

  it('wants a name that is not just spaces', () => {
    expect(draftProblems(draft({ name: '   ' }))).toContain('no-name');
  });

  it('refuses a name too long to render anywhere', () => {
    expect(draftProblems(draft({ name: 'x'.repeat(MAX_NAME_LENGTH + 1) }))).toContain(
      'name-too-long'
    );
  });

  it('wants somewhere to put the pin', () => {
    expect(draftProblems({ ...draft(), location: undefined })).toContain('no-location');
  });

  it('refuses a closing time before the opening one', () => {
    expect(
      draftProblems(draft({ hours: { kind: 'window', open: 600, close: 300 } }))
    ).toContain('bad-window');
  });

  it('accepts a window that runs past midnight', () => {
    // 22:00 to 02:00 is a real bar, and 1560 is how the type says 26:00.
    expect(
      draftProblems(draft({ hours: { kind: 'window', open: 1320, close: 1560 } }))
    ).toEqual([]);
  });

  it('reports everything wrong at once', () => {
    const problems = draftProblems({ name: '', hours: { kind: 'window', open: 9, close: 9 } });
    expect(problems).toContain('no-name');
    expect(problems).toContain('no-location');
    expect(problems).toContain('bad-window');
  });
});

describe('findDuplicate', () => {
  it('spots the same place added twice from different pavements', () => {
    const near = { latitude: SF.latitude + 0.0005, longitude: SF.longitude };
    expect(findDuplicate({ name: 'ferry building', location: near }, [place()])).not.toBeNull();
  });

  it('leaves a chain with branches alone', () => {
    const far = { latitude: SF.latitude + DUPLICATE_KM, longitude: SF.longitude };
    expect(findDuplicate({ name: 'Ferry Building', location: far }, [place()])).toBeNull();
  });

  it('has no opinion on an unnamed draft', () => {
    expect(findDuplicate({ name: '  ', location: SF }, [place()])).toBeNull();
  });
});

describe('draftToPlace', () => {
  const build = (d: Partial<MyPlaceDraft> = {}) =>
    draftToPlace(draft(d), 'Mission', 'mine-x-1', 1_700_000_000_000);

  it('keeps what the user actually said', () => {
    const p = build({ name: '  The corner café  ', stay: 'long', priceBand: '$$' });
    expect(p.name).toBe('The corner café');
    expect(p.visitDurationMin).toBe(stayMinutes('long'));
    expect(p.priceBand).toBe('$$');
    expect(p.themes).toEqual(['cafe']);
  });

  it('never grants itself a detour', () => {
    // worthDetour is what lets the optimiser route out of its way. A place
    // added by the person who benefits must not be able to claim it.
    expect(build().worthDetour).toBe(false);
  });

  it('marks itself as the user’s own', () => {
    expect(build().source).toBe('mine');
  });

  it('does not turn an unanswered question into always-open', () => {
    // null openHours means the planner may schedule a stop at any hour —
    // right for a park, wrong for a café whose hours nobody knew.
    const p = build({ hours: { kind: 'unknown' } });
    expect(p.openHours).toEqual(ASSUMED_HOURS);
    expect(p.hoursEstimated).toBe(true);
  });

  it('takes always-open at its word, and does not call it a guess', () => {
    const p = build({ hours: { kind: 'always' } });
    expect(p.openHours).toBeNull();
    expect(p.hoursEstimated).toBeUndefined();
  });

  it('uses stated hours as fact', () => {
    const p = build({ hours: { kind: 'window', open: 480, close: 1020 } });
    expect(p.openHours).toEqual({ open: 480, close: 1020 });
    expect(p.hoursEstimated).toBeUndefined();
  });

  it('claims no spend for a field it never asked about', () => {
    expect(build({ priceBand: '$$$' }).avgCostUsd).toBe(0);
  });

  it('reads free as free', () => {
    expect(build({ priceBand: 'free' }).priceLevel).toBe(0);
  });
});

describe('mergePlaces', () => {
  it('puts the user’s own places alongside the dataset', () => {
    const merged = mergePlaces([place()], [mine()]);
    expect(merged.map((p) => p.id)).toEqual(['mine-abc-1', 'ferry-building']);
  });

  it('leaves a put-away place out of planning', () => {
    expect(mergePlaces([place()], [mine({ hidden: true })])).toHaveLength(1);
  });

  it('does not list the same id twice', () => {
    const merged = mergePlaces([place({ id: 'mine-abc-1' })], [mine()]);
    expect(merged).toHaveLength(1);
    expect(merged[0].source).toBe('mine');
  });

  it('is the dataset unchanged when the user has added nothing', () => {
    expect(mergePlaces([place()], [])).toEqual([place()]);
  });
});
