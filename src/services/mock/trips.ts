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
    city: 'Tokyo',
    kind: 'shared',
    dateLabel: 'Sat, Mar 14',
    coverThemes: ['historical', 'nightlife'],
    members: [users.you, users.mei, users.kenji],
    placeIds: ['tsukiji-outer-market', 'sensoji', 'nakamise-street', 'shibuya-sky', 'golden-gai'],
    costYen: 11800,
  },
  {
    id: 'trip-ramen-clone',
    title: 'Ramen crawl under ¥3,000',
    city: 'Tokyo',
    kind: 'shared',
    dateLabel: 'Fri, Mar 20',
    coverThemes: ['food'],
    members: [users.you, users.aria],
    placeIds: ['ichiran-shibuya', 'harajuku-gyoza-lou', 'afuri-harajuku', 'omoide-yokocho'],
    costYen: 5700,
    clonedFromTitle: 'Ramen crawl under ¥3,000 · @kenjieats',
  },
  {
    id: 'trip-kansai',
    title: 'Kansai in spring',
    city: 'Tokyo → Kyoto → Osaka',
    kind: 'multi',
    dateLabel: 'Apr 4–9',
    coverThemes: ['nature', 'historical'],
    members: [users.you, users.mei, users.sora],
    placeIds: [],
    costYen: 0,
    stays: [
      {
        id: 'stay-tokyo',
        city: 'Tokyo',
        dateLabel: 'Apr 4–5',
        placeIds: ['meiji-jingu', 'shibuya-sky', 'omoide-yokocho'],
      },
      {
        id: 'stay-kyoto',
        city: 'Kyoto',
        dateLabel: 'Apr 6–7',
        placeIds: ['sensoji', 'nezu-shrine', 'hamarikyu'],
      },
      {
        id: 'stay-osaka',
        city: 'Osaka',
        dateLabel: 'Apr 8–9',
        placeIds: ['ichiran-shibuya', 'ebisu-yokocho', 'golden-gai'],
      },
    ],
  },
];

/** Cost-split ledger for the shared weekend trip (Phase 2). */
export const costSharesByTrip: Record<string, CostShare[]> = {
  'trip-weekend-crew': [
    { user: users.you, paidYen: 7400 },
    { user: users.mei, paidYen: 3200 },
    { user: users.kenji, paidYen: 1200 },
  ],
  'trip-ramen-clone': [
    { user: users.you, paidYen: 2100 },
    { user: users.aria, paidYen: 3600 },
  ],
};

/**
 * Shared wishlist (Phase 2): places friends dropped into the group list over
 * time, each attributed to who added it. The current user's own picks come
 * live from the trip store and are merged in by the screen.
 */
export const sharedWishlistAdds: { placeId: string; addedById: string }[] = [
  { placeId: 'shibuya-sky', addedById: 'mei' },
  { placeId: 'golden-gai', addedById: 'kenji' },
  { placeId: 'daikanyama-tsite', addedById: 'aria' },
  { placeId: 'hamarikyu', addedById: 'mei' },
  { placeId: 'tsukiji-outer-market', addedById: 'kenji' },
  { placeId: 'nezu-shrine', addedById: 'sora' },
];

/** People collaborating on the shared wishlist. */
export const wishlistMembers = ['you', 'mei', 'kenji', 'aria', 'sora'];

/** Travel passport stamps (Phase 3): cities the user has planned days in. */
export const passportStamps: PassportStamp[] = [
  { city: 'Tokyo', country: 'Japan', code: 'TYO', visits: 14, lastVisited: 'This week', color: '#E8542F' },
  { city: 'Kyoto', country: 'Japan', code: 'KYO', visits: 3, lastVisited: 'Last month', color: '#E8A22F' },
  { city: 'Seoul', country: 'South Korea', code: 'SEL', visits: 2, lastVisited: 'Jan 2026', color: '#2F7FE8' },
  { city: 'Taipei', country: 'Taiwan', code: 'TPE', visits: 1, lastVisited: 'Nov 2025', color: '#1D9E75' },
  { city: 'Bangkok', country: 'Thailand', code: 'BKK', visits: 1, lastVisited: 'Aug 2025', color: '#8B5CF6' },
];
