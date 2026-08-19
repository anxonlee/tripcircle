import type { WallCard } from '../../domain/diary';
import type { CuratedPlace, District } from '../../domain/types';
import {
  CARD_H,
  CARD_W,
  fitTransform,
  focusTransform,
  layoutWall,
  tiltFor,
} from '../wallLayout';

/**
 * The wall is the app's first screen and its whole promise is that it looks
 * arranged rather than generated. These pin the properties that make it read
 * that way: nothing overlaps, a card never moves on its own, and the board
 * always fits when asked to.
 */

let n = 0;
const card = (district: District, id = `p${n++}`): WallCard => ({
  place: { id, name: id, district } as CuratedPlace,
  stats: {
    placeId: id,
    visitCount: 1,
    lastVisitedAt: 0,
    daysSinceLastVisit: 0,
    goAgain: { yes: 1, maybe: 0, no: 0 },
    avgRating: null,
    photoCount: 0,
  },
  latestVisit: { id: `v${id}`, placeId: id, timestamp: 0, wouldGoAgain: 'yes' },
});

/** Do two cards' rectangles intersect? */
const overlaps = (
  a: { x: number; y: number },
  b: { x: number; y: number }
): boolean =>
  a.x < b.x + CARD_W && b.x < a.x + CARD_W && a.y < b.y + CARD_H && b.y < a.y + CARD_H;

describe('tiltFor', () => {
  it('gives the same card the same angle forever', () => {
    expect(tiltFor('ferry-building')).toBe(tiltFor('ferry-building'));
  });

  it('stays inside the small range that reads as pinned, not broken', () => {
    for (const id of ['a', 'ferry-building', 'zzzzzzzzzzzz', '', '你好', '-'.repeat(80)]) {
      const t = tiltFor(id);
      expect(Number.isFinite(t)).toBe(true);
      expect(Math.abs(t)).toBeLessThanOrEqual(3.5);
    }
  });

  it('does not give every card the same angle', () => {
    const angles = new Set(
      Array.from({ length: 40 }, (_, i) => tiltFor(`place-${i}`))
    );
    expect(angles.size).toBeGreaterThan(10);
  });
});

describe('layoutWall', () => {
  it('is empty and harmless with no cards', () => {
    expect(layoutWall([])).toEqual({ cards: [], clusters: [], width: 0, height: 0 });
  });

  it('places every card exactly once', () => {
    const cards = [card('Mission'), card('Mission'), card('Berkeley')];
    const out = layoutWall(cards);
    expect(out.cards).toHaveLength(3);
    expect(new Set(out.cards.map((c) => c.card.place.id)).size).toBe(3);
  });

  it('gives each district its own cluster', () => {
    const out = layoutWall([card('Mission'), card('Berkeley'), card('Mission')]);
    expect(out.clusters.map((c) => c.district)).toEqual(['Mission', 'Berkeley']);
  });

  it('orders districts by first appearance, so the newest is first', () => {
    // Cards arrive newest-first, which is what puts the most recent memory
    // at the top-left without a sort control.
    const out = layoutWall([card('Oakland'), card('Mission'), card('Oakland')]);
    expect(out.clusters[0].district).toBe('Oakland');
  });

  it('never overlaps two cards', () => {
    const districts: District[] = [
      'Mission',
      'Berkeley',
      'Oakland',
      'Marina',
      'Sausalito',
      'Palo Alto',
      'North Beach',
    ];
    const cards = districts.flatMap((d) =>
      Array.from({ length: 5 }, () => card(d))
    );
    const out = layoutWall(cards);
    for (let i = 0; i < out.cards.length; i++) {
      for (let j = i + 1; j < out.cards.length; j++) {
        expect(overlaps(out.cards[i], out.cards[j])).toBe(false);
      }
    }
  });

  it('keeps every card inside the extent it reports', () => {
    // The fit control scales by these numbers; a card outside them is a card
    // that vanishes when you tap fit.
    const districts: District[] = ['Mission', 'Berkeley', 'Oakland', 'Marina', 'Hayward'];
    const cards = districts.flatMap((d) => [card(d), card(d), card(d)]);
    const out = layoutWall(cards);
    for (const c of out.cards) {
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.x + CARD_W).toBeLessThanOrEqual(out.width);
      expect(c.y + CARD_H).toBeLessThanOrEqual(out.height);
    }
  });

  it('keeps every cluster inside the extent too', () => {
    const districts: District[] = ['Mission', 'Berkeley', 'Oakland', 'Marina'];
    const out = layoutWall(districts.flatMap((d) => [card(d), card(d), card(d)]));
    for (const c of out.clusters) {
      expect(c.x + c.width).toBeLessThanOrEqual(out.width);
      expect(c.y + c.height).toBeLessThanOrEqual(out.height);
      // The label sits inside its own box, not on the edge of it.
      expect(c.labelX).toBeGreaterThan(c.x);
      expect(c.labelY).toBeGreaterThan(c.y);
    }
  });

  it('wraps to a second row rather than growing sideways forever', () => {
    const districts: District[] = ['Mission', 'Berkeley', 'Oakland', 'Marina', 'Hayward'];
    const out = layoutWall(districts.map((d) => card(d)));
    expect(new Set(out.clusters.map((c) => c.labelY)).size).toBeGreaterThan(1);
  });

  it('is deterministic', () => {
    const cards = [card('Mission', 'a'), card('Berkeley', 'b'), card('Mission', 'c')];
    expect(layoutWall(cards)).toEqual(layoutWall(cards));
  });
});

