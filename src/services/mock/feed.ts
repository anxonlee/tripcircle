import type { Comment, FeedPost } from '../../domain/social';
import { users } from './users';

/**
 * Mock public feed (Phase 3): shared day plans other people published, each
 * built from real POI ids so "clone" rehydrates against PlacesService. Stands
 * in for the feed provider behind SocialService.
 */
export const feedPosts: FeedPost[] = [
  {
    id: 'post-classic-sf',
    author: users.mei,
    title: 'Classic SF in one day',
    city: 'San Francisco',
    themes: ['historical', 'nature'],
    blurb: 'The greatest hits without the rush — bridge, rotunda, and the tower at sunset.',
    stopIds: ['palace-of-fine-arts', 'crissy-field', 'golden-gate-bridge', 'coit-tower'],
    durationMin: 372,
    costUsd: 22,
    saves: 1840,
    clones: 412,
    postedAgo: '2d',
  },
  {
    id: 'post-burrito-crawl',
    author: users.kenji,
    title: 'Mission burrito crawl under $40',
    city: 'San Francisco',
    themes: ['food'],
    blurb: 'Two taquerias, a bakery stop, and a nap on the Dolores slope.',
    stopIds: ['la-taqueria', 'dolores-park', 'tartine-bakery', 'el-farolito'],
    durationMin: 288,
    costUsd: 38,
    saves: 3120,
    clones: 977,
    postedAgo: '4d',
  },
  {
    id: 'post-first-time',
    author: users.aria,
    title: 'First time in San Francisco',
    city: 'San Francisco',
    themes: ['historical', 'shopping'],
    blurb: 'Alcatraz in the morning, Chinatown for lunch, cable car back up the hill.',
    stopIds: ['alcatraz-island', 'pier-39', 'chinatown-dragon-gate', 'cable-car-museum'],
    durationMin: 402,
    costUsd: 84,
    saves: 5610,
    clones: 1503,
    postedAgo: '1w',
  },
  {
    id: 'post-green-day',
    author: users.sora,
    title: 'A green day in the city',
    city: 'San Francisco',
    themes: ['nature', 'cafe'],
    blurb: 'Park hopping with a slow coffee in the middle. Good for a reset.',
    stopIds: ['japanese-tea-garden', 'philz-mission', 'dolores-park', 'lands-end-trail'],
    durationMin: 336,
    costUsd: 26,
    saves: 980,
    clones: 205,
    postedAgo: '1w',
  },
  {
    id: 'post-night-owls',
    author: users.diego,
    title: 'North Beach after dark',
    city: 'San Francisco',
    themes: ['nightlife', 'food'],
    blurb: 'Oysters at the counter, a Beat-era bar, then rum in a shipwreck.',
    stopIds: ['swan-oyster-depot', 'vesuvio-cafe', 'smugglers-cove'],
    durationMin: 240,
    costUsd: 102,
    saves: 2240,
    clones: 588,
    postedAgo: '2w',
  },
];

/**
 * The current user's own published plans (Phase 3), shown on their profile's
 * Plans grid and their public profile. Seeded so a fresh profile isn't empty;
 * live-published plans (useSocialStore.myPosts) stack on top of these.
 */
export const myPlans: FeedPost[] = [
  {
    id: 'mine-coffee-coast',
    author: users.you,
    title: 'Coffee and coastline',
    city: 'San Francisco',
    themes: ['cafe', 'nature'],
    blurb: 'A slow west-side loop — pour-over, a garden, and the cliffs.',
    stopIds: ['sightglass-coffee', 'japanese-tea-garden', 'lands-end-trail'],
    durationMin: 246,
    costUsd: 21,
    saves: 214,
    clones: 38,
    postedAgo: '5d',
  },
  {
    id: 'mine-east-bay',
    author: users.you,
    title: 'East Bay afternoon',
    city: 'Berkeley & Oakland',
    themes: ['historical', 'nature'],
    blurb: 'Campanile view, Telegraph Ave, then a loop round the lake.',
    stopIds: ['uc-berkeley', 'lake-merritt'],
    durationMin: 288,
    costUsd: 18,
    saves: 156,
    clones: 24,
    postedAgo: '2w',
  },
  {
    id: 'mine-sunset',
    author: users.you,
    title: 'Sunset over Twin Peaks',
    city: 'San Francisco',
    themes: ['shopping', 'nightlife'],
    blurb: 'Vintage racks on the Haight into a hilltop sunset. Go late afternoon.',
    stopIds: ['haight-ashbury', 'twin-peaks', 'castro-theatre'],
    durationMin: 300,
    costUsd: 32,
    saves: 402,
    clones: 71,
    postedAgo: '3w',
  },
];

/** Comment threads keyed by post id. */
export const commentsByPost: Record<string, Comment[]> = {
  'post-burrito-crawl': [
    { id: 'c1', author: users.mei, text: 'Did this on a rainy Tuesday, El Farolito was the highlight.', ago: '3d', likes: 34 },
    { id: 'c2', author: users.aria, text: 'Swapped the last stop for Ritual and it still worked out.', ago: '2d', likes: 21 },
    { id: 'c3', author: users.sora, text: 'Under budget even with a beer. Cloning this.', ago: '1d', likes: 12 },
  ],
  'post-classic-sf': [
    { id: 'c4', author: users.diego, text: 'Crissy Field early is so quiet, great call ordering it here.', ago: '1d', likes: 18 },
    { id: 'c5', author: users.kenji, text: 'Coit Tower elevator line gets long after 15:00 — go earlier.', ago: '20h', likes: 27 },
  ],
  'post-first-time': [
    { id: 'c6', author: users.mei, text: 'Perfect first day. Balanced mode kept the walking sane.', ago: '5d', likes: 41 },
  ],
};
