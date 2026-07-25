import type { Category, OpenHours, Place } from '../../domain/types';

/** Shape of a Places API (New) place, limited to the fields we request. */
export interface GooglePlace {
  id: string;
  displayName?: { text?: string };
  location?: { latitude: number; longitude: number };
  types?: string[];
  primaryType?: string;
  priceLevel?: string;
  rating?: number;
  userRatingCount?: number;
  regularOpeningHours?: {
    periods?: {
      open?: { day: number; hour: number; minute: number };
      close?: { day: number; hour: number; minute: number };
    }[];
  };
  editorialSummary?: { text?: string };
}

/**
 * Google place types → our six categories, most specific first. Order matters:
 * the first match becomes the primary category, which drives the left half of
 * a split pin and the tile icon (PRD §6.1).
 */
const TYPE_TO_CATEGORY: [string, Category][] = [
  ['coffee_shop', 'cafe'],
  ['cafe', 'cafe'],
  ['bakery', 'cafe'],
  ['bar', 'nightlife'],
  ['night_club', 'nightlife'],
  ['wine_bar', 'nightlife'],
  ['pub', 'nightlife'],
  ['restaurant', 'food'],
  ['meal_takeaway', 'food'],
  ['food_court', 'food'],
  ['ice_cream_shop', 'food'],
  ['museum', 'historical'],
  ['art_gallery', 'historical'],
  ['historical_landmark', 'historical'],
  ['historical_place', 'historical'],
  ['church', 'historical'],
  ['synagogue', 'historical'],
  ['hindu_temple', 'historical'],
  ['mosque', 'historical'],
  ['cultural_landmark', 'historical'],
  ['monument', 'historical'],
  ['shopping_mall', 'shopping'],
  ['department_store', 'shopping'],
  ['clothing_store', 'shopping'],
  ['book_store', 'shopping'],
  ['market', 'shopping'],
  ['store', 'shopping'],
  ['park', 'nature'],
  ['national_park', 'nature'],
  ['state_park', 'nature'],
  ['hiking_area', 'nature'],
  ['beach', 'nature'],
  ['garden', 'nature'],
  ['botanical_garden', 'nature'],
  ['tourist_attraction', 'historical'],
];

export function mapCategories(g: GooglePlace): Category[] {
  const types = [g.primaryType, ...(g.types ?? [])].filter(Boolean) as string[];
  const out: Category[] = [];
  for (const [type, cat] of TYPE_TO_CATEGORY) {
    if (types.includes(type) && !out.includes(cat)) out.push(cat);
  }
  // Everything must land somewhere; unknown venues read as a generic outing.
  return out.length > 0 ? out.slice(0, 3) : ['historical'];
}

const PRICE_MAP: Record<string, 0 | 1 | 2 | 3 | 4> = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

export function mapPriceLevel(g: GooglePlace, cats: Category[]): 0 | 1 | 2 | 3 | 4 {
  if (g.priceLevel && PRICE_MAP[g.priceLevel] !== undefined) return PRICE_MAP[g.priceLevel];
  // Google omits price for most non-dining venues; parks and shrines are free.
  return cats[0] === 'nature' || cats[0] === 'historical' ? 0 : 2;
}

/**
 * Google exposes no per-visit spend, so we estimate: price level sets the
 * scale, category sets the baseline. Rough by design — the plan shows the
 * number so the user can sanity-check it.
 */
export function estimateCostUsd(cats: Category[], price: 0 | 1 | 2 | 3 | 4): number {
  const primary = cats[0];
  if (primary === 'nature') return price === 0 ? 0 : 10;
  if (primary === 'historical') return price === 0 ? 0 : [0, 12, 20, 30, 45][price];
  if (primary === 'cafe') return [0, 6, 9, 14, 20][price];
  if (primary === 'food') return [0, 15, 28, 55, 90][price];
  if (primary === 'nightlife') return [0, 15, 25, 45, 70][price];
  if (primary === 'shopping') return [0, 20, 45, 90, 160][price];
  return 20;
}

/** Typical dwell time per category — the optimizer needs one for every stop. */
export function estimateVisitMin(cats: Category[]): number {
  switch (cats[0]) {
    case 'cafe':
      return 40;
    case 'food':
      return 60;
    case 'nightlife':
      return 90;
    case 'shopping':
      return 75;
    case 'nature':
      return 70;
    case 'historical':
      return 75;
    default:
      return 60;
  }
}

/**
 * Today's opening window in minutes since midnight. Google gives weekly
 * periods with day 0 = Sunday; a close that wraps past midnight becomes
 * close > 1440, which is exactly what our OpenHours expects.
 */
export function mapOpenHours(g: GooglePlace, today = new Date().getDay()): OpenHours | null {
  const periods = g.regularOpeningHours?.periods;
  if (!periods || periods.length === 0) return null;
  // A single period with an open and no close means "always open".
  if (periods.length === 1 && periods[0].open && !periods[0].close) return null;

  const p = periods.find((x) => x.open?.day === today);
  if (!p?.open) return null;
  const open = p.open.hour * 60 + p.open.minute;
  if (!p.close) return null;
  let close = p.close.hour * 60 + p.close.minute;
  if (p.close.day !== p.open.day || close <= open) close += 1440;
  return { open, close };
}

/** Convert a Google place into our domain Place, or null if unusable. */
export function toPlace(g: GooglePlace): Place | null {
  if (!g.id || !g.location || !g.displayName?.text) return null;
  const categories = mapCategories(g);
  const priceLevel = mapPriceLevel(g, categories);
  return {
    id: g.id,
    name: g.displayName.text,
    location: { latitude: g.location.latitude, longitude: g.location.longitude },
    categories,
    priceLevel,
    avgCostUsd: estimateCostUsd(categories, priceLevel),
    openHours: mapOpenHours(g),
    visitDurationMin: estimateVisitMin(categories),
    rating: g.rating ?? 0,
    reviewCount: g.userRatingCount ?? 0,
    description: g.editorialSummary?.text,
  };
}
