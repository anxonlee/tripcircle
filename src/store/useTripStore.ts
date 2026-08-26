import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { StartPlace } from '../domain/types';
import type { Goal } from '../lib/optimizer';
import {
  LATEST_HOME_BY_MIN,
  clampDayWindow,
  type DayWindow,
  type SuggestionBias,
} from '../lib/planner';

/**
 * Persisted planning state (local-only, AsyncStorage). The start place is
 * always coarse-snapped before it gets here (lib/geo.makeStartPlace) —
 * PRD §3.1 forbids persisting anything finer.
 */
interface TripState {
  startPlace: StartPlace | null;
  /**
   * PRD §3.1 ephemeral mode: the start place came from current GPS and must
   * never be written to storage. Enforced in `partialize` below.
   */
  startPlaceEphemeral: boolean;
  /**
   * Whether the anchor that is now missing was an ephemeral one.
   *
   * Persisted, and it holds no location — only the fact that there was one
   * and that we deliberately did not keep it. Without this, a cold start
   * cannot tell "never set one up" from "set one up, and we threw it away
   * as promised", and those want completely different screens: the first is
   * onboarding, the second is somebody halfway through a day out who has
   * just come back from Google Maps.
   */
  anchorWasEphemeral: boolean;
  selectedPlaceIds: string[];
  goal: Goal;
  /**
   * Day window, minutes since midnight. There is deliberately no budget
   * field: cost is reported by the planner, never enforced.
   *
   * The default runs as late as the clock allows rather than to an invented
   * early finish. Opening hours are what should end a day, and the planner
   * bounds the outing by §3.3's eight hours, so the late window costs nothing.
   *
   * `homeByMin` ends at 23:59 rather than midnight. It never crosses into the
   * next day: see `LATEST_HOME_BY_MIN`, which explains why the last minute
   * matters.
   */
  dayStartMin: number;
  homeByMin: number;
  /**
   * Whether a car is available for this outing. `null` means we have not asked
   * yet — the Plan screen asks before it computes anything, because offering
   * driving to someone without a car produces a plan they cannot follow, and
   * the difference is large: driving is usually the cheapest way across the
   * Bay and the most expensive way to move two blocks.
   */
  hasCar: boolean | null;
  setHasCar: (v: boolean | null) => void;
  setStartPlace: (sp: StartPlace | null, opts?: { ephemeral?: boolean }) => void;
  togglePlace: (id: string) => void;
  setSelection: (ids: string[]) => void;
  clearSelection: () => void;
  setGoal: (g: Goal) => void;
  /**
   * Adjust the outing window. Always clamped, so no caller can persist a
   * window that ends before it starts or runs past 23:59.
   */
  setDayWindow: (window: DayWindow) => void;
  /**
   * Whether suggestions lean towards places already in the diary or away from
   * them. Defaults to `familiar`, which is what the ranking did before the
   * choice existed, so an upgrade changes nothing until the user asks.
   */
  suggestionBias: SuggestionBias;
  setSuggestionBias: (b: SuggestionBias) => void;
  /**
   * Which stop Start day is on. Persisted, because a day out runs for hours
   * and the app is backgrounded at every one of them — holding this in screen
   * state would put the user back at stop one each time they came back to it.
   *
   * Reset by every change to the selection: the step is an index into a day,
   * so once the day is a different day the index means nothing.
   */
  startDayStep: number;
  setStartDayStep: (step: number) => void;
  /**
   * When the user actually set off, or null if they have not.
   *
   * `startDayStep` cannot answer this: step zero means both "not started"
   * and "standing at the first stop", and every screen that wants to know
   * whether a day is underway has had to guess between them. A banner that
   * guessed would appear for people who had merely looked at a plan.
   *
   * Persisted, because a day out runs for hours across many launches — the
   * same reason the step is.
   */
  dayStartedAt: number | null;
  beginDayOut: () => void;
  endDayOut: () => void;
  /**
   * Whether this day out was started outside the window the user set.
   *
   * Start day refuses a day whose window has gone by, and offers to run it
   * anyway; this remembers that they said yes. Without it the answer would
   * be forgotten the moment the screen unmounted, and coming back to a day
   * already underway would meet the same refusal — which also resets the
   * step, so an overridden day would lose its place every time the app was
   * backgrounded.
   *
   * Persisted for the same reason the step is, and cleared by the same
   * things: it describes one outing, not a preference. Nothing else in the
   * app reads it as permission — the day window itself is untouched.
   */
  dayIgnoresWindow: boolean;
  /** Say yes to a refused day. Starts the outing if it has not started. */
  ignoreDayWindow: () => void;
  /**
   * The order the user arranged, by place id (PRD F6, §3.4).
   *
   * `null` means they have not arranged one and the optimiser is free to
   * sequence the day. Once set, it is authority: the optimiser schedules and
   * chooses transport but no longer reorders. §3.4 calls this the optimiser
   * becoming "an on-demand assist rather than all-or-nothing", and clearing
   * it is how the assist is asked for again.
   *
   * Deliberately not cleared when the selection changes. Adding a place
   * should not throw away an arrangement the user made by hand — the screen
   * reconciles instead, keeping known ids in their order and putting anything
   * new at the end.
   */
  dayOrder: string[] | null;
  setDayOrder: (ids: string[]) => void;
  clearDayOrder: () => void;
  /**
   * Times the user fixed by hand, place id to minutes since midnight
   * (PRD F6, §3.4).
   *
   * The counterpart to `dayOrder`: that one says what comes after what,
   * this one says when. Both are the user overruling the optimiser, and
   * both leave it to do everything they did not ask about.
   *
   * Unlike `dayOrder` these are dropped as soon as the place leaves the
   * day. An order is about the day and survives it changing shape; a pin
   * is about one place, so once that place is gone the pin is a promise
   * with nothing to keep it about — and one that would come back to life
   * unannounced if the place were ever re-added.
   */
  pinnedTimes: Record<string, number>;
  setPinnedTime: (placeId: string, minutes: number) => void;
  clearPinnedTime: (placeId: string) => void;
  /**
   * Replace the lot. For adopting a shared day, where the times arrive with
   * the places and have to land after `setSelection` has cleared what was
   * there — setting them one at a time would leave a frame in which half of
   * someone else's day was pinned and half was not.
   */
  setPinnedTimes: (times: Record<string, number>) => void;
  /**
   * Whether AsyncStorage has answered yet.
   *
   * Zustand's persist middleware rehydrates asynchronously, so the first
   * render of every screen sees the defaults rather than what the user saved.
   * For most of this store that is invisible, but `dayOrder` decides whether
   * the optimiser may reorder the day at all: for one frame after launch a
   * hand-arranged day was solved as though it had never been arranged, so it
   * rendered in the optimiser's order and then jumped to the user's. Screens
   * that care wait for this.
   *
   * Never persisted — it describes this launch, not the user.
   */
  hydrated: boolean;
}

