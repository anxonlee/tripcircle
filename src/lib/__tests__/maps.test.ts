import type { LegEstimate, StartPlace, TransportMode } from '../../domain/types';
import type { DayPlan, PlannedStop } from '../optimizer';
import {
  dayExceedsMapsWaypointCap,
  dayMapsTravelMode,
  dayOverviewMisstatesTransit,
  googleMapsDirUrl,
  googleMapsStopUrl,
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
    const url = googleMapsDirUrl(
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
    const url = googleMapsDirUrl(anchor, planWith([]));
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
    const url = googleMapsDirUrl(anchor, allBart);
    expect(url).not.toContain('transit');
    expect(url).toContain('travelmode=driving');
  });

  it('walks the overview only when every leg was walked', () => {
    const allWalk = planWith(
      [stop('a', 37.79, -122.39, 'walk', 10), stop('b', 37.8, -122.4, 'walk', 12)],
      leg('walk', 15)
    );
    expect(dayMapsTravelMode(allWalk)).toBe('walking');
    expect(googleMapsDirUrl(anchor, allWalk)).toContain('travelmode=walking');

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

  it('trims to the nine-waypoint cap that the Maps URL API enforces', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      stop(`s${i}`, 37.7 + i / 1000, -122.4)
    );
    const plan = planWith(many);
    expect(dayExceedsMapsWaypointCap(plan)).toBe(true);
    const waypoints = decodeURIComponent(
      googleMapsDirUrl(anchor, plan).split('waypoints=')[1]
    ).split('|');
    expect(waypoints).toHaveLength(9);
    expect(waypoints[0]).toBe('37.7,-122.4');
  });

  it('does not flag a day inside the cap', () => {
    expect(dayExceedsMapsWaypointCap(planWith([stop('a', 37.79, -122.39)]))).toBe(false);
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
