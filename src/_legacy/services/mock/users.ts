import type { User } from '../../domain/social';

/**
 * Mock people for the social layer. Avatar colors sit off the clay/category
 * palette on purpose — identity chrome must never read as a category signal
 * (ui-guide §2). Real accounts arrive with auth post-MVP.
 */
export const users: Record<string, User> = {
  you: {
    id: 'you',
    name: 'You',
    handle: 'you',
    initials: 'Y',
    color: '#5A7D9A',
    homeCity: 'San Francisco',
    bio: 'Planning slow days out, one neighbourhood at a time.',
    followers: 128,
    following: 86,
  },
  mei: {
    id: 'mei',
    name: 'Mei Tanaka',
    handle: 'meiwalks',
    initials: 'MT',
    color: '#3E8E7E',
    homeCity: 'San Francisco',
    bio: 'The city on foot. Coastal trails, parks, and the long way round.',
    followers: 12400,
    following: 312,
  },
  kenji: {
    id: 'kenji',
    name: 'Kenji Oda',
    handle: 'kenjieats',
    initials: 'KO',
    color: '#8E6B9E',
    homeCity: 'Oakland',
    bio: 'Eating my way across the Bay. Burritos are a food group.',
    followers: 28900,
    following: 154,
  },
  aria: {
    id: 'aria',
    name: 'Aria Lawson',
    handle: 'ariawanders',
    initials: 'AL',
    color: '#B08968',
    homeCity: 'London',
    bio: 'First-timer guides for big cities. No rush, no lines.',
    followers: 9800,
    following: 421,
  },
  sora: {
    id: 'sora',
    name: 'Sora Kim',
    handle: 'soraslow',
    initials: 'SK',
    color: '#6B7A8F',
    homeCity: 'Berkeley',
    bio: 'Parks, coffee, and slow mornings.',
    followers: 5400,
    following: 208,
  },
  diego: {
    id: 'diego',
    name: 'Diego Ruiz',
    handle: 'diegomaps',
    initials: 'DR',
    color: '#4F8A8B',
    homeCity: 'San Francisco',
    bio: 'Nightlife maps for people who sleep late.',
    followers: 7200,
    following: 190,
  },
};

export const currentUser = users.you;
