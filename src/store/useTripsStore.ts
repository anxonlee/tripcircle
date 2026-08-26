import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { StartPlace } from '../domain/types';
import {
  makeDay,
  makeTrip,
  movePlace,
  withDay,
  type Trip,
  type TripDay,
} from '../domain/trip';
import type { DayWindow } from '../lib/planner';
import { clampDayWindow } from '../lib/planner';

/**
 * Multi-day trips (PRD Phase 4). Plural on purpose, and worth saying out
 * loud because the name is one letter from `useTripStore`: THAT store is the
 * single day currently being planned — misnamed by history — and THIS one is
 * the shelf of multi-day trips. The bridge between them lives in
 * `lib/tripBridge.ts`, and nothing else should couple the two.
 */
interface TripsState {
  trips: Trip[];
  /**
   * Which trip day the single-day planner is currently editing, if any.
   * Null means the planner is doing what it always did: one ad-hoc day.
   *
   * Persisted, because the bridge writes planner edits back through this
   * pointer, and a day out runs for hours across many launches — losing the
   * pointer would not lose data, but every edit after a relaunch would
   * silently stop reaching the trip.
   */
  activeDay: { tripId: string; dayId: string } | null;
  createTrip: (name: string) => Trip;
  renameTrip: (tripId: string, name: string) => void;
  deleteTrip: (tripId: string) => void;
  addDay: (tripId: string) => void;
  /**
   * Removing a day keeps the trip legal: a trip always has at least one day,
   * so removing the last one clears it instead. The active pointer is
   * dropped when it pointed at the removed day.
   */
  removeDay: (tripId: string, dayId: string) => void;
  setDayStay: (tripId: string, dayId: string, stay: StartPlace | null) => void;
  setDayWindow: (tripId: string, dayId: string, window: DayWindow) => void;
  movePlaceBetweenDays: (
    tripId: string,
    placeId: string,
    fromDayId: string,
    toDayId: string
  ) => void;
  removePlaceFromDay: (tripId: string, dayId: string, placeId: string) => void;
  /** The bridge's write-back door. Replaces the day wholesale. */
  updateDay: (tripId: string, day: TripDay) => void;
  setActiveDay: (ptr: { tripId: string; dayId: string } | null) => void;
  hydrated: boolean;
}

function mapTrip(
  trips: Trip[],
  tripId: string,
  f: (t: Trip) => Trip
): Trip[] {
  return trips.map((t) => (t.id === tripId ? f(t) : t));
}

export const useTripsStore = create<TripsState>()(
  persist(
    (set, get) => ({
      trips: [],
      activeDay: null,
      createTrip: (name) => {
        const trip = makeTrip(name.trim() || 'Trip');
        set((s) => ({ trips: [trip, ...s.trips] }));
        return trip;
      },
      renameTrip: (tripId, name) =>
        set((s) => ({
          trips: mapTrip(s.trips, tripId, (t) => ({
            ...t,
            name: name.trim() || t.name,
          })),
        })),
      deleteTrip: (tripId) =>
        set((s) => ({
          trips: s.trips.filter((t) => t.id !== tripId),
          activeDay: s.activeDay?.tripId === tripId ? null : s.activeDay,
        })),
      addDay: (tripId) =>
        set((s) => ({
          trips: mapTrip(s.trips, tripId, (t) => ({
            ...t,
            days: [...t.days, makeDay()],
          })),
        })),
      removeDay: (tripId, dayId) =>
        set((s) => ({
          trips: mapTrip(s.trips, tripId, (t) => {
            const days = t.days.filter((d) => d.id !== dayId);
            return { ...t, days: days.length > 0 ? days : [makeDay()] };
          }),
          activeDay: s.activeDay?.dayId === dayId ? null : s.activeDay,
        })),
      setDayStay: (tripId, dayId, stay) =>
        set((s) => ({
          trips: mapTrip(s.trips, tripId, (t) => {
            const day = t.days.find((d) => d.id === dayId);
            return day ? withDay(t, { ...day, stay }) : t;
          }),
        })),
      setDayWindow: (tripId, dayId, window) =>
        set((s) => ({
          trips: mapTrip(s.trips, tripId, (t) => {
            const day = t.days.find((d) => d.id === dayId);
            return day
              ? withDay(t, { ...day, window: clampDayWindow(window) })
              : t;
          }),
        })),
      movePlaceBetweenDays: (tripId, placeId, fromDayId, toDayId) =>
        set((s) => ({
          trips: mapTrip(s.trips, tripId, (t) =>
            movePlace(t, placeId, fromDayId, toDayId)
          ),
        })),
      removePlaceFromDay: (tripId, dayId, placeId) =>
        set((s) => ({
          trips: mapTrip(s.trips, tripId, (t) => {
            const day = t.days.find((d) => d.id === dayId);
            if (!day) return t;
            const { [placeId]: _dropped, ...pins } = day.pinnedTimes;
            return withDay(t, {
              ...day,
              placeIds: day.placeIds.filter((id) => id !== placeId),
              dayOrder: day.dayOrder
                ? day.dayOrder.filter((id) => id !== placeId)
                : null,
              pinnedTimes: pins,
            });
          }),
        })),
      updateDay: (tripId, day) =>
        set((s) => ({
          trips: mapTrip(s.trips, tripId, (t) => withDay(t, day)),
        })),
      setActiveDay: (ptr) => set({ activeDay: ptr }),
      hydrated: false,
    }),
    {
      name: 'tripcircle-trips',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        // Stays are durable places by construction — the picker only offers
        // landmarks — so persisting them whole is inside §3.1. Nothing
        // ephemeral can reach this store: there is no code path that puts a
        // GPS anchor into a day.
        trips: s.trips,
        activeDay: s.activeDay,
      }),
      onRehydrateStorage: () => () => {
        useTripsStore.setState({ hydrated: true });
      },
    }
  )
);
