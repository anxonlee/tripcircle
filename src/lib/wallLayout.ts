import type { WallCard } from '../domain/diary';
import type { District } from '../domain/types';

/**
 * Memory wall layout (PRD §3A.3).
 *
 * "Cards auto-arrange by area/district so the zoomed-out board mirrors where
 * the user actually goes." So the layout is computed, not authored: each
 * district becomes a cluster, clusters are packed into rows, and cards fill
 * a small grid inside their cluster.
 *
 * Pure and deterministic — no React, no gestures, no randomness. The tilt
 * that makes cards look pinned comes from a hash of the place id, so a card
 * keeps the same angle forever instead of jittering on every render.
 */

export const CARD_W = 132;
export const CARD_H = 168;
const CARD_GAP = 16;
/** Space around a district cluster, and room above it for its label. */
const CLUSTER_PAD = 28;
const CLUSTER_LABEL_H = 22;
/** Cards per row inside a cluster before it grows downward. */
const CLUSTER_COLS = 2;
/** Clusters per row before the board wraps. */
const BOARD_COLS = 3;
const MAX_TILT_DEG = 3.5;

export interface PositionedCard {
  card: WallCard;
  /** Top-left of the card in board coordinates. */
  x: number;
  y: number;
  /** Degrees; small, alternating, stable per place. */
  tilt: number;
}

export interface Cluster {
  district: District;
  /**
   * Top-left of the cluster's box, in board coordinates.
   *
   * Separate from the label position because they are genuinely different
   * points: the label sits one padding inside the box. Only the label is
   * drawn today, and `width`/`height` describe the box — so a record
   * carrying just `labelX` and `width` invites a future background view to
   * be drawn a padding off, with nothing to say it was wrong.
   */
  x: number;
  y: number;
  /** Top-left of the cluster's label, inset from the box by the padding. */
  labelX: number;
  labelY: number;
  width: number;
  height: number;
}

export interface WallLayout {
  cards: PositionedCard[];
  clusters: Cluster[];
  /** Full board extent, used by the fit control. */
  width: number;
  height: number;
}

/** Stable small angle from the place id. Same card, same tilt, always. */
export function tiltFor(placeId: string): number {
  let hash = 0;
  for (let i = 0; i < placeId.length; i++) {
    hash = (hash * 31 + placeId.charCodeAt(i)) | 0;
  }
  // Map to [-MAX_TILT, +MAX_TILT] with a bit of granularity.
  const unit = ((hash % 200) + 200) % 200; // 0..199
  return ((unit / 199) * 2 - 1) * MAX_TILT_DEG;
}

function clusterSize(count: number): { width: number; height: number } {
  const cols = Math.min(CLUSTER_COLS, Math.max(1, count));
  const rows = Math.ceil(count / CLUSTER_COLS);
  return {
    width: cols * CARD_W + (cols - 1) * CARD_GAP + CLUSTER_PAD * 2,
    height:
      CLUSTER_LABEL_H + rows * CARD_H + (rows - 1) * CARD_GAP + CLUSTER_PAD * 2,
  };
}

/**
 * Arrange cards into district clusters.
 *
 * Cards arrive newest-first (see buildWallCards). District order follows
 * first appearance in that list, so the district you visited most recently
 * sits at the top-left of the board — the eye lands on the newest memory
 * without needing a "sort by" control.
 */
export function layoutWall(cards: WallCard[]): WallLayout {
  if (cards.length === 0) {
    return { cards: [], clusters: [], width: 0, height: 0 };
  }

  const byDistrict = new Map<District, WallCard[]>();
  for (const card of cards) {
    const list = byDistrict.get(card.place.district);
    if (list) list.push(card);
    else byDistrict.set(card.place.district, [card]);
  }

  const positioned: PositionedCard[] = [];
  const clusters: Cluster[] = [];

  let cursorX = 0;
  let rowY = 0;
  let rowHeight = 0;
  let colInRow = 0;
  let boardWidth = 0;

  for (const [district, districtCards] of byDistrict) {
    const size = clusterSize(districtCards.length);

    if (colInRow === BOARD_COLS) {
      // Wrap to a new row of clusters.
      rowY += rowHeight;
      rowHeight = 0;
      cursorX = 0;
      colInRow = 0;
    }

    clusters.push({
      district,
      x: cursorX,
      y: rowY,
      labelX: cursorX + CLUSTER_PAD,
      labelY: rowY + CLUSTER_PAD,
      width: size.width,
      height: size.height,
    });

    districtCards.forEach((card, i) => {
      const col = i % CLUSTER_COLS;
      const row = Math.floor(i / CLUSTER_COLS);
      positioned.push({
        card,
        x: cursorX + CLUSTER_PAD + col * (CARD_W + CARD_GAP),
        y:
          rowY +
          CLUSTER_PAD +
          CLUSTER_LABEL_H +
          row * (CARD_H + CARD_GAP),
        tilt: tiltFor(card.place.id),
      });
    });

    cursorX += size.width;
    boardWidth = Math.max(boardWidth, cursorX);
    rowHeight = Math.max(rowHeight, size.height);
    colInRow++;
  }

  return {
    cards: positioned,
    clusters,
    width: boardWidth,
    height: rowY + rowHeight,
  };
}

/**
 * Transform that frames the whole board inside a viewport — the fit control.
 * Returns a scale and the translation to apply to a board anchored at its
 * top-left corner.
 */
export function fitTransform(
  layout: WallLayout,
  viewport: { width: number; height: number },
  padding = 24
): { scale: number; translateX: number; translateY: number } {
  if (layout.width === 0 || layout.height === 0) {
    return { scale: 1, translateX: 0, translateY: 0 };
  }
  const availableW = Math.max(1, viewport.width - padding * 2);
  const availableH = Math.max(1, viewport.height - padding * 2);
  // Never zoom past 1:1 — a two-card board should not render enormous.
  const scale = Math.min(availableW / layout.width, availableH / layout.height, 1);
  return {
    scale,
    translateX: (viewport.width - layout.width * scale) / 2,
    translateY: (viewport.height - layout.height * scale) / 2,
  };
}

/** Transform that centers one card in the viewport at a given scale. */
export function focusTransform(
  card: PositionedCard,
  viewport: { width: number; height: number },
  scale: number
): { scale: number; translateX: number; translateY: number } {
  const cx = card.x + CARD_W / 2;
  const cy = card.y + CARD_H / 2;
  return {
    scale,
    translateX: viewport.width / 2 - cx * scale,
    translateY: viewport.height / 2 - cy * scale,
  };
}
