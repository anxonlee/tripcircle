import type { LatLng } from '../../../domain/types';
import { GoogleRoutingService } from '../routingProvider';

/**
 * What the provider would actually be billed.
 *
 * The cache is unit-tested on its own; this drives the real service against a
 * stand-in for Google and counts elements, because the saving only exists if
 * the provider asks the cache before it asks the network. A regression here
 * costs money rather than correctness, which is exactly the kind that goes
 * unnoticed.
 */

const at = (n: number): LatLng => ({ latitude: 37.7 + n / 1000, longitude: -122.4 });

interface Billed {
  elements: number;
  requests: number;
  modes: string[];
}

function fakeGoogle(): Billed {
  const billed: Billed = { elements: 0, requests: 0, modes: [] };

  globalThis.fetch = jest.fn(async (url: unknown) => {
    const params = new URL(String(url)).searchParams;
    const origins = params.get('origins')?.split('|') ?? [];
    const destinations = params.get('destinations')?.split('|') ?? [];
    billed.requests += 1;
    billed.elements += origins.length * destinations.length;
    billed.modes.push(params.get('mode') ?? '');

    return {
      ok: true,
      json: async () => ({
        status: 'OK',
        rows: origins.map(() => ({
          elements: destinations.map(() => ({
            status: 'OK',
            duration: { value: 600 },
            distance: { value: 2000 },
          })),
        })),
      }),
    };
  }) as unknown as typeof fetch;

  return billed;
}

describe('GoogleRoutingService billing', () => {
  const day = [at(1), at(2), at(3), at(4)];

  it('asks in Google’s modes, not in ours', async () => {
    // Six of our modes collapse into three journeys: Muni, BART and the ferry
    // are one transit request, rideshare and driving are one drive. Asking in
    // our own vocabulary would buy each of those twice over.
    const billed = fakeGoogle();
    await new GoogleRoutingService().getLegOptionsFn(day);
    expect(new Set(billed.modes)).toEqual(
      new Set(['walking', 'transit', 'driving'])
    );
    // Whatever the rectangles work out to, no mode gets asked more than
    // another — that asymmetry is what duplicate buying would look like.
    const perMode = ['walking', 'transit', 'driving'].map(
      (m) => billed.modes.filter((x) => x === m).length
    );
    expect(new Set(perMode).size).toBe(1);
  });

  it('buys the day once, however many times it is solved', async () => {
    const billed = fakeGoogle();
    const service = new GoogleRoutingService();
    await service.getLegOptionsFn(day);
    const afterFirst = billed.elements;

    // The four objectives, and a return to the screen.
    for (let i = 0; i < 4; i++) await service.getLegOptionsFn(day);
    expect(billed.elements).toBe(afterFirst);
  });

  it('pays only for the pairs a new place brings', async () => {
    const billed = fakeGoogle();
    const service = new GoogleRoutingService();
    await service.getLegOptionsFn(day);
    const afterFirst = billed.elements;

    await service.getLegOptionsFn([...day, at(5)]);
    // Five in and four out, across three modes — not another 25 per mode.
    expect(billed.elements - afterFirst).toBe(9 * 3);
  });

  it('does not buy the same rectangle twice when two screens ask at once', async () => {
    const billed = fakeGoogle();
    const service = new GoogleRoutingService();
    await Promise.all([
      service.getLegOptionsFn(day),
      service.getLegOptionsFn(day),
    ]);
    expect(billed.elements).toBe(15 * 3);
  });

  it('uses what Google measured', async () => {
    fakeGoogle();
    const fn = await new GoogleRoutingService().getLegOptionsFn(day);
    const walk = fn(at(1), at(2)).find((o) => o.mode === 'walk');
    expect(walk?.durationMin).toBe(10);
    expect(walk?.distanceKm).toBe(2);
  });

  it('falls back to estimates rather than breaking when Google is down', async () => {
    globalThis.fetch = jest.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;

    const fn = await new GoogleRoutingService().getLegOptionsFn(day);
    const options = fn(at(1), at(2));
    expect(options.length).toBeGreaterThan(0);
    expect(options.every((o) => o.durationMin > 0)).toBe(true);
  });

  it('spends nothing when there is no day to plan', async () => {
    const billed = fakeGoogle();
    await new GoogleRoutingService().getLegOptionsFn([at(1)]);
    expect(billed.requests).toBe(0);
  });
});
