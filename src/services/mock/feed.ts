import type { Comment, FeedPost } from '../../domain/social';
import { users } from './users';

/**
 * Mock public feed (Phase 3): shared day plans other people published, each
 * built from real POI ids so "clone" rehydrates against PlacesService. Stands
 * in for the feed provider behind SocialService.
 */
export const feedPosts: FeedPost[] = [
  {
    id: 'post-old-tokyo',
    author: users.mei,
    title: 'Old Tokyo, slowly',
    city: 'Tokyo',
    themes: ['historical', 'nature'],
    blurb: 'Temples and gardens on the east side, ending with tea at Hamarikyū.',
    stopIds: ['sensoji', 'nakamise-street', 'nezu-shrine', 'yanaka-ginza', 'hamarikyu'],
    durationMin: 372,
    costYen: 2600,
    saves: 1840,
    clones: 412,
    postedAgo: '2d',
  },
  {
    id: 'post-ramen-crawl',
    author: users.kenji,
    title: 'Ramen crawl under ¥3,000',
    city: 'Tokyo',
    themes: ['food'],
    blurb: 'Three bowls, one afternoon. Booth ramen, gyoza, then a nightcap alley.',
    stopIds: ['ichiran-shibuya', 'harajuku-gyoza-lou', 'afuri-harajuku', 'omoide-yokocho'],
    durationMin: 288,
    costYen: 2850,
    saves: 3120,
    clones: 977,
    postedAgo: '4d',
  },
  {
    id: 'post-first-time',
    author: users.aria,
    title: 'First time in Tokyo',
    city: 'Tokyo',
    themes: ['historical', 'shopping'],
    blurb: 'The greatest hits without the rush — shrine, market, and a sunset view.',
    stopIds: ['meiji-jingu', 'takeshita-street', 'shibuya-109', 'shibuya-sky'],
    durationMin: 402,
    costYen: 4200,
    saves: 5610,
    clones: 1503,
    postedAgo: '1w',
  },
  {
    id: 'post-green-day',
    author: users.sora,
    title: 'A green day in the city',
    city: 'Tokyo',
    themes: ['nature', 'cafe'],
    blurb: 'Park hopping with a slow coffee in the middle. Good for a reset.',
    stopIds: ['shinjuku-gyoen', 'yoyogi-park', 'streamer-shibuya', 'ueno-park'],
    durationMin: 336,
    costYen: 1400,
    saves: 980,
    clones: 205,
    postedAgo: '1w',
  },
  {
    id: 'post-night-owls',
    author: users.diego,
    title: 'Night owls of Shinjuku',
    city: 'Tokyo',
    themes: ['nightlife', 'food'],
    blurb: 'Start with skewers, end in a six-seat bar in Golden Gai.',
    stopIds: ['omoide-yokocho', 'golden-gai', 'shibuya-sky'],
    durationMin: 240,
    costYen: 6800,
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
    id: 'mine-coffee-canals',
    author: users.you,
    title: 'Coffee and canals',
    city: 'Tokyo',
    themes: ['cafe', 'nature'],
    blurb: 'A slow east-side loop — pour-over, a garden, and the water.',
    stopIds: ['blue-bottle-kiyosumi', 'hamarikyu', 'streamer-shibuya'],
    durationMin: 246,
    costYen: 1900,
    saves: 214,
    clones: 38,
    postedAgo: '5d',
  },
  {
    id: 'mine-akiba',
    author: users.you,
    title: 'Akihabara afternoon',
    city: 'Tokyo',
    themes: ['shopping'],
    blurb: 'Electronics, kitchen town, then something nice in Ginza.',
    stopIds: ['akihabara-electric-town', 'kappabashi', 'ginza-six'],
    durationMin: 288,
    costYen: 3400,
    saves: 156,
    clones: 24,
    postedAgo: '2w',
  },
  {
    id: 'mine-sunset',
    author: users.you,
    title: 'Sunset over Shibuya',
    city: 'Tokyo',
    themes: ['shopping', 'nightlife'],
    blurb: 'Youth-culture shopping into a rooftop sunset. Go late afternoon.',
    stopIds: ['takeshita-street', 'shibuya-109', 'shibuya-sky'],
    durationMin: 300,
    costYen: 4600,
    saves: 402,
    clones: 71,
    postedAgo: '3w',
  },
];

/** Comment threads keyed by post id. */
export const commentsByPost: Record<string, Comment[]> = {
  'post-ramen-crawl': [
    { id: 'c1', author: users.mei, text: 'Did this on a rainy Tuesday, Afuri was the highlight.', ago: '3d', likes: 34 },
    { id: 'c2', author: users.aria, text: 'Swapped the last stop for Golden Gai and it still worked out.', ago: '2d', likes: 21 },
    { id: 'c3', author: users.sora, text: 'Under budget even with a beer. Cloning this.', ago: '1d', likes: 12 },
  ],
  'post-old-tokyo': [
    { id: 'c4', author: users.diego, text: 'Nezu Shrine early is so quiet, great call ordering it here.', ago: '1d', likes: 18 },
    { id: 'c5', author: users.kenji, text: 'Hamarikyū tea house closes earlier than the map says — go by 16:00.', ago: '20h', likes: 27 },
  ],
  'post-first-time': [
    { id: 'c6', author: users.mei, text: 'Perfect first day. Balanced mode kept the walking sane.', ago: '5d', likes: 41 },
  ],
};
