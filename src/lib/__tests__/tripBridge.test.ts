import { makeStartPlace } from '../geo';
import type { Landmark, StartPlace } from '../../domain/types';
import {
  detachFromTrip,
  installTripWriteBack,
  loadDayIntoPlanner,
} from '../tripBridge';
import { useTripStore } from '../../store/useTripStore';
import { useTripsStore } from '../../store/useTripsStore';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

/**
 * The borrow, and giving it back.
 *
 * While a trip day is open the planner is holding someone else's day and a
 * hotel as its start place, with the user's own anchor put aside. Every way
 * that borrow can end has to end it — and only the polite one did. The shelf
 * drops the pointer by itself when the day is removed or the trip deleted,
 * and those paths left the hotel installed as the anchor of every ordinary
 * day afterwards.
 */

const landmark = (id: string): Landmark => ({
  id,
  name: id,
  kind: 'station',
  location: { latitude: 37.78, longitude: -122.4 },
});

const home: StartPlace = makeStartPlace(landmark('home-station'));
const hotel: StartPlace = makeStartPlace(landmark('hotel'));

installTripWriteBack();

beforeEach(() => {
  useTripsStore.setState({ trips: [], activeDay: null, savedPlanner: null });
  useTripStore.setState({ selectedPlaceIds: [], dayOrder: null, pinnedTimes: {} });
  useTripStore.getState().setStartPlace(home);
});

/** A trip whose Day 1 stays at a hotel and holds one place. */
function tripWithStay() {
  const shelf = useTripsStore.getState();
  const trip = shelf.createTrip('Weekend');
  const dayId = trip.days[0].id;
  shelf.setDayStay(trip.id, dayId, hotel);
  shelf.updateDay(trip.id, {
    ...useTripsStore.getState().trips[0].days[0],
    placeIds: ['ferry-building'],
  });
  return { tripId: trip.id, dayId };
}

function openDayOne(tripId: string) {
  const trip = useTripsStore.getState().trips.find((t) => t.id === tripId)!;
  loadDayIntoPlanner(trip, 0);
}

describe('ending the borrow', () => {
  it('detaching gives back the anchor and the empty day', () => {
    const { tripId } = tripWithStay();
    openDayOne(tripId);
    expect(useTripStore.getState().startPlace?.id).toBe(hotel.id);

    detachFromTrip();

    expect(useTripStore.getState().startPlace?.id).toBe(home.id);
    expect(useTripStore.getState().selectedPlaceIds).toEqual([]);
    expect(useTripsStore.getState().savedPlanner).toBeNull();
    expect(useTripsStore.getState().activeDay).toBeNull();
  });

  it('removing the day being planned gives the anchor back too', () => {
    const { tripId, dayId } = tripWithStay();
    useTripsStore.getState().addDay(tripId);
    openDayOne(tripId);

    useTripsStore.getState().removeDay(tripId, dayId);

    expect(useTripsStore.getState().activeDay).toBeNull();
    expect(useTripStore.getState().startPlace?.id).toBe(home.id);
    expect(useTripStore.getState().selectedPlaceIds).toEqual([]);
    expect(useTripsStore.getState().savedPlanner).toBeNull();
  });

  it('deleting the trip being planned gives the anchor back too', () => {
    const { tripId } = tripWithStay();
    openDayOne(tripId);

    useTripsStore.getState().deleteTrip(tripId);

    expect(useTripsStore.getState().activeDay).toBeNull();
    expect(useTripStore.getState().startPlace?.id).toBe(home.id);
    expect(useTripsStore.getState().savedPlanner).toBeNull();
  });

  it('switching between days of one trip is not the end of the borrow', () => {
    const { tripId } = tripWithStay();
    useTripsStore.getState().addDay(tripId);
    openDayOne(tripId);
    const trip = useTripsStore.getState().trips.find((t) => t.id === tripId)!;

    loadDayIntoPlanner(trip, 1);

    // Day 2 has no stay of its own, so it inherits Day 1's hotel — and the
    // saved anchor is still the user's own, not Day 1's.
    expect(useTripsStore.getState().savedPlanner?.startPlace?.id).toBe(home.id);
    expect(useTripsStore.getState().activeDay?.dayId).toBe(trip.days[1].id);
    expect(useTripStore.getState().startPlace?.id).toBe(hotel.id);
  });

  it('choosing a stay reaches the day already open in the planner', () => {
    const shelf = useTripsStore.getState();
    const trip = shelf.createTrip('Weekend');
    const dayId = trip.days[0].id;
    openDayOne(trip.id);
    expect(useTripStore.getState().startPlace?.id).toBe(home.id);

    useTripsStore.getState().setDayStay(trip.id, dayId, hotel);

    expect(useTripStore.getState().startPlace?.id).toBe(hotel.id);
  });

  it('a stay given to an earlier day reaches the later day inheriting it', () => {
    const { tripId } = tripWithStay();
    useTripsStore.getState().addDay(tripId);
    const trip = useTripsStore.getState().trips.find((t) => t.id === tripId)!;
    loadDayIntoPlanner(trip, 1);
    expect(useTripStore.getState().startPlace?.id).toBe(hotel.id);

    // Day 1's stay changes; Day 2 inherits it and is the one on the table.
    const other = makeStartPlace(landmark('other-hotel'));
    useTripsStore.getState().setDayStay(tripId, trip.days[0].id, other);

    expect(useTripStore.getState().startPlace?.id).toBe(other.id);
  });

  it('a day removed while another is being planned changes nothing', () => {
    const { tripId } = tripWithStay();
    useTripsStore.getState().addDay(tripId);
    const trip = useTripsStore.getState().trips.find((t) => t.id === tripId)!;
    loadDayIntoPlanner(trip, 1);

    useTripsStore.getState().removeDay(tripId, trip.days[0].id);

    expect(useTripsStore.getState().activeDay?.dayId).toBe(trip.days[1].id);
    expect(useTripsStore.getState().savedPlanner?.startPlace?.id).toBe(home.id);
  });
});
