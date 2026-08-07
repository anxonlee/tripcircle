import {
  EDIT_WINDOW_MS,
  canEditVisit,
  editWindowLeft,
  type Visit,
} from '../diary';

const at = (timestamp: number): Visit => ({
  id: 'v1',
  placeId: 'tartine-bakery',
  timestamp,
  wouldGoAgain: 'yes',
});

const NOW = 1_700_000_000_000;

describe('edit window', () => {
  it('is 48 hours', () => {
    expect(EDIT_WINDOW_MS).toBe(48 * 60 * 60 * 1000);
  });

  it('allows editing a visit just stamped', () => {
    expect(canEditVisit(at(NOW), NOW)).toBe(true);
  });

  it('still allows editing a minute before the window closes', () => {
    expect(canEditVisit(at(NOW - EDIT_WINDOW_MS + 60_000), NOW)).toBe(true);
  });

  it('closes exactly at 48 hours, not after', () => {
    expect(canEditVisit(at(NOW - EDIT_WINDOW_MS), NOW)).toBe(false);
  });

  it('refuses an older visit', () => {
    expect(canEditVisit(at(NOW - 7 * 24 * 3_600_000), NOW)).toBe(false);
  });

  it('reports the remaining window, floored at zero', () => {
    expect(editWindowLeft(at(NOW), NOW)).toBe(EDIT_WINDOW_MS);
    expect(editWindowLeft(at(NOW - 47 * 3_600_000), NOW)).toBe(3_600_000);
    expect(editWindowLeft(at(NOW - 100 * 3_600_000), NOW)).toBe(0);
  });
});
