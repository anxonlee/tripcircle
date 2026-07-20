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
  selectedPlaceIds: string[];
  goal: Goal;
  /** Day window + budget (minutes since midnight / yen). Fixed defaults for now. */
  dayStartMin: number;
  homeByMin: number;
  budgetCapYen: number;
  setStartPlace: (sp: StartPlace | null) => void;
  togglePlace: (id: string) => void;
  clearSelection: () => void;
  setGoal: (g: Goal) => void;
}

export const useTripStore = create<TripState>()(
  persist(
    (set) => ({
      startPlace: null,
      selectedPlaceIds: [],
      goal: 'balanced',
      dayStartMin: 9 * 60,
      homeByMin: 21 * 60,
      budgetCapYen: 15000,
      setStartPlace: (sp) => set({ startPlace: sp }),
      togglePlace: (id) =>
        set((s) => ({
          selectedPlaceIds: s.selectedPlaceIds.includes(id)
            ? s.selectedPlaceIds.filter((x) => x !== id)
            : [...s.selectedPlaceIds, id],
        })),
      clearSelection: () => set({ selectedPlaceIds: [] }),
      setGoal: (g) => set({ goal: g }),
    }),
    {
      name: 'tripcircle-trip',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        startPlace: s.startPlace,
        selectedPlaceIds: s.selectedPlaceIds,
        goal: s.goal,
        dayStartMin: s.dayStartMin,
        homeByMin: s.homeByMin,
        budgetCapYen: s.budgetCapYen,
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
