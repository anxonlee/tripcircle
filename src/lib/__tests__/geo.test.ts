import {
  formatDayEnd,
  formatTime,
  haversineKm,
  makeStartPlace,
  snapToCoarse,
} from '../geo';

describe('haversineKm', () => {
  it('is zero for a point against itself', () => {
    const p = { latitude: 37.7955, longitude: -122.3934 };
    expect(haversineKm(p, p)).toBe(0);
  });

  it('measures a known Bay Area distance', () => {
    // Ferry Building to the Palace of Fine Arts, about 5 km as the crow flies.
    const d = haversineKm(
      { latitude: 37.7955, longitude: -122.3934 },
      { latitude: 37.8029, longitude: -122.4484 }
    );
    expect(d).toBeGreaterThan(4.5);
    expect(d).toBeLessThan(5.5);
  });

  it('is symmetric', () => {
    const a = { latitude: 37.75, longitude: -122.42 };
    const b = { latitude: 37.87, longitude: -122.27 };
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 9);
  });

  it('does not go imaginary for antipodal points', () => {
    // asin(sqrt(h)) with h drifting just past 1 through rounding is the
    // classic haversine NaN.
    const d = haversineKm(
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 180 }
    );
    expect(Number.isFinite(d)).toBe(true);
    expect(d).toBeGreaterThan(20_000);
  });
});

describe('snapToCoarse', () => {
  it('keeps three decimals and no more (PRD 3.1)', () => {
    const snapped = snapToCoarse({ latitude: 37.795512, longitude: -122.393483 });
    expect(snapped).toEqual({ latitude: 37.796, longitude: -122.393 });
  });

  it('never returns anything finer than the block level', () => {
    const snapped = snapToCoarse({ latitude: 37.7955129, longitude: -122.3934834 });
    for (const v of [snapped.latitude, snapped.longitude]) {
      // Three decimals or fewer, whatever the input precision.
      expect(String(v).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(3);
    }
  });

  it('is idempotent', () => {
    const once = snapToCoarse({ latitude: 37.795512, longitude: -122.393483 });
    expect(snapToCoarse(once)).toEqual(once);
  });
});

describe('makeStartPlace', () => {
  it('stores nothing finer than the coarse grid', () => {
    // The rule the whole function exists for: a start place is where someone
    // lives, and a precise one is a statement about their home.
    const sp = makeStartPlace({
      id: 'home',
      name: 'Home',
      kind: 'station',
      location: { latitude: 37.7955129, longitude: -122.3934834 },
    } as never);
    expect(sp.location).toEqual({ latitude: 37.796, longitude: -122.393 });
  });
});

describe('formatTime', () => {
  it('renders the ordinary cases', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(545)).toBe('9:05');
    expect(formatTime(1050)).toBe('17:30');
    expect(formatTime(1439)).toBe('23:59');
  });

  it('wraps past midnight', () => {
    expect(formatTime(1440)).toBe('0:00');
    expect(formatTime(1560)).toBe('2:00');
  });

  it('wraps negative minutes forwards', () => {
    expect(formatTime(-60)).toBe('23:00');
  });

  it('never prints a sixtieth minute', () => {
    // Rounding the minutes independently of the hour is how "9:60" happens:
    // 599.6 floors to hour 9 and rounds to minute 60. Durations from a live
    // routing provider are not whole numbers.
    expect(formatTime(599.6)).toBe('10:00');
    expect(formatTime(59.7)).toBe('1:00');
    expect(formatTime(1439.7)).toBe('0:00');
  });
});

describe('formatDayEnd', () => {
  it('says so when a day runs past midnight', () => {
    expect(formatDayEnd(1456)).toBe('0:16 next day');
    expect(formatDayEnd(1200)).toBe('20:00');
  });

  it('treats exactly midnight as the next day', () => {
    expect(formatDayEnd(1440)).toBe('0:00 next day');
  });
});
