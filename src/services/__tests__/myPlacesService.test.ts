// The store persists, and AsyncStorage reaches for `window` under Node. The
// tests here are about what the service returns, not about what survives a
// restart, so the storage is stubbed rather than exercised.
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async () => null,
    setItem: async () => undefined,
    removeItem: async () => undefined,
  },
}));

import { draftToPlace, type MyPlace, type MyPlaceDraft } from '../../lib/myPlace';
import { useMyPlacesStore } from '../../store/useMyPlacesStore';
import type { LatLng } from '../../domain/types';
import { haversineKm } from '../../lib/geo';
import { listPlacesForHistory, placesService } from '../places';

/**
 * The user's own places, seen through the service every screen uses.
 *
 * These exist because of two bugs found by using the app rather than by
 * reading it: a stamped place vanishing from the diary, and a removed place
 * still being counted in the day. Both were invisible to the unit tests of
 * the pure module, which were all passing at the time.
 */

const draft = (over: Partial<MyPlaceDraft> = {}): MyPlaceDraft => ({
  name: 'Corner Cafe',
  location: { latitude: 37.775, longitude: -122.42 },
  theme: 'cafe',
  stay: 'visit',
  priceBand: '$',
  hours: { kind: 'unknown' },
  ...over,
});

const make = (id: string, over: Partial<MyPlaceDraft> = {}): MyPlace =>
  draftToPlace(draft(over), 'Mission', id, 1_700_000_000_000);

beforeEach(() => {
  useMyPlacesStore.getState().replaceAll([]);
});

describe('places service with the user’s own places', () => {
  it('lists them alongside the dataset', async () => {
    const before = (await placesService.listPlaces()).length;
    useMyPlacesStore.getState().add(make('mine-a-1'));
    const after = await placesService.listPlaces();
    expect(after).toHaveLength(before + 1);
    expect(after.some((p) => p.id === 'mine-a-1')).toBe(true);
  });

  it('finds them by name', async () => {
    useMyPlacesStore.getState().add(make('mine-a-1'));
    const hits = await placesService.searchPlaces('corner caf');
    expect(hits.some((p) => p.id === 'mine-a-1')).toBe(true);
  });

  it('offers them for stamping when you are stood next to one', async () => {
    useMyPlacesStore.getState().add(make('mine-a-1'));
    const near = await placesService.nearbyPlaces(
      { latitude: 37.775, longitude: -122.42 },
      1
    );
    expect(near[0].id).toBe('mine-a-1');
  });

  it('keeps nearby in distance order after merging', async () => {
    useMyPlacesStore.getState().add(
      make('mine-far-1', { location: { latitude: 37.79, longitude: -122.41 } })
    );
    const from = { latitude: 37.7955, longitude: -122.3937 };
    const near = await placesService.nearbyPlaces(from, 5);
    // Measured the way the service measures. Flat lat/lon disagrees with
    // haversine at this latitude, where a degree of longitude is the shorter.
    const km = (p: { location: LatLng }) => haversineKm(from, p.location);
    for (let i = 1; i < near.length; i++) {
      expect(km(near[i])).toBeGreaterThanOrEqual(km(near[i - 1]) - 1e-9);
    }
  });

  it('takes a removed place out of planning', async () => {
    useMyPlacesStore.getState().add(make('mine-a-1'));
    useMyPlacesStore.getState().hide('mine-a-1');
    const all = await placesService.listPlaces();
    expect(all.some((p) => p.id === 'mine-a-1')).toBe(false);
  });

  it('still resolves a removed place by id, so a stamp keeps its name', async () => {
    useMyPlacesStore.getState().add(make('mine-a-1'));
    useMyPlacesStore.getState().hide('mine-a-1');
    const place = await placesService.getPlace('mine-a-1');
    expect(place?.name).toBe('Corner Cafe');
  });

  it('leaves the dataset alone when the user has added nothing', async () => {
    const all = await placesService.listPlaces();
    expect(all.every((p) => p.source !== 'mine')).toBe(true);
  });
});

describe('listPlacesForHistory', () => {
  it('carries a place the user added, so a stamp against it is not "Unknown place"', async () => {
    // The bug: the wall and the diary list read the seed dataset directly, so
    // a visit to a place the user added rendered as Unknown and the wall card
    // never appeared — which reads as the diary having lost the visit.
    useMyPlacesStore.getState().add(make('mine-a-1'));
    const all = await listPlacesForHistory();
    expect(all.find((p) => p.id === 'mine-a-1')?.name).toBe('Corner Cafe');
  });

  it('carries a place the user removed, because the visit still happened', async () => {
    useMyPlacesStore.getState().add(make('mine-a-1'));
    useMyPlacesStore.getState().hide('mine-a-1');
    const all = await listPlacesForHistory();
    expect(all.some((p) => p.id === 'mine-a-1')).toBe(true);
  });

  it('does not list a place twice', async () => {
    useMyPlacesStore.getState().add(make('mine-a-1'));
    const ids = (await listPlacesForHistory()).map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('includes everything planning can see', async () => {
    useMyPlacesStore.getState().add(make('mine-a-1'));
    const planning = await placesService.listPlaces();
    const history = new Set((await listPlacesForHistory()).map((p) => p.id));
    expect(planning.every((p) => history.has(p.id))).toBe(true);
  });
});
