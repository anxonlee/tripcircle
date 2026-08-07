import type { LegEstimate, StartPlace, TransportMode } from '../../domain/types';
import type { DayPlan, PlannedStop } from '../optimizer';
import {
  dayMapsTravelMode,
  dayOverviewMisstatesTransit,
  droppedStopsWarning,
  googleMapsDirUrl,
  googleMapsStopUrl,
  WAYPOINT_LIMIT_APP,
  WAYPOINT_LIMIT_BROWSER,
  waypointLimit,
} from '../maps';

const anchor: StartPlace = {
  id: 'lm-powell-station',
  name: 'Powell St Station',
  kind: 'station',
  location: { latitude: 37.784, longitude: -122.408 },
};

const leg = (mode: TransportMode, durationMin: number): LegEstimate => ({
  mode,
  durationMin,
  costUsd: 0,
  distanceKm: 1,
});

const stop = (
  id: string,
  latitude: number,
  longitude: number,
  legMode: TransportMode = 'muni',
  legMin = 10
): PlannedStop =>
  ({
    place: { id, name: id, location: { latitude, longitude } },
    leg: leg(legMode, legMin),
    order: 1,
    arriveMin: 0,
    beginMin: 0,
    departMin: 0,
    waitMin: 0,
    warnings: [],
  }) as unknown as PlannedStop;

const planWith = (stops: PlannedStop[], returnLeg: LegEstimate | null = null): DayPlan =>
  ({
    goal: 'balanced',
    startPlace: anchor,
    dayStartMin: 540,
    stops,
    returnLeg,
    homeMin: 1020,
    totals: { travelMin: 0, waitMin: 0, travelUsd: 0, totalUsd: 0 },
    warnings: [],
  }) as unknown as DayPlan;

