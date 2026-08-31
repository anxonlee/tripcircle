import {
  dayFromPlanner,
  plannerMatchesDay,
  stayForDay,
  type Trip,
} from '../domain/trip';
import { useTripStore } from '../store/useTripStore';
import { useTripsStore } from '../store/useTripsStore';

/**
 * The bridge between the trips shelf and the single-day planner — the one
 * file allowed to know both stores exist.
 *
 * Opening a trip day copies it into `useTripStore`, and from that moment
 * every screen the planner powers works on it unchanged: Explore toggles its
 * places, Plan orders and pins it, Start day walks it, stamping stamps it.
 * None of them learn trips exist. Edits return through a store subscription
 * that maps the planner's state back into the day and writes it to the
 * shelf.
 *
 * The write-back is one-directional and keyed on `activeDay`: while the
 * pointer is set the planner is the day's editor, and when it is null the
 * planner is what it always was, an ad-hoc single day.
 */

/*
 * What the bridge saves of the user's own state lives in the trips store
 * (`savedPlanner`), because the borrow it undoes is persistent: a trip runs
 * for days across many launches. Only the start place and the window flag
 * are saved. The selection is deliberately not — opening a trip day
 * replaces the day on the table exactly the way opening a shared link does,
 * behind the same confirm. But the start place is not day state: it is
 * where the user lives their ordinary days from, and a trip stay
 * overwriting it for good would mean coming home from Tokyo anchored to a
 * hotel there.
 */

/**
 * True while `loadDayIntoPlanner` is mid-copy. Loading is several store
 * writes in a row, and the subscription below fires on each; without the
 * guard, the half-loaded states write back over the day they are being
 * loaded from — the step after `setSelection` clears the pins, and that
 * cleared map reached the shelf before `setPinnedTimes` restored it.
 */
let loading = false;

export function loadDayIntoPlanner(trip: Trip, dayIndex: number): void {
  const day = trip.days[dayIndex];
  if (!day) return;
  const planner = useTripStore.getState();
  const shelf = useTripsStore.getState();

  loading = true;
  try {
    // Save the user's own anchor once, not per open: switching from Day 2 to
    // Day 3 must not save Day 2's stay as though it were home. Inside the
    // guard, because saving it is itself a shelf write, and `syncFromShelf`
    // reads a set `savedPlanner` with no pointer as a borrow to undo.
    if (shelf.savedPlanner === null) {
      shelf.setSavedPlanner({
        startPlace: planner.startPlace,
        dayWindowSet: planner.dayWindowSet,
      });
    }
    const saved = useTripsStore.getState().savedPlanner;
    const stay = stayForDay(trip, dayIndex);
    if (stay) {
      planner.setStartPlace(stay);
    } else if (saved?.startPlace) {
      // A stay-less day plans from the user's usual anchor — which may have
      // been replaced by a previous day's stay, so it is put back.
      planner.setStartPlace(saved.startPlace);
    }
    planner.setSelection(day.placeIds);
    if (day.dayOrder) planner.setDayOrder(day.dayOrder);
    else planner.clearDayOrder();
    planner.setDayWindow(day.window);
    planner.setGoal(day.goal);
    // After setSelection, which clears pins; inside the window, which gives
    // them meaning. Same ordering as link adoption, same reasons.
    planner.setPinnedTimes(day.pinnedTimes);
    shelf.setActiveDay({ tripId: trip.id, dayId: day.id });
  } finally {
    loading = false;
  }
  // One deliberate write-back now that the copy is whole, so the shelf and
  // the planner agree from the first frame rather than after the next edit.
  writeBack();
}

/**
 * The trip lets go of the planner. The selection is cleared — leaving the
 * day's places behind with the write-back disconnected would invite edits
 * that silently reach nothing — and the user's own anchor and window flag
 * come back.
 */
export function detachFromTrip(): void {
  const shelf = useTripsStore.getState();
  if (shelf.activeDay === null) return;
  // Guarded, so the shelf subscription does not race this to the same
  // restore: dropping the pointer is exactly the signal `syncFromShelf`
  // watches for.
  loading = true;
  try {
    shelf.setActiveDay(null);
  } finally {
    loading = false;
  }
  restoreOwnPlanner();
}

/**
 * Give the planner back to its owner: the day's places go, and the anchor
 * and window flag saved when the trip borrowed it come back.
 *
 * Separate from `detachFromTrip` because letting go is not always the user
 * saying so. The shelf drops the pointer on its own when the day being
 * planned is removed, when its trip is deleted, and when the write-back
 * finds the day gone — and each of those left the borrow standing: the
 * planner kept the trip's places and, worse, kept a hotel installed as the
 * start place every ordinary day afterwards was planned from.
 *
 * Safe to call with nothing saved, which is what makes it safe to hang off
 * a subscription: with no `savedPlanner` there is no borrow, and the day's
 * places are the user's own.
 */
