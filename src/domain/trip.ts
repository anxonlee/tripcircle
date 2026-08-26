import type { StartPlace } from './types';
import type { Goal } from '../lib/optimizer';
import { clampDayWindow, type DayWindow } from '../lib/planner';

/**
 * A multi-day trip (PRD §14 Phase 4; §266 "drag places onto days").
 *
 * A trip is a container of days, and a day is exactly what the single-day
 * planner already plans: a selection, a window, an order, pinned times, a
 * goal. Nothing here schedules anything — the optimiser stays the only thing
 * that does, and it is handed one day at a time. That is the whole design:
 * the planner never learns trips exist, so every screen it powers (Explore,
 * Plan, Start day, stamping) works on a trip day unchanged.
 *
 * Days are ordinal — "Day 1", "Day 2" — not calendar dates. Nothing in the
 * model varies by weekday: `openHours` carries no per-day dimension, so a
 * date would change what the screen prints and nothing about what the
 * planner produces. When hours gain weekdays, dates earn their place; not
 * before.
 *
 * THE STAY is the multi-stay part, and it is the day's anchor: where that
 * day starts and returns to. `null` means "same as the day before", resolved
 * by `stayForDay`, so a three-nights-then-move trip is two assignments, not
 * five. A stay is a durable place only — §3.1 forbids persisting an
 * ephemeral GPS anchor, and a trip is nothing but persistence.
 *
 * A stay is also NEVER serialized into a share link. §3.1 keeps start
 * places out of links; a stay is where someone sleeps, which is strictly
 * more sensitive than where they set out from. Same rule, same mechanism as
 * `tripLink`: there is no field for it in the payload.
 */

export interface TripDay {
  id: string;
  /** The day's selection, in the order the user picked (not walk order). */
  placeIds: string[];
  /** Hand-arranged order, or null when the optimiser may sequence. */
  dayOrder: string[] | null;
  /** Times fixed by hand, place id → minutes since midnight. */
  pinnedTimes: Record<string, number>;
  window: DayWindow;
  goal: Goal;
  /** Where this day starts, or null to inherit — see `stayForDay`. */
  stay: StartPlace | null;
}

export interface Trip {
  id: string;
  name: string;
  days: TripDay[];
  createdAt: number;
}

let seq = 0;
/**
 * Ids only need to be unique within one device's store, and they must not
 * come from Math.random in anything a workflow might replay. Time plus a
 * counter is enough: two calls in one millisecond still differ.
 */
export function tripId(now: number = Date.now()): string {
  seq += 1;
  return `t${now.toString(36)}${seq.toString(36)}`;
}

export const DEFAULT_DAY_WINDOW: DayWindow = {
  dayStartMin: 9 * 60,
  homeByMin: 20 * 60,
};

/**
 * A fixed morning, deliberately — unlike the single-day store, which
 * defaults its start to now. That default answers "when could I leave
 * today"; a trip's days are not today, and "not before now" applied to Day 3
 * of a trip planned on a Tuesday evening would be nonsense on all three
 * counts.
 */
export function makeDay(now?: number): TripDay {
  return {
    id: tripId(now),
    placeIds: [],
    dayOrder: null,
    pinnedTimes: {},
    window: { ...DEFAULT_DAY_WINDOW },
    goal: 'balanced',
    stay: null,
  };
}

export function makeTrip(name: string, now: number = Date.now()): Trip {
  return {
    id: tripId(now),
    name,
    // One day, not zero: an empty trip has nothing to tap, and the first
    // thing anyone does with a new trip is put something in Day 1.
    days: [makeDay(now)],
    createdAt: now,
  };
}

/**
 * The stay a given day actually starts from: its own, or the nearest earlier
 * day's. Returns null when no day up to here has one — the caller falls back
 * to the user's usual start place, which keeps a stay-less trip working
 * exactly like today's single days.
 */
export function stayForDay(trip: Trip, dayIndex: number): StartPlace | null {
  for (let i = Math.min(dayIndex, trip.days.length - 1); i >= 0; i--) {
    const stay = trip.days[i]?.stay;
    if (stay) return stay;
  }
  return null;
}

/** Replace one day, immutably. Unknown ids return the trip unchanged. */
export function withDay(trip: Trip, day: TripDay): Trip {
  const i = trip.days.findIndex((d) => d.id === day.id);
  if (i < 0) return trip;
  const days = trip.days.slice();
  days[i] = day;
  return { ...trip, days };
}

/**
 * Move a place from one day to another, dropping its pin and its slot in any
 * hand-made order. The pin dies for the same reason `togglePlace` kills it
 * in the single-day store: a pin is about one place *on one day*, and
 * carried across it would come back to life unannounced. The order entry
 * dies because an order is a statement about a day, and this place is no
 * longer part of that statement.
 *
 * Adding to the target appends — the same rule the Plan screen applies when
 * a selection grows: never rearrange what the user arranged.
 */
export function movePlace(
  trip: Trip,
  placeId: string,
  fromDayId: string,
  toDayId: string
): Trip {
  if (fromDayId === toDayId) return trip;
  const from = trip.days.find((d) => d.id === fromDayId);
  const to = trip.days.find((d) => d.id === toDayId);
  if (!from || !to || !from.placeIds.includes(placeId)) return trip;
  if (to.placeIds.includes(placeId)) {
    // Already there: this is a removal from the source, not a copy.
    return withDay(trip, removePlaceFromDay(from, placeId));
  }
  return withDay(
    withDay(trip, removePlaceFromDay(from, placeId)),
    { ...to, placeIds: [...to.placeIds, placeId] }
  );
}

function removePlaceFromDay(day: TripDay, placeId: string): TripDay {
  const { [placeId]: _dropped, ...pins } = day.pinnedTimes;
  return {
    ...day,
    placeIds: day.placeIds.filter((id) => id !== placeId),
    dayOrder: day.dayOrder ? day.dayOrder.filter((id) => id !== placeId) : null,
    pinnedTimes: pins,
  };
}

/**
 * Take the single-day store's state back into a trip day. The one door
 * through which the planner's edits return, so it is the one place the
 * invariants are enforced: the window is clamped, the order is either null
 * or a permutation-plus-additions the day recognises, and an ephemeral
 * anchor never lands in `stay` — the bridge passes the resolved stay out but
 * only a durable choice comes back.
 */
export function dayFromPlanner(
  day: TripDay,
  s: {
    placeIds: string[];
    dayOrder: string[] | null;
    pinnedTimes: Record<string, number>;
    window: DayWindow;
    goal: Goal;
  }
): TripDay {
  return {
    ...day,
    placeIds: s.placeIds,
    dayOrder: s.dayOrder,
    pinnedTimes: s.pinnedTimes,
    window: clampDayWindow(s.window),
    goal: s.goal,
  };
}