describe('fitTransform', () => {
  const viewport = { width: 390, height: 700 };

  it('is identity for an empty board', () => {
    expect(fitTransform(layoutWall([]), viewport)).toEqual({
      scale: 1,
      translateX: 0,
      translateY: 0,
    });
  });

  it('never magnifies past 1:1', () => {
    // Two cards blown up to fill a phone would look like a bug, not a wall.
    const out = fitTransform(layoutWall([card('Mission')]), viewport);
    expect(out.scale).toBe(1);
  });

  it('shrinks a big board to fit inside the viewport', () => {
    const districts: District[] = ['Mission', 'Berkeley', 'Oakland', 'Marina', 'Hayward'];
    const layout = layoutWall(districts.flatMap((d) => [card(d), card(d), card(d)]));
    const { scale } = fitTransform(layout, viewport);
    expect(scale).toBeLessThan(1);
    expect(layout.width * scale).toBeLessThanOrEqual(viewport.width);
    expect(layout.height * scale).toBeLessThanOrEqual(viewport.height);
  });

  it('survives a viewport smaller than its own padding', () => {
    // A split-screen or a rotation mid-animation can hand it something tiny;
    // a divide by zero here would blank the wall.
    const layout = layoutWall([card('Mission'), card('Berkeley')]);
    const out = fitTransform(layout, { width: 10, height: 10 });
    expect(Number.isFinite(out.scale)).toBe(true);
    expect(out.scale).toBeGreaterThan(0);
  });

  it('centres what it fits', () => {
    const layout = layoutWall([card('Mission')]);
    const { scale, translateX } = fitTransform(layout, viewport);
    expect(translateX).toBeCloseTo((viewport.width - layout.width * scale) / 2, 6);
  });
});

describe('focusTransform', () => {
  it('puts the card in the middle of the viewport', () => {
    const layout = layoutWall([card('Mission'), card('Berkeley')]);
    const target = layout.cards[1];
    const viewport = { width: 390, height: 700 };
    const { translateX, translateY } = focusTransform(target, viewport, 1.5);
    // Board point of the card's centre, transformed, lands on the centre.
    expect((target.x + CARD_W / 2) * 1.5 + translateX).toBeCloseTo(viewport.width / 2, 6);
    expect((target.y + CARD_H / 2) * 1.5 + translateY).toBeCloseTo(viewport.height / 2, 6);
  });
});
