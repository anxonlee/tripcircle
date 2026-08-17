jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async () => null,
    setItem: async () => undefined,
    removeItem: async () => undefined,
  },
}));

import type { LatLng } from '../../../domain/types';
import { useFoundPlacesStore } from '../../../store/useFoundPlacesStore';
import { placesService } from '../../places';
import {
  MAX_RESULTS,
  MIN_QUERY_LENGTH,
  buildSearchUrl,
  featureToElement,
  searchOsm,
} from '../search';

const POWELL: LatLng = { latitude: 37.7845, longitude: -122.4079 };
const REFERENCE = [{ location: POWELL, district: 'Downtown & SoMa' as const }];

/** A Photon feature, in the shape the live service actually returns. */
const feature = (
  id: number,
  name: string,
  over: Record<string, unknown> = {},
  lonLat: [number, number] = [-122.408, 37.785]
) => ({
  type: 'Feature',
  properties: {
    osm_type: 'N',
    osm_id: id,
    osm_key: 'amenity',
    osm_value: 'cafe',
    name,
    ...over,
  },
  geometry: { type: 'Point', coordinates: lonLat },
});

function respondWith(features: unknown[]) {
  globalThis.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({ features }),
  })) as unknown as typeof fetch;
}

beforeEach(() => {
  useFoundPlacesStore.getState().clear();
});

describe('buildSearchUrl', () => {
  it('biases towards where the day starts', () => {
    const url = buildSearchUrl('philz', POWELL);
    expect(url).toContain('lat=37.7845');
    expect(url).toContain('lon=-122.4079');
  });

  it('escapes what the user typed', () => {
    // A name with an ampersand or a space must search for itself rather than
    // truncating the query string.
    const url = buildSearchUrl('Tony & Sons', POWELL);
    expect(url).toContain('q=Tony+%26+Sons');
  });

  it('asks for more than it will show, because most results are not places', () => {
    const limit = Number(new URL(buildSearchUrl('x', POWELL)).searchParams.get('limit'));
    expect(limit).toBeGreaterThan(MAX_RESULTS);
  });
});

describe('featureToElement', () => {
  it('rebuilds a tag set the OSM mapper understands', () => {
    const el = featureToElement(feature(1, 'Philz Coffee'));
    expect(el).toEqual({
      type: 'node',
      id: 1,
      lat: 37.785,
      lon: -122.408,
      tags: { name: 'Philz Coffee', amenity: 'cafe' },
    });
  });

  it('reads the ways and relations Photon abbreviates', () => {
    expect(featureToElement(feature(2, 'A', { osm_type: 'W' }))?.type).toBe('way');
    expect(featureToElement(feature(3, 'A', { osm_type: 'R' }))?.type).toBe('relation');
  });

  it('refuses a feature with nothing to place', () => {
    expect(featureToElement({ properties: { osm_id: 1, name: 'X' } })).toBeNull();
    expect(featureToElement(feature(0, ''))).toBeNull();
  });
});

describe('searchOsm', () => {
  it('finds a place that is not in the built-in list', async () => {
    respondWith([feature(679010814, 'Philz Coffee')]);
    const found = await searchOsm('philz', POWELL, REFERENCE);
    expect(found).toHaveLength(1);
    expect(found[0].name).toBe('Philz Coffee');
    expect(found[0].source).toBe('osm');
    expect(found[0].district).toBe('Downtown & SoMa');
  });

  it('drops the streets and cities that come back with it', async () => {
    // Photon searches all of OSM, so a query returns roads and
    // neighbourhoods alongside anywhere you could actually go.
    respondWith([
      feature(1, 'Philz Coffee'),
      feature(2, 'Philz Street', { osm_key: 'highway', osm_value: 'residential' }),
      feature(3, 'Philzville', { osm_key: 'place', osm_value: 'suburb' }),
    ]);
    const found = await searchOsm('philz', POWELL, REFERENCE);
    expect(found.map((p) => p.name)).toEqual(['Philz Coffee']);
  });

  it('keeps the nearest branch of a chain, not the first listed', async () => {
    respondWith([
      feature(1, 'Philz Coffee', {}, [-122.5, 37.9]),
      feature(2, 'Philz Coffee', {}, [-122.408, 37.785]),
    ]);
    const found = await searchOsm('philz', POWELL, REFERENCE);
    expect(found).toHaveLength(1);
    expect(found[0].id).toBe('osm-node-2');
  });

  it('keeps the list short enough to read', async () => {
    respondWith(
      Array.from({ length: 30 }, (_, i) =>
        feature(i + 1, `Cafe ${i}`, {}, [-122.408 + i / 1000, 37.785])
      )
    );
    expect(await searchOsm('cafe', POWELL, REFERENCE)).toHaveLength(MAX_RESULTS);
  });

  it('does not ask on a fragment', async () => {
    respondWith([]);
    await searchOsm('ph'.slice(0, MIN_QUERY_LENGTH - 1), POWELL, REFERENCE);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('does not ask when there is nowhere to search around', async () => {
    respondWith([]);
    await searchOsm('philz', undefined, REFERENCE);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('returns nothing rather than throwing when the server is down', async () => {
    globalThis.fetch = jest.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    await expect(searchOsm('philz', POWELL, REFERENCE)).resolves.toEqual([]);
  });

  it('returns nothing when the server answers with an error', async () => {
    globalThis.fetch = jest.fn(async () => ({ ok: false, json: async () => ({}) })) as
      unknown as typeof fetch;
    await expect(searchOsm('philz', POWELL, REFERENCE)).resolves.toEqual([]);
  });

  it('says the hours are a guess, because Photon carries none', async () => {
    respondWith([feature(1, 'Philz Coffee')]);
    const [found] = await searchOsm('philz', POWELL, REFERENCE);
    expect(found.hoursEstimated).toBe(true);
    expect(found.priceEstimated).toBe(true);
  });
});

describe('found places through the service', () => {
  it('keeps a result so it still resolves after the search is gone', async () => {
    // The trap this closes: a place that lives only in a results list can be
    // selected, and then not exist on the next launch — the stop silently
    // leaves the day and a stamp against it loses its name.
    respondWith([feature(1, 'Philz Coffee')]);
    const hits = await placesService.searchPlaces('philz', POWELL);
    const found = hits.find((p) => p.source === 'osm');
    expect(found).toBeDefined();

    respondWith([]);
    expect((await placesService.getPlace(found!.id))?.name).toBe('Philz Coffee');
    expect((await placesService.listPlaces()).some((p) => p.id === found!.id)).toBe(true);
  });

  it('still answers from the built-in list when the search finds nothing', async () => {
    respondWith([]);
    const hits = await placesService.searchPlaces('ferry', POWELL);
    expect(hits.some((p) => p.name.toLowerCase().includes('ferry'))).toBe(true);
  });

  it('still answers from the built-in list when the server is down', async () => {
    globalThis.fetch = jest.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    const hits = await placesService.searchPlaces('ferry', POWELL);
    expect(hits.some((p) => p.name.toLowerCase().includes('ferry'))).toBe(true);
  });
});
