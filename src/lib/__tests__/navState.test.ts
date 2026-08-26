import { MAX_RESTORE_AGE_MS, restorableState } from '../navState';

const NOW = 1_800_000_000_000;
const nav = (names: string[], index?: number) => ({
  index: index ?? names.length - 1,
  routes: names.map((name) => ({ name })),
});
const ok = { hasStartPlace: true };

describe('restorableState', () => {
  it('returns what was saved when it is fresh', () => {
    const state = nav(['Tabs', 'DayPlan']);
    expect(restorableState({ at: NOW - 1000, state }, NOW, ok)).toEqual(state);
  });

  it('gives up on a position from yesterday', () => {
    // Reopening the app after that long is a new intention, not a
    // continuation of the old one.
    const saved = { at: NOW - MAX_RESTORE_AGE_MS - 1, state: nav(['Tabs', 'DayPlan']) };
    expect(restorableState(saved, NOW, ok)).toBeNull();
  });

  it('keeps a position saved right on the limit', () => {
    const saved = { at: NOW - MAX_RESTORE_AGE_MS, state: nav(['Tabs', 'DayPlan']) };
    expect(restorableState(saved, NOW, ok)).not.toBeNull();
  });

  it('does not restore when there is no start place', () => {
    // The Setup gate has to win: a restored plan screen with no anchor is a
    // screen that cannot compute anything.
    const saved = { at: NOW - 1000, state: nav(['Tabs', 'DayPlan']) };
    expect(restorableState(saved, NOW, { hasStartPlace: false })).toBeNull();
  });

  it('never resumes into onboarding', () => {
    const saved = { at: NOW - 1000, state: nav(['Setup']) };
    expect(restorableState(saved, NOW, ok)).toBeNull();
  });

  it('drops onboarding from a stack but keeps the rest', () => {
    const saved = { at: NOW - 1000, state: nav(['Setup', 'Tabs', 'DayPlan']) };
    const out = restorableState(saved, NOW, ok) as { routes: { name: string }[]; index: number };
    expect(out.routes.map((r) => r.name)).toEqual(['Tabs', 'DayPlan']);
    expect(out.index).toBe(1);
  });

  it('repairs an index left pointing past the end', () => {
    // Removing a route without fixing the index makes React Navigation
    // throw, which would turn a convenience into a launch crash.
    const saved = { at: NOW - 1000, state: { index: 2, routes: [{ name: 'Setup' }, { name: 'Tabs' }] } };
    const out = restorableState(saved, NOW, ok) as { routes: { name: string }[]; index: number };
    expect(out.routes).toHaveLength(1);
    expect(out.index).toBe(0);
  });

  it('treats a clock that moved backwards as just-saved', () => {
    const saved = { at: NOW + 60_000, state: nav(['Tabs', 'DayPlan']) };
    expect(restorableState(saved, NOW, ok)).not.toBeNull();
  });

  it('refuses anything malformed rather than crashing the launch', () => {
    for (const bad of [
      null,
      { at: NOW, state: null },
      { at: NOW, state: {} },
      { at: NOW, state: { routes: [] } },
      { at: NOW, state: { routes: 'nope' } },
      { at: 'soon' as unknown as number, state: nav(['Tabs']) },
    ]) {
      expect(restorableState(bad as never, NOW, ok)).toBeNull();
    }
  });

  it('drops routes with no name', () => {
    const saved = { at: NOW, state: { index: 1, routes: [{ name: 'Tabs' }, {}] } };
    const out = restorableState(saved, NOW, ok) as { routes: { name: string }[] };
    expect(out.routes.map((r) => r.name)).toEqual(['Tabs']);
  });
});
