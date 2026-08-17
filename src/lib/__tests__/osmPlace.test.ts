import type { LatLng } from '../../domain/types';
import { haversineKm } from '../geo';
import {
  type OsmElement,
  isOsmPlaceId,
  osmPlaceId,
  osmToPlace,
  parseOpeningHours,
  rankOsmResults,
  themeFor,
} from '../osmPlace';

const node = (tags: Record<string, string>, over: Partial<OsmElement> = {}): OsmElement => ({
  type: 'node',
  id: 123,
  lat: 37.775,
  lon: -122.42,
  tags,
  ...over,
});

describe('themeFor', () => {
  it('reads the common kinds of place', () => {
    expect(themeFor({ amenity: 'cafe' })).toBe('cafe');
    expect(themeFor({ amenity: 'restaurant' })).toBe('food');
    expect(themeFor({ amenity: 'bar' })).toBe('nightlife');
    expect(themeFor({ tourism: 'museum' })).toBe('historical');
    expect(themeFor({ leisure: 'park' })).toBe('nature');
    expect(themeFor({ shop: 'books' })).toBe('shopping');
  });

  it('lets the more specific identity win', () => {
    // A museum with a café is a museum, and a bakery is somewhere to eat
    // rather than a generic shop.
    expect(themeFor({ tourism: 'museum', amenity: 'cafe' })).toBe('cafe');
    expect(themeFor({ shop: 'bakery' })).toBe('food');
  });

  it('has no opinion on things that are not places to go', () => {
    expect(themeFor({ amenity: 'bench' })).toBeNull();
    expect(themeFor({})).toBeNull();
  });
});

describe('parseOpeningHours', () => {
  it('reads a plain window', () => {
    expect(parseOpeningHours('09:00-17:30')).toEqual({ open: 540, close: 1050 });
    expect(parseOpeningHours('Mo-Fr 08:00-18:00')).toEqual({ open: 480, close: 1080 });
  });

  it('understands round the clock', () => {
    expect(parseOpeningHours('24/7')).toBe('always');
  });

  it('carries a window past midnight rather than inverting it', () => {
    expect(parseOpeningHours('Mo-Su 18:00-02:00')).toEqual({ open: 1080, close: 1560 });
  });

  it('declines anything it cannot read without guessing', () => {
    // Half-parsing this grammar is how a planner sends someone to a closed
    // door with confidence. Refusing is the safe answer: the caller falls
    // back to a category default and marks it estimated.
    expect(parseOpeningHours('Mo-Fr 09:00-17:00; Sa 10:00-14:00')).toBeNull();
    expect(parseOpeningHours('Mo-Su 10:00-18:00; PH off')).toBeNull();
    expect(parseOpeningHours('sunrise-sunset')).toBeNull();
    expect(parseOpeningHours('Mo-Fr 09:00-17:00, Sa off')).toBeNull();
  });

  it('says nothing when the tag is absent or nonsense', () => {
    expect(parseOpeningHours(undefined)).toBeNull();
    expect(parseOpeningHours('yes')).toBeNull();
    expect(parseOpeningHours('99:99-10:00')).toBeNull();
  });
});

describe('osmToPlace', () => {
  const build = (tags: Record<string, string>, over: Partial<OsmElement> = {}) =>
    osmToPlace(node(tags, over), 'Mission');

  it('makes a place out of a named, located, recognisable node', () => {
    const p = build({ name: 'Blue Bottle', amenity: 'cafe' });
    expect(p?.name).toBe('Blue Bottle');
    expect(p?.themes).toEqual(['cafe']);
    expect(p?.district).toBe('Mission');
    expect(p?.id).toBe('osm-node-123');
  });

  it('refuses what cannot be sent to', () => {
    expect(build({ amenity: 'cafe' })).toBeNull();
    expect(build({ name: 'Nameless bench', amenity: 'bench' })).toBeNull();
    expect(
      osmToPlace({ type: 'way', id: 9, tags: { name: 'X', shop: 'books' } }, 'Mission')
    ).toBeNull();
  });

  it('takes the centre of a way, which is how areas arrive', () => {
    const p = osmToPlace(
      { type: 'way', id: 9, center: { lat: 37.8, lon: -122.4 }, tags: { name: 'Park', leisure: 'park' } },
      'Marina'
    );
    expect(p?.location).toEqual({ latitude: 37.8, longitude: -122.4 });
    expect(p?.id).toBe('osm-way-9');
  });

  it('marks hours it invented, and does not mark hours the map gave', () => {
    expect(build({ name: 'A', amenity: 'cafe' })?.hoursEstimated).toBe(true);
    expect(
      build({ name: 'A', amenity: 'cafe', opening_hours: '07:00-16:00' })?.hoursEstimated
    ).toBeUndefined();
  });

  it('treats 24/7 as always open rather than as a guess', () => {
    const p = build({ name: 'Plaza', leisure: 'park', opening_hours: '24/7' });
    expect(p?.openHours).toBeNull();
    expect(p?.hoursEstimated).toBeUndefined();
  });

  it('never claims to know a price', () => {
    // OSM records none. The band exists because the type demands one.
    expect(build({ name: 'A', amenity: 'restaurant' })?.priceEstimated).toBe(true);
    expect(build({ name: 'A', amenity: 'restaurant' })?.avgCostUsd).toBe(0);
  });

  it('never grants itself a detour', () => {
    expect(build({ name: 'A', tourism: 'museum' })?.worthDetour).toBe(false);
  });

  it('says where it came from, and keeps the reference', () => {
    const p = build({ name: 'A', amenity: 'cafe' });
    expect(p?.source).toBe('osm');
    expect(p?.osmRef).toBe('node/123');
    expect(isOsmPlaceId(osmPlaceId(node({})))).toBe(true);
  });

  it('has an id a shared link will carry', () => {
    expect(osmPlaceId(node({}))).toMatch(/^[a-z0-9-]+$/);
  });
});

describe('rankOsmResults', () => {
  const at = (n: number): LatLng => ({ latitude: 37.7 + n / 100, longitude: -122.4 });
  const place = (n: number) =>
    osmToPlace(
      node(
        { name: `p${n}`, amenity: 'cafe' },
        { id: n, lat: at(n).latitude, lon: at(n).longitude }
      ),
      'Mission'
    )!;

  it('puts the nearest first', () => {
    const places = [place(5), place(1), place(3)];
    const ranked = rankOsmResults(places, at(0), 10, haversineKm);
    expect(ranked.map((p) => p.name)).toEqual(['p1', 'p3', 'p5']);
  });

  it('keeps the list short enough to read', () => {
    const places = [place(1), place(2), place(3), place(4)];
    expect(rankOsmResults(places, at(0), 2, haversineKm)).toHaveLength(2);
  });

  it('still returns something when there is no anchor to rank against', () => {
    const places = [place(1), place(2)];
    expect(rankOsmResults(places, undefined, 10, haversineKm)).toHaveLength(2);
  });
});
