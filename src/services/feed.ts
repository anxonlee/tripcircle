import { DATASET_CITY } from '../lib/tripLink';
import type { Goal } from '../lib/optimizer';
import { requireSupabase } from './supabase';

/**
 * The feed over the network (PRD §3.8, Phase 3).
 *
 * Thin, like `services/wishlists`: every rule about who may see or change
 * what lives in the database. What a post may contain is settled there too —
 * there is no column for a start place or a coordinate, so this file could
 * not leak one if it tried.
 */

export interface FeedPost {
  id: string;
  authorId: string;
  authorName: string;
  city: string;
  title: string;
  note: string | null;
  dayStartMin: number;
  homeByMin: number;
  goal: Goal;
  createdAt: string;
  /** Set when moderation took it down. Only ever visible to its author. */
  hiddenAt: string | null;
  hiddenReason: string | null;
  places: { placeId: string; placeName: string }[];
}

export interface FeedComment {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
}

export type ReportReason = 'spam' | 'offensive' | 'wrong' | 'other';

const POST_COLUMNS =
  'id, author_id, city, title, note, day_start_min, home_by_min, goal, created_at, hidden_at, hidden_reason, profiles(display_name), post_places(place_id, place_name, position)';

/** Recent days published in this build's city, newest first. */
export async function listFeed(limit = 30): Promise<FeedPost[]> {
  const { data, error } = await requireSupabase()
    .from('posts')
    .select(POST_COLUMNS)
    .eq('city', DATASET_CITY)
    .is('hidden_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(rowToPost);
}

/** Everything you have published, including anything taken down. */
export async function listMyPosts(authorId: string): Promise<FeedPost[]> {
  const { data, error } = await requireSupabase()
    .from('posts')
    .select(POST_COLUMNS)
    .eq('author_id', authorId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToPost);
}

export async function publishDay(input: {
  authorId: string;
  title: string;
  note: string;
  dayStartMin: number;
  homeByMin: number;
  goal: Goal;
  places: { placeId: string; placeName: string }[];
}): Promise<string> {
  const db = requireSupabase();
  const { data, error } = await db
    .from('posts')
    .insert({
      author_id: input.authorId,
      city: DATASET_CITY,
      title: input.title.trim(),
      note: input.note.trim() || null,
      day_start_min: input.dayStartMin,
      home_by_min: input.homeByMin,
      goal: input.goal,
    })
    .select('id')
    .single();
  if (error) throw error;

  const postId = data.id as string;
  const rows = input.places.map((p, i) => ({
    post_id: postId,
    position: i + 1,
    place_id: p.placeId,
    place_name: p.placeName,
  }));
  const { error: placesError } = await db.from('post_places').insert(rows);
  if (placesError) {
    // A post with no stops is not a day. Rather than leave a husk in the
    // feed, take it back out — the author can try again.
    await db.from('posts').delete().eq('id', postId);
    throw placesError;
  }
  return postId;
}

export async function deletePost(id: string): Promise<void> {
  const { error } = await requireSupabase().from('posts').delete().eq('id', id);
  if (error) throw error;
}

export async function listComments(postId: string): Promise<FeedComment[]> {
  const { data, error } = await requireSupabase()
    .from('post_comments')
    .select('id, post_id, author_id, body, created_at, profiles(display_name)')
    .eq('post_id', postId)
    .is('hidden_at', null)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    postId: r.post_id as string,
    authorId: r.author_id as string,
    authorName: nameOf(r.profiles),
    body: r.body as string,
    createdAt: r.created_at as string,
  }));
}

export async function addComment(
  postId: string,
  authorId: string,
  body: string
): Promise<void> {
  const { error } = await requireSupabase()
    .from('post_comments')
    .insert({ post_id: postId, author_id: authorId, body: body.trim() });
  if (error) throw error;
}

export async function deleteComment(id: string): Promise<void> {
  const { error } = await requireSupabase()
    .from('post_comments')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

/**
 * Reporting. Idempotent by unique constraint: a second report from the same
 * person is not an error, it is somebody checking it went through.
 */
export async function report(input: {
  reporterId: string;
  subjectType: 'post' | 'comment' | 'user';
  subjectId: string;
  reason: ReportReason;
  detail?: string;
}): Promise<void> {
  const { error } = await requireSupabase().from('reports').insert({
    reporter_id: input.reporterId,
    subject_type: input.subjectType,
    subject_id: input.subjectId,
    reason: input.reason,
    detail: input.detail?.trim() || null,
  });
  if (error && error.code !== '23505') throw error;
}

export async function blockUser(blockerId: string, blockedId: string): Promise<void> {
  const { error } = await requireSupabase()
    .from('blocks')
    .insert({ blocker_id: blockerId, blocked_id: blockedId });
  if (error && error.code !== '23505') throw error;
}

export async function unblockUser(blockerId: string, blockedId: string): Promise<void> {
  const { error } = await requireSupabase()
    .from('blocks')
    .delete()
    .eq('blocker_id', blockerId)
    .eq('blocked_id', blockedId);
  if (error) throw error;
}

export async function listBlocked(): Promise<{ id: string }[]> {
  const { data, error } = await requireSupabase().from('blocks').select('blocked_id');
  if (error) throw error;
  return (data ?? []).map((r) => ({ id: r.blocked_id as string }));
}

/** A joined profile arrives as an object, or as an array on some queries. */
function nameOf(profiles: unknown): string {
  if (Array.isArray(profiles)) {
    return (profiles[0] as { display_name?: string } | undefined)?.display_name ?? 'Someone';
  }
  return (profiles as { display_name?: string } | null)?.display_name ?? 'Someone';
}

function rowToPost(r: Record<string, unknown>): FeedPost {
  const places = ((r.post_places as { place_id: string; place_name: string; position: number }[]) ?? [])
    // Ordered here rather than in the query: PostgREST does not order an
    // embedded list, and the order of the stops is the point of the post.
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((p) => ({ placeId: p.place_id, placeName: p.place_name }));
  return {
    id: r.id as string,
    authorId: r.author_id as string,
    authorName: nameOf(r.profiles),
    city: r.city as string,
    title: r.title as string,
    note: (r.note as string | null) ?? null,
    dayStartMin: r.day_start_min as number,
    homeByMin: r.home_by_min as number,
    goal: r.goal as Goal,
    createdAt: r.created_at as string,
    hiddenAt: (r.hidden_at as string | null) ?? null,
    hiddenReason: (r.hidden_reason as string | null) ?? null,
    places,
  };
}
