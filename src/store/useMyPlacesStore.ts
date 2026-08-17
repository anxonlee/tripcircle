import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { MyPlace } from '../lib/myPlace';

/**
 * Places the user added for themselves.
 *
 * Its own store rather than a corner of the trip store, because it is a
 * library the user owns and not part of any one day. Clearing a day out, or
 * adopting a shared one, must never take someone's café with it — keeping
 * the two apart makes that structural rather than something each action has
 * to remember.
 *
 * Local only. Nothing here is uploaded or shared; a day plan that includes
 * one of these travels as an id the recipient will not resolve, which is the
 * correct outcome and already handled by lib/tripLink.
 */

interface MyPlacesState {
  places: MyPlace[];
  add: (place: MyPlace) => void;
  rename: (id: string, name: string) => void;
  /**
   * Puts a place away. Soft on purpose: the diary keys visits by place id,
   * so deleting outright would orphan every stamp against it. Hidden places
   * leave Explore and planning and stay resolvable for the wall.
   */
  hide: (id: string) => void;
  restore: (id: string) => void;
  /** Replaces the list after a restore. Merging is the caller's decision. */
  replaceAll: (places: MyPlace[]) => void;
}

export const useMyPlacesStore = create<MyPlacesState>()(
  persist(
    (set) => ({
      places: [],

      add: (place) => set((s) => ({ places: [place, ...s.places] })),

      rename: (id, name) =>
        set((s) => ({
          places: s.places.map((p) =>
            p.id === id ? { ...p, name: name.trim() } : p
          ),
        })),

      hide: (id) =>
        set((s) => ({
          places: s.places.map((p) => (p.id === id ? { ...p, hidden: true } : p)),
        })),

      restore: (id) =>
        set((s) => ({
          places: s.places.map((p) => (p.id === id ? { ...p, hidden: false } : p)),
        })),

      replaceAll: (places) => set({ places }),
    }),
    {
      /**
       * As with the diary key, this is storage rather than a label. Renaming
       * it does not migrate anything — it points the app at an empty key and
       * every place already saved on a device silently disappears.
       */
      name: 'pirt-my-places',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

/** Everything still in play, newest first. */
export function visibleMyPlaces(places: readonly MyPlace[]): MyPlace[] {
  return places.filter((p) => !p.hidden);
}
