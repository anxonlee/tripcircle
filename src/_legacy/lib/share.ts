import { Share } from 'react-native';
import type { FeedPost, Trip } from '../domain/social';
import { formatDuration, formatUsd } from './format';

/**
 * Native OS share sheet (Instagram, Messages, Mail, AirDrop, copy link…).
 * TripCircle has no web backend in the MVP, so links use the app's deep-link
 * scheme; a real universal link swaps in behind the same call.
 */
const BASE = 'https://tripcircle.app';

async function share(message: string, url: string): Promise<void> {
  try {
    await Share.share({ message: `${message}\n${url}`, url });
  } catch {
    // User dismissed the sheet — nothing to do.
  }
}

export function sharePost(post: FeedPost): Promise<void> {
  return share(
    `${post.title} — a ${post.stopIds.length}-stop day in ${post.city} (${formatDuration(
      post.durationMin
    )}, about ${formatUsd(post.costUsd)}) on TripCircle`,
    `${BASE}/p/${post.id}`
  );
}

export function shareTrip(trip: Trip): Promise<void> {
  const stops = trip.stays
    ? trip.stays.reduce((n, s) => n + s.placeIds.length, 0)
    : trip.placeIds.length;
  return share(
    `${trip.title} — ${stops} stops in ${trip.city} on TripCircle`,
    `${BASE}/t/${trip.id}`
  );
}

export function inviteToTrip(title: string, id: string): Promise<void> {
  return share(`Join my plan "${title}" on TripCircle`, `${BASE}/join/${id}`);
}