export const useTripStore = create<TripState>()(
  persist(
    (set) => ({
      startPlace: null,
      startPlaceEphemeral: false,
      anchorWasEphemeral: false,
      selectedPlaceIds: [],
      goal: 'balanced',
      dayStartMin: 9 * 60,
      homeByMin: LATEST_HOME_BY_MIN,
      hasCar: null,
      setHasCar: (v) => set({ hasCar: v }),
      setStartPlace: (sp, opts) =>
        set({
          startPlace: sp,
          startPlaceEphemeral: opts?.ephemeral ?? false,
          // Cleared by a durable anchor, so the explanation stops appearing
          // once there is nothing left to explain.
          anchorWasEphemeral: sp !== null && (opts?.ephemeral ?? false),
        }),
      togglePlace: (id) =>
        set((s) => {
          const removing = s.selectedPlaceIds.includes(id);
          const { [id]: _dropped, ...rest } = s.pinnedTimes;
          return {
            selectedPlaceIds: removing
              ? s.selectedPlaceIds.filter((x) => x !== id)
              : [...s.selectedPlaceIds, id],
            startDayStep: 0,
            dayStartedAt: null,
            dayIgnoresWindow: false,
            pinnedTimes: removing ? rest : s.pinnedTimes,
          };
        }),
      // Both of these replace the day wholesale — adopting a suggestion, or
      // opening someone else's link — so the times belong to a day that no
      // longer exists.
      setSelection: (ids) =>
        set({
          selectedPlaceIds: ids,
          startDayStep: 0,
          dayStartedAt: null,
          dayIgnoresWindow: false,
          pinnedTimes: {},
        }),
      clearSelection: () =>
        set({
          selectedPlaceIds: [],
          startDayStep: 0,
          dayStartedAt: null,
          dayIgnoresWindow: false,
          pinnedTimes: {},
        }),
      setGoal: (g) => set({ goal: g }),
      setDayWindow: (window) => set(clampDayWindow(window)),
      suggestionBias: 'familiar',
      setSuggestionBias: (b) => set({ suggestionBias: b }),
      startDayStep: 0,
      setStartDayStep: (step) => set({ startDayStep: Math.max(0, step) }),
      dayStartedAt: null,
      // Idempotent: opening Start day again mid-outing is coming back to it,
      // not setting off a second time, and restamping the clock would make
      // "since when" wrong.
      beginDayOut: () =>
        set((s) => (s.dayStartedAt === null ? { dayStartedAt: Date.now() } : s)),
      endDayOut: () =>
        set({ dayStartedAt: null, startDayStep: 0, dayIgnoresWindow: false }),
      dayIgnoresWindow: false,
      // The flag and the clock travel together, so nothing can be left
      // holding an override with no outing under it. Read back, the two are
      // checked together as well: an override belongs to the day that asked
      // for it, and it dies with that day.
      ignoreDayWindow: () =>
        set((s) => ({
          dayIgnoresWindow: true,
          dayStartedAt: s.dayStartedAt ?? Date.now(),
        })),
      dayOrder: null,
      setDayOrder: (ids) => set({ dayOrder: ids }),
      clearDayOrder: () => set({ dayOrder: null }),
      pinnedTimes: {},
      setPinnedTime: (placeId, minutes) =>
        set((s) => ({
          pinnedTimes: { ...s.pinnedTimes, [placeId]: minutes },
        })),
      setPinnedTimes: (times) => set({ pinnedTimes: times }),
      clearPinnedTime: (placeId) =>
        set((s) => {
          const { [placeId]: _dropped, ...rest } = s.pinnedTimes;
          return { pinnedTimes: rest };
        }),
      hydrated: false,
    }),
    {
      name: 'tripcircle-trip',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        // Ephemeral GPS anchors are never persisted (PRD §3.1).
        startPlace: s.startPlaceEphemeral ? null : s.startPlace,
        // The flag, never the fix. Storing the coarse location instead would
        // be the easy repair and is exactly what §3.1 forbids.
        anchorWasEphemeral: s.anchorWasEphemeral,
        selectedPlaceIds: s.selectedPlaceIds,
        goal: s.goal,
        dayStartMin: s.dayStartMin,
        homeByMin: s.homeByMin,
        hasCar: s.hasCar,
        suggestionBias: s.suggestionBias,
        startDayStep: s.startDayStep,
        dayStartedAt: s.dayStartedAt,
        dayIgnoresWindow: s.dayIgnoresWindow,
        dayOrder: s.dayOrder,
        pinnedTimes: s.pinnedTimes,
      }),
      /**
       * Fires once storage has answered, whether or not anything was stored.
       * The flag has to be set even on failure, or a first run with nothing
       * saved would wait for a rehydration that is never coming.
       */
      onRehydrateStorage: () => () => {
        useTripStore.setState({ hydrated: true });
      },
    }
  )
);

/** Ephemeral UI state: pin ↔ list-item linking (PRD §6). Not persisted. */
interface UiState {
  highlightedPlaceId: string | null;
  setHighlighted: (id: string | null) => void;
  /**
   * Suggestions the user has waved away this session (PRD §3.3.0.1, FD7).
   *
   * Deliberately not persisted, and there is no undo. Dismissing means "not
   * today", not "never again": the list dies with the session, which is what
   * keeps it from quietly becoming a permanent blocklist nobody can see. That
   * is also why nothing on screen offers to bring a dismissal back — the
   * recovery is closing the app, and an undo affordance would earn its space
   * only if the list outlived the session.
   */
  dismissedPlaceIds: string[];
  dismissSuggestion: (id: string) => void;
}

export const useUiStore = create<UiState>()((set) => ({
  highlightedPlaceId: null,
  setHighlighted: (id) => set({ highlightedPlaceId: id }),
  dismissedPlaceIds: [],
  dismissSuggestion: (id) =>
    set((s) =>
      s.dismissedPlaceIds.includes(id)
        ? s
        : { dismissedPlaceIds: [...s.dismissedPlaceIds, id] }
    ),
}));
