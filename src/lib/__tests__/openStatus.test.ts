import type { CuratedPlace } from '../../domain/types';
import { openStatus } from '../openStatus';

/**
 * The place card's open/closed line, across real and estimated hours.
 *
 * `hoursEstimated` marks a category default rather than the venue's own
 * times — 206 of the dataset's 421 hour-carrying records. The card must
 * hedge those ("Usually open", "Usually opens") and state real hours as
 * fact ("Open now", "Opens"). The distinction exists so a guessed window
 * is never presented as fact, per BAY-AREA-DELTA.md.
 *
 * Time is faked because the verdict depends on the clock: noon, when the
 * fixture is open, and 23:00, when it has closed.
 */

const place = (overrides: Partial<CuratedPlace>): CuratedPlace => ({
  id: 'p',
  name: 'P',
  location: { latitude: 37.78, longitude: -122.41 },
  district: 'Downtown & SoMa',
  themes: ['food'],
  priceLevel: 1,
  priceBand: '$',
  avgCostUsd: 10,
  worthDetour: false,
  openHours: { open: 10 * 60, close: 22 * 60 },
  visitDurationMin: 60,
  ...overrides,
});

const atNoon = new Date(2026, 7, 11, 12, 0);
const atEleven = new Date(2026, 7, 11, 23, 0);

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it('states real hours as fact: Open now / Opens', () => {
  jest.setSystemTime(atNoon);
  expect(openStatus(place({}))).toEqual({
    open: true,
    label: 'Open now',
    text: 'til 22:00',
  });
  jest.setSystemTime(atEleven);
  expect(openStatus(place({}))).toEqual({
    open: false,
    label: '',
    text: 'Opens 10:00',
  });
});

it('hedges estimated hours: Usually open / Usually opens', () => {
  jest.setSystemTime(atNoon);
  expect(openStatus(place({ hoursEstimated: true }))).toEqual({
    open: true,
    label: 'Usually open',
    text: 'til 22:00',
  });
  jest.setSystemTime(atEleven);
  expect(openStatus(place({ hoursEstimated: true }))).toEqual({
    open: false,
    label: '',
    text: 'Usually opens 10:00',
  });
});

it('still recognises a past-midnight closer as open', () => {
  // El Farolito closes at 2:00 the next day (close = 26:00).
  jest.setSystemTime(atEleven);
  const late = place({ openHours: { open: 10 * 60, close: 26 * 60 } });
  expect(openStatus(late).open).toBe(true);
  expect(openStatus(late).label).toBe('Open now');
});
