/**
 * Coming back to where you were.
 *
 * iOS evicts a backgrounded app whenever the foreground one wants the
 * memory, and this app hands off to Google Maps as a matter of course — so
 * "come back and carry on" is a normal part of using it, not an edge case.
 * Without this, every hand-off returns you to the diary tab and you find
 * your way back to the plan by hand.
 *
 * The interesting part is not saving the state; it is the three cases where
 * restoring it would be worse than not.
 */

// Type-only, so this module stays loadable without React Navigation — the
// rules below are the part worth testing, and the test runner here parses
// pure TypeScript only.
import type { InitialState } from '@react-navigation/native';

/** A navigation state as stored, with the moment it was stored. */
export interface SavedNav {
  at: number;
  state: unknown;
}

/**
 * How long a saved position stays worth returning to.
 *
 * Four hours covers the whole shape of the thing this exists for: a Maps
 * hand-off, a meal, an afternoon that pauses. Beyond that, reopening the app
 * is a new intention rather than a continuation, and dropping someone back
 * into yesterday's half-finished plan would be the app deciding what they
 * meant.
 */
export const MAX_RESTORE_AGE_MS = 4 * 60 * 60 * 1000;

/** Screens that must never be resumed into. */
const NEVER_RESUME = new Set([
  // Onboarding. If there is an anchor, this screen has been answered; if
  // there is not, the gate in App.tsx sends them here anyway and needs to
  // own that decision itself.
  'Setup',
]);

interface Nav {
  index?: number;
  routes?: { name?: string }[];
}

/**
 * What to hand to NavigationContainer, or null to let it decide for itself.
 *
 * `hasStartPlace` is not a detail: without an anchor the app must land on
 * Setup, and a restored state would override that and drop somebody onto a
 * plan screen that cannot compute anything.
 */
export function restorableState(
  saved: SavedNav | null | undefined,
  now: number,
  opts: { hasStartPlace: boolean }
): InitialState | null {
  if (!saved || typeof saved.at !== 'number' || !saved.state) return null;
  // A clock that moved backwards should not make a saved position immortal
  // or instantly stale; treat anything from the future as just-saved.
  const age = Math.max(0, now - saved.at);
  if (age > MAX_RESTORE_AGE_MS) return null;
  if (!opts.hasStartPlace) return null;

  const cleaned = withoutBlockedRoutes(saved.state as Nav);
  // Cast once, here. What was read off disk is opaque to this module: it
  // prunes routes by name and repairs the index, and makes no claim about
  // the rest of the shape, which belongs to React Navigation.
  return (cleaned as InitialState | null) ?? null;
}

/**
 * Drops screens that must not be resumed into, and repairs the index so it
 * still points at the last route. A state whose index is out of range makes
 * React Navigation throw, which would turn a nicety into a launch crash.
 */
function withoutBlockedRoutes(state: Nav): Nav | null {
  if (!state || !Array.isArray(state.routes)) return null;
  const routes = state.routes.filter(
    (r) => r && typeof r.name === 'string' && !NEVER_RESUME.has(r.name)
  );
  if (routes.length === 0) return null;
  const index = Math.min(
    typeof state.index === 'number' ? state.index : routes.length - 1,
    routes.length - 1
  );
  return { ...state, routes, index: Math.max(0, index) };
}
