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
}

export const useTripStore = create<TripState>()(
  persist(
    (set) => ({
      startPlace: null,
      startPlaceEphemeral: false,
      selectedPlaceIds: [],
      goal: 'balanced',
      dayStartMin: 9 * 60,
      homeByMin: LATEST_HOME_BY_MIN,
      hasCar: null,
      setHasCar: (v) => set({ hasCar: v }),
      setStartPlace: (sp, opts) =>
        set({ startPlace: sp, startPlaceEphemeral: opts?.ephemeral ?? false }),
      togglePlace: (id) =>
        set((s) => ({
          selectedPlaceIds: s.selectedPlaceIds.includes(id)
            ? s.selectedPlaceIds.filter((x) => x !== id)
            : [...s.selectedPlaceIds, id],
        })),
      setSelection: (ids) => set({ selectedPlaceIds: ids }),
      clearSelection: () => set({ selectedPlaceIds: [] }),
      setGoal: (g) => set({ goal: g }),
      setDayWindow: (window) => set(clampDayWindow(window)),
      suggestionBias: 'familiar',
      setSuggestionBias: (b) => set({ suggestionBias: b }),
    }),
    {
      name: 'tripcircle-trip',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        // Ephemeral GPS anchors are never persisted (PRD §3.1).
        startPlace: s.startPlaceEphemeral ? null : s.startPlace,
        selectedPlaceIds: s.selectedPlaceIds,
        goal: s.goal,
        dayStartMin: s.dayStartMin,
        homeByMin: s.homeByMin,
        hasCar: s.hasCar,
        suggestionBias: s.suggestionBias,
      }),
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
