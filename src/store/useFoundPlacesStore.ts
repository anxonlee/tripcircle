import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { CuratedPlace } from '../domain/types';

/**
 * Places found through live search, kept so they stay resolvable.
 *
 * Without this, searching is a trap. A place found through Overpass exists
 * only in the results list; select it, close the app, and the id in the
 * selection points at nothing — the stop silently leaves the day, and a
 * stamp against it reads as a place PIRT no longer has. That is the same
 * failure the diary work fixed, arriving by a different door.
 *
 * The Google provider keeps its results in memory only, and must: PRD §12.2
 * forbids warehousing Google Places content beyond the id. OSM is ODbL, so
 * this data may be kept as long as it is attributed — which is why the free
 * provider can do the safe thing here and the paid one cannot.
 *
 * Capped, because a search box run often enough would otherwise fill the
 * device with places nobody chose.
 */

/** Roughly a year of ordinary searching, and a few hundred KB at most. */
export const FOUND_PLACES_CAP = 400;

interface FoundPlacesState {
  places: CuratedPlace[];
  /** Records results so they resolve later. Newest first, existing refreshed. */
  remember: (places: CuratedPlace[]) => void;
  clear: () => void;
}

export const useFoundPlacesStore = create<FoundPlacesState>()(
  persist(
    (set) => ({
      places: [],

      remember: (found) =>
        set((s) => {
          if (found.length === 0) return s;
          const incoming = new Map(found.map((p) => [p.id, p]));
          // Anything seen again is refreshed to the newer record and moves to
          // the front, so the cap sheds what has not been looked at in months
          // rather than what was simply found first.
          const kept = s.places.filter((p) => !incoming.has(p.id));
          return { places: [...found, ...kept].slice(0, FOUND_PLACES_CAP) };
        }),

      clear: () => set({ places: [] }),
    }),
    {
      name: 'pirt-found-places',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
