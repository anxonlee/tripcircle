import type { Category } from '../domain/types';

/**
 * Color tokens from docs/ui-guide.md §2 — hard constraints, light-locked
 * (no OS-adaptive colors in MVP). Clay appears only on a screen's single
 * primary action and start-place identity.
 */
export const colors = {
  surface: '#FFFFFF',
  surfaceAlt: '#F6FAF8',
  surfaceInput: '#F1F3F4',
  border: '#F0F0F0',
  borderStrong: '#E0E0E0',
  textPrimary: '#1A1A1A',
  textSecondary: '#5F6368',
  textMuted: '#9AA0A6',
  accent: '#D97757',
  positive: '#1D9E75',
  selectedWell: '#F4FBF8',
  warning: '#B8860B',
  /**
   * Soft map palette tokens (guide §2). Apple Maps tiles cannot be recolored
   * (custom styles are Google/Mapbox-only), so these activate when the map
   * provider is swapped behind the service boundary.
   */
  mapLand: '#E9F2EC',
  mapRoad: '#FFFFFF',
  mapWater: '#CDE6F5',
  mapBlock: '#DDE9DF',
} as const;

/** Category palette (guide §2 / PRD §6.1). Café uses a reserved slot. */
export const categoryColors: Record<Category, string> = {
  food: '#E8542F',
  historical: '#E8A22F',
  shopping: '#2F7FE8',
  nature: '#1D9E75',
  nightlife: '#8B5CF6',
  cafe: '#8C6D4F',
};

export const categoryLabels: Record<Category, string> = {
  food: 'Food',
  historical: 'Historical',
  shopping: 'Shopping',
  nature: 'Nature',
  nightlife: 'Nightlife',
  cafe: 'Café',
};

/**
 * What a row looks like with a finger on it.
 *
 * Guide §2 has no press state, and this deliberately does not add a hue to
 * the palette: it is neutral black at low alpha, so it darkens whatever it
 * covers rather than colouring it. That is what iOS does to a list row under
 * a finger, and it is the only honest way to answer a hold — the gesture runs
 * for the best part of a second, and a row that never acknowledges the touch
 * reads as a row that did not receive it.
 */
export const pressedWell = 'rgba(0, 0, 0, 0.07)';

/** ~14% tint over white for tile/tag backgrounds (guide §2 tint rule). */
export function tint(hex: string): string {
  return `${hex}24`;
}

/** ~30% tint for tag borders. */
export function tintBorder(hex: string): string {
  return `${hex}4D`;
}

/**
 * Colors to render for a place's pin/tile: primary category first, capped at
 * two (PRD §6.1 — never 3+ colors on a pin).
 */
export function pinColors(categories: Category[]): string[] {
  return categories.slice(0, 2).map((c) => categoryColors[c]);
}