function restoreOwnPlanner(): void {
  const shelf = useTripsStore.getState();
  const saved = shelf.savedPlanner;
  if (!saved) return;
  const planner = useTripStore.getState();
  loading = true;
  try {
    planner.clearSelection();
    // Even when the saved anchor is null: a user who never set one must not
    // come home from a trip owning its last hotel as one.
    planner.setStartPlace(saved.startPlace);
    useTripStore.setState({ dayWindowSet: saved.dayWindowSet });
  } finally {
    loading = false;
  }
  shelf.setSavedPlanner(null);
}

function writeBack(): void {
  const shelf = useTripsStore.getState();
  const ptr = shelf.activeDay;
  if (!ptr || loading) return;
  const trip = shelf.trips.find((t) => t.id === ptr.tripId);
  const day = trip?.days.find((d) => d.id === ptr.dayId);
  if (!trip || !day) {
    // The day was deleted out from under the planner. Nothing to write to,
    // and a dangling pointer would make the next edit look like it saved.
    // Clearing it hands the restore to `syncFromShelf`, the same way any
    // other shelf-side drop of the pointer is handled.
    shelf.setActiveDay(null);
    return;
  }
  const p = useTripStore.getState();
  const snapshot = {
    placeIds: p.selectedPlaceIds,
    dayOrder: p.dayOrder,
    pinnedTimes: p.pinnedTimes,
    window: { dayStartMin: p.dayStartMin, homeByMin: p.homeByMin },
    goal: p.goal,
  };
  // Stamping and Start day churn planner fields this mapping ignores; a
  // write per churn would re-render every trips subscriber for nothing.
  if (plannerMatchesDay(day, snapshot)) return;
  shelf.updateDay(trip.id, dayFromPlanner(day, snapshot));
}

/**
 * The other direction, and it exists because leaving it out corrupted data.
 *
 * The write-back alone made the planner the only writer of the active day.
 * But the trip screen can edit that same day — move a place to another day,
 * remove one, change the stay or the window — and the planner never heard
 * about it. Worse than a stale screen: the next planner edit wrote its
 * unchanged selection straight back over the change. Observed moving La
 * Taqueria from Day 1 to Day 2, then tapping an objective — the move was
 * undone on Day 1 and kept on Day 2, so one place sat on both days.
 *
 * So a shelf-side change to the active day is reloaded into the planner.
 * The shelf wins here, and that is the right way round: the planner's own
 * edits have already been written back by the time this runs, so any
 * difference left is one the shelf introduced.
 *
 * It cannot ping-pong. A planner edit reconciles the two before this sees
 * them, so the comparison finds them equal and does nothing; a shelf edit
 * reloads once, after which the planner matches the day and the write-back
 * finds nothing to write.
 */
function syncFromShelf(): void {
  const shelf = useTripsStore.getState();
  const ptr = shelf.activeDay;
  if (loading) return;
  if (!ptr) {
    // The shelf let go without being asked: the day being planned was
    // removed, or its trip was deleted. Undo the borrow here rather than in each of those
    // actions — the trips store is not allowed to know the planner exists,
    // and a path added later would otherwise leak the anchor again.
    restoreOwnPlanner();
    return;
  }
  const trip = shelf.trips.find((t) => t.id === ptr.tripId);
  const index = trip?.days.findIndex((d) => d.id === ptr.dayId) ?? -1;
  const day = index >= 0 ? trip!.days[index] : undefined;
  if (!trip || !day) return;
  const p = useTripStore.getState();
  const matches = plannerMatchesDay(day, {
    placeIds: p.selectedPlaceIds,
    dayOrder: p.dayOrder,
    pinnedTimes: p.pinnedTimes,
    window: { dayStartMin: p.dayStartMin, homeByMin: p.homeByMin },
    goal: p.goal,
  });
  /**
   * The stay is compared separately because it is not part of the day the
   * planner holds — it arrives as the planner's start place and nothing maps
   * it back. So `plannerMatchesDay` cannot see it move, and choosing a stay
   * for the day open in the Plan tab did nothing at all until it was next
   * reopened: the card said the hotel, the route still ran from the old
   * anchor, and neither screen admitted the disagreement.
   *
   * Resolved, not raw, so inheriting also counts: giving Day 1 a hotel moves
   * where Day 2 starts, and Day 2 may be the one on the table.
   *
   * The comparison is skipped when nothing is expected, which is exactly
   * when `loadDayIntoPlanner` leaves the start place alone — a stay-less day
   * belonging to a user who has never set an anchor. Checking there would
   * ask for a reload that changes nothing, forever.
   */
  const expected = stayForDay(trip, index) ?? shelf.savedPlanner?.startPlace ?? null;
  const anchorMoved = expected !== null && p.startPlace?.id !== expected.id;
  if (matches && !anchorMoved) return;
  loadDayIntoPlanner(trip, index);
}

let installed = false;

/**
 * Installed once, at the root. The subscriptions outlive every screen
 * because the day out they serve does: edits from Explore, Plan and Start
 * day all pass through here whether or not any trip screen is mounted.
 */
export function installTripWriteBack(): void {
  if (installed) return;
  installed = true;
  useTripStore.subscribe(() => writeBack());
  useTripsStore.subscribe(() => syncFromShelf());
}