describe('googleMapsDirUrl', () => {
  it('builds a round trip from the anchor through every stop in order', () => {
    const { url } = googleMapsDirUrl(
      anchor,
      planWith([stop('a', 37.7955, -122.3937), stop('b', 37.8024, -122.4058)])
    );
    expect(url).toContain('origin=37.784%2C-122.408');
    expect(url).toContain('destination=37.784%2C-122.408');
    // Waypoints stay in plan order, pipe-separated.
    expect(decodeURIComponent(url.split('waypoints=')[1])).toBe(
      '37.7955,-122.3937|37.8024,-122.4058'
    );
  });

  it('omits waypoints entirely for a plan with no stops', () => {
    const { url } = googleMapsDirUrl(anchor, planWith([]));
    expect(url).not.toContain('waypoints');
  });

  /**
   * The bug this guards: Google's transit engine ignores waypoints, so a
   * multi-stop transit loop returns "No routes found". The overview must
   * never ask for transit, however transit-heavy the day is.
   */
  it('never requests transit, because transit ignores waypoints', () => {
    const allBart = planWith(
      [stop('a', 37.79, -122.39, 'bart', 40), stop('b', 37.8, -122.4, 'muni', 30)],
      leg('ferry', 25)
    );
    const { url } = googleMapsDirUrl(anchor, allBart);
    expect(url).not.toContain('transit');
    expect(url).toContain('travelmode=driving');
  });

  it('walks the overview only when every leg was walked', () => {
    const allWalk = planWith(
      [stop('a', 37.79, -122.39, 'walk', 10), stop('b', 37.8, -122.4, 'walk', 12)],
      leg('walk', 15)
    );
    expect(dayMapsTravelMode(allWalk)).toBe('walking');
    expect(googleMapsDirUrl(anchor, allWalk).url).toContain('travelmode=walking');

    // A single non-walking leg is enough to disqualify a walking overview.
    const oneBart = planWith(
      [stop('a', 37.79, -122.39, 'walk', 10), stop('b', 37.8, -122.4, 'bart', 25)],
      leg('walk', 15)
    );
    expect(dayMapsTravelMode(oneBart)).toBe('driving');
  });

  it('flags when the driving overview misstates a transit day', () => {
    const transitDay = planWith([stop('a', 37.79, -122.39, 'bart', 30)], leg('walk', 10));
    expect(dayOverviewMisstatesTransit(transitDay)).toBe(true);

    const drivingDay = planWith([stop('a', 37.79, -122.39, 'drive', 30)], leg('walk', 10));
    expect(dayOverviewMisstatesTransit(drivingDay)).toBe(false);
  });

  /**
   * The limit differs by target and Google drops the excess in silence, so
   * the caller is handed what will not fit rather than left to discover it.
   */
  it('trims to the limit it is given and names what it dropped', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      stop(`s${i}`, 37.7 + i / 1000, -122.4)
    );
    const plan = planWith(many);

    const inApp = googleMapsDirUrl(anchor, plan, WAYPOINT_LIMIT_APP);
    const appWaypoints = decodeURIComponent(
      inApp.url.split('waypoints=')[1]
    ).split('|');
    expect(appWaypoints).toHaveLength(9);
    expect(appWaypoints[0]).toBe('37.7,-122.4');
    expect(inApp.dropped.map((p) => p.id)).toEqual(['s9', 's10', 's11']);

    // The same day in a browser loses six more stops.
    const inBrowser = googleMapsDirUrl(anchor, plan, WAYPOINT_LIMIT_BROWSER);
    expect(
      decodeURIComponent(inBrowser.url.split('waypoints=')[1]).split('|')
    ).toHaveLength(3);
    expect(inBrowser.dropped).toHaveLength(9);
  });

  it('drops nothing for a day inside the limit', () => {
    const { dropped } = googleMapsDirUrl(
      anchor,
      planWith([stop('a', 37.79, -122.39)]),
      WAYPOINT_LIMIT_APP
    );
    expect(dropped).toEqual([]);
    expect(droppedStopsWarning(dropped)).toBeNull();
  });

  /**
   * Coordinates are arithmetic results, and binary floating point leaves
   * residue: 37.7 + 9/1000 is 37.709 to a person and 37.70900000000001 to a
   * double. Six places is ~0.1m, far finer than the data, and stops the URL
   * claiming nanometre precision.
   */
  it('rounds coordinates to six places so float residue never reaches Google', () => {
    const { url } = googleMapsDirUrl(
      anchor,
      planWith([stop('a', 37.7 + 9 / 1000, -122.4 - 1 / 3)])
    );
    const waypoint = decodeURIComponent(url.split('waypoints=')[1]);
    expect(waypoint).toBe('37.709,-122.733333');
  });
});

describe('waypoint limits', () => {
  it('carries nine into the app and three into a browser', () => {
    expect(waypointLimit(true)).toBe(WAYPOINT_LIMIT_APP);
    expect(waypointLimit(false)).toBe(WAYPOINT_LIMIT_BROWSER);
  });

  it('names one dropped stop in the singular and several in a list', () => {
    const one = droppedStopsWarning([{ name: 'Coit Tower' }] as never);
    expect(one).toContain('Coit Tower is not in the route');
    expect(one).toContain('you still have it here');

    const three = droppedStopsWarning([
      { name: 'A' },
      { name: 'B' },
      { name: 'C' },
    ] as never);
    expect(three).toContain('A, B and C are not in the route');
    expect(three).toContain('you still have them here');
  });
});

describe('googleMapsStopUrl', () => {
  it('routes to the planned coordinate, not the place name', () => {
    const url = googleMapsStopUrl({ latitude: 37.7955, longitude: -122.3937 }, 'bart');
    expect(url).toContain('destination=37.7955%2C-122.3937');
    expect(url).toContain('travelmode=transit');
  });

  it('maps rideshare to driving directions', () => {
    expect(googleMapsStopUrl({ latitude: 37.8, longitude: -122.4 }, 'rideshare')).toContain(
      'travelmode=driving'
    );
  });
});
