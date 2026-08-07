import type { CostShare, PassportStamp, Trip } from '../../domain/social';
import { users } from './users';

/**
 * Mock trips (Phases 2 & 4): a shared day out with friends, a multi-stay
 * trip across cities, plus a plan cloned from the feed. The current local
 * day plan is derived live from the trip store, not stored here.
 */
export const trips: Trip[] = [
  {
    id: 'trip-weekend-crew',
    title: 'Weekend with the crew',
    city: 'San Francisco',
    kind: 'shared',
    dateLabel: 'Sat, Mar 14',
    coverThemes: ['historical', 'nightlife'],
    members: [users.you, users.mei, users.kenji],
    placeIds: ['ferry-building', 'alcatraz-island', 'chinatown-dragon-gate', 'coit-tower', 'vesuvio-cafe'],
    costUsd: 186,
  },
  {
    id: 'trip-burrito-clone',
    title: 'Mission burrito crawl under $40',
    city: 'San Francisco',
    kind: 'shared',
    dateLabel: 'Fri, Mar 20',
    coverThemes: ['food'],
    members: [users.you, users.aria],
    placeIds: ['la-taqueria', 'dolores-park', 'tartine-bakery', 'el-farolito'],
    costUsd: 76,
    clonedFromTitle: 'Mission burrito crawl under $40 · @kenjieats',
  },
  {
    id: 'trip-norcal',
    title: 'NorCal in spring',
    city: 'San Francisco → Berkeley → Marin',
    kind: 'multi',
    dateLabel: 'Apr 4–9',
    coverThemes: ['nature', 'historical'],
    members: [users.you, users.mei, users.sora],
    placeIds: [],
    costUsd: 0,
    stays: [
      {
        id: 'stay-sf',
        city: 'San Francisco',
        dateLabel: 'Apr 4–5',
        placeIds: ['golden-gate-bridge', 'twin-peaks', 'smugglers-cove'],
      },
      {
        id: 'stay-berkeley',
        city: 'Berkeley & Oakland',
        dateLabel: 'Apr 6–7',
        placeIds: ['uc-berkeley', 'lake-merritt'],
      },
      {
        id: 'stay-marin',
        city: 'Marin',
        dateLabel: 'Apr 8–9',
        placeIds: ['muir-woods', 'baker-beach', 'crissy-field'],
      },
    ],
  },
];

/** Cost-split ledger for the shared weekend trip (Phase 2). */
export const costSharesByTrip: Record<string, CostShare[]> = {
  'trip-weekend-crew': [
    { user: users.you, paidUsd: 118 },
    { user: users.mei, paidUsd: 48 },
    { user: users.kenji, paidUsd: 20 },
  ],
  'trip-burrito-clone': [
    { user: users.you, paidUsd: 28 },
    { user: users.aria, paidUsd: 48 },
  ],
};

/**
 * Shared wishlist (Phase 2): places friends dropped into the group list over
 * time, each attributed to who added it. The current user's own picks come
 * live from the trip store and are merged in by the screen.
 */
export const sharedWishlistAdds: { placeId: string; addedById: string }[] = [
  { placeId: 'golden-gate-bridge', addedById: 'mei' },
  { placeId: 'smugglers-cove', addedById: 'kenji' },
  { placeId: 'valencia-street', addedById: 'aria' },
  { placeId: 'lands-end-trail', addedById: 'mei' },
  { placeId: 'ferry-building', addedById: 'kenji' },
  { placeId: 'muir-woods', addedById: 'sora' },
];

/** People collaborating on the shared wishlist. */
export const wishlistMembers = ['you', 'mei', 'kenji', 'aria', 'sora'];

/** Travel passport stamps (Phase 3): cities the user has planned days in. */
export const passportStamps: PassportStamp[] = [
  { city: 'San Francisco', country: 'United States', code: 'SFO', visits: 14, lastVisited: 'This week', color: '#E8542F' },
  { city: 'Oakland', country: 'United States', code: 'OAK', visits: 3, lastVisited: 'Last month', color: '#E8A22F' },
  { city: 'Los Angeles', country: 'United States', code: 'LAX', visits: 2, lastVisited: 'Jan 2026', color: '#2F7FE8' },
  { city: 'Seattle', country: 'United States', code: 'SEA', visits: 1, lastVisited: 'Nov 2025', color: '#1D9E75' },
  { city: 'New York', country: 'United States', code: 'NYC', visits: 1, lastVisited: 'Aug 2025', color: '#8B5CF6' },
];
