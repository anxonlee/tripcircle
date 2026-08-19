import {
  formatCount,
  formatDuration,
  formatPlacePrice,
  formatPriceBand,
  formatUsd,
  ordinal,
  relativeDays,
} from '../format';

describe('formatUsd', () => {
  it('shows whole dollars with separators', () => {
    expect(formatUsd(0)).toBe('$0');
    expect(formatUsd(18)).toBe('$18');
    expect(formatUsd(1340)).toBe('$1,340');
    expect(formatUsd(1_234_567)).toBe('$1,234,567');
  });

  it('rounds rather than truncating', () => {
    expect(formatUsd(18.4)).toBe('$18');
    expect(formatUsd(18.5)).toBe('$19');
  });

  it('does not print a negative zero', () => {
    // Math.round(-0.4) is -0, and "-$0" on a fare would look like a refund.
    expect(formatUsd(-0.4)).toBe('$0');
    expect(formatUsd(-0)).toBe('$0');
  });

  it('keeps the sign outside the symbol for a real negative', () => {
    expect(formatUsd(-12)).toBe('-$12');
  });
});

describe('formatDuration', () => {
  it('renders minutes and hours', () => {
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(60)).toBe('1 h');
    expect(formatDuration(92)).toBe('1 h 32 min');
    expect(formatDuration(0)).toBe('0 min');
  });

  it('rounds before splitting, so no "1 h 60 min"', () => {
    expect(formatDuration(59.7)).toBe('1 h');
    expect(formatDuration(119.6)).toBe('2 h');
  });
});

describe('formatCount', () => {
  it('switches to thousands at a thousand', () => {
    expect(formatCount(999)).toBe('999');
    expect(formatCount(1000)).toBe('1.0k');
    expect(formatCount(1800)).toBe('1.8k');
  });
});

describe('relativeDays', () => {
  it('reads as a diary rather than a date', () => {
    expect(relativeDays(0)).toBe('today');
    expect(relativeDays(1)).toBe('yesterday');
    expect(relativeDays(3)).toBe('3d ago');
    expect(relativeDays(21)).toBe('3w ago');
    expect(relativeDays(60)).toBe('2mo ago');
    expect(relativeDays(400)).toBe('1y ago');
  });

  it('does not say a visit happened a negative number of days ago', () => {
    // A device clock that moved backwards, or a restored backup from a phone
    // set to the wrong date, both produce a visit in the future.
    expect(relativeDays(-3)).toBe('today');
  });
});

describe('ordinal', () => {
  it('handles the teens, which are the ones that catch people out', () => {
    expect(ordinal(11)).toBe('11th');
    expect(ordinal(12)).toBe('12th');
    expect(ordinal(13)).toBe('13th');
    expect(ordinal(111)).toBe('111th');
  });

  it('handles the rest', () => {
    expect(ordinal(1)).toBe('1st');
    expect(ordinal(2)).toBe('2nd');
    expect(ordinal(3)).toBe('3rd');
    expect(ordinal(4)).toBe('4th');
    expect(ordinal(21)).toBe('21st');
    expect(ordinal(102)).toBe('102nd');
  });
});

describe('formatPlacePrice', () => {
  it('says nothing about a place whose price is a placeholder', () => {
    // The rule this function exists for: an OSM find carries no price, and
    // printing its band would advertise a café we know nothing about as cheap.
    expect(formatPlacePrice({ priceBand: '$', priceEstimated: true })).toBeNull();
    expect(formatPlacePrice({ priceBand: 'free', priceEstimated: true })).toBeNull();
  });

  it('prints an assessed band', () => {
    expect(formatPlacePrice({ priceBand: '$$' })).toBe('$$');
    expect(formatPlacePrice({ priceBand: 'free' })).toBe('Free');
  });
});

describe('formatPriceBand', () => {
  it('spells out free rather than showing an empty band', () => {
    expect(formatPriceBand('free')).toBe('Free');
    expect(formatPriceBand('$$$')).toBe('$$$');
  });
});
