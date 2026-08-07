import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { StartPlace } from '../domain/types';
import type { Goal } from '../lib/optimizer';

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
  /** Day window (minutes since midnight). Cost is reported, never capped. */
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
}

export const useTripStore = create<TripState>()(
  persist(
    (set) => ({
      startPlace: null,
      startPlaceEphemeral: false,
      selectedPlaceIds: [],
      goal: 'balanced',
      dayStartMin: 9 * 60,
      homeByMin: 21 * 60,
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
      }),
    }
  )
);

/** Ephemeral UI state: pin ↔ list-item linking (PRD §6). Not persisted. */
interface UiState {
  highlightedPlaceId: string | null;
  setHighlighted: (id: string | null) => void;
}

export const useUiStore = create<UiState>()((set) => ({
  highlightedPlaceId: null,
  setHighlighted: (id) => set({ highlightedPlaceId: id }),
}));
