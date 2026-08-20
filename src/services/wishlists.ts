import { requireSupabase } from './supabase';

/**
 * Shared wishlists over the network (PRD F14, Phase 3).
 *
 * Thin on purpose. Every rule about who may read or change what lives in the
 * database, in `supabase/migrations`, not here — a client that enforced them
 * would be a client whose checks could be bypassed by any other client. What
 * this file does is name the operations and turn the wire's snake_case into
 * the app's vocabulary.
 */

export interface Wishlist {
  id: string;
  name: string;
  city: string;
  ownerId: string;
  /** Present only for lists you own — the select policy sees to that. */
  inviteCode: string | null;
  createdAt: string;
}

export interface WishlistItem {
  id: string;
  wishlistId: string;
  placeId: string;
  /** Carried so a place this build does not have still has a name. */
  placeName: string;
  note: string | null;
  addedBy: string | null;
  createdAt: string;
}

export interface WishlistMember {
  userId: string;
  role: 'owner' | 'editor' | 'viewer';
  displayName: string;
}

export async function listWishlists(): Promise<Wishlist[]> {
  const { data, error } = await requireSupabase()
    .from('wishlists')
    .select('id, name, city, owner_id, invite_code, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToWishlist);
}

export async function createWishlist(name: string, ownerId: string): Promise<Wishlist> {
  const { data, error } = await requireSupabase()
    .from('wishlists')
    // owner_id is sent because the insert policy checks it against the
    // caller. The database decides whether it is allowed; this only states
    // the intent.
    .insert({ name: name.trim() || 'Our list', owner_id: ownerId })
    .select('id, name, city, owner_id, invite_code, created_at')
    .single();
  if (error) throw error;
  return rowToWishlist(data);
}

export async function renameWishlist(id: string, name: string): Promise<void> {
  const { error } = await requireSupabase()
    .from('wishlists')
    .update({ name: name.trim() })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteWishlist(id: string): Promise<void> {
  const { error } = await requireSupabase().from('wishlists').delete().eq('id', id);
  if (error) throw error;
}

export async function listItems(wishlistId: string): Promise<WishlistItem[]> {
  const { data, error } = await requireSupabase()
    .from('wishlist_items')
    .select('id, wishlist_id, place_id, place_name, note, added_by, created_at')
    .eq('wishlist_id', wishlistId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    wishlistId: r.wishlist_id,
    placeId: r.place_id,
    placeName: r.place_name,
    note: r.note,
    addedBy: r.added_by,
    createdAt: r.created_at,
  }));
}

export async function addItem(input: {
  wishlistId: string;
  placeId: string;
  placeName: string;
  addedBy: string;
}): Promise<void> {
  const { error } = await requireSupabase().from('wishlist_items').insert({
    wishlist_id: input.wishlistId,
    place_id: input.placeId,
    place_name: input.placeName,
    added_by: input.addedBy,
  });
  // The same place twice is a unique-constraint violation, and it is not a
  // failure worth showing: the place is already on the list, which is what
  // the person wanted.
  if (error && error.code !== '23505') throw error;
}

export async function removeItem(id: string): Promise<void> {
  const { error } = await requireSupabase().from('wishlist_items').delete().eq('id', id);
  if (error) throw error;
}

export async function listMembers(wishlistId: string): Promise<WishlistMember[]> {
  const { data, error } = await requireSupabase()
    .from('wishlist_members')
    .select('user_id, role, profiles(display_name)')
    .eq('wishlist_id', wishlistId);
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    userId: r.user_id as string,
    role: r.role as WishlistMember['role'],
    // A member whose profile is unreadable should still be countable — the
    // list saying "3 people" and showing two is worse than showing a blank.
    displayName:
      (r.profiles as { display_name?: string } | null)?.display_name ?? 'Someone',
  }));
}

/** Joins by invite code, returning the list id. Idempotent. */
export async function joinWishlist(code: string): Promise<string> {
  const { data, error } = await requireSupabase().rpc('join_wishlist', { code });
  if (error) throw error;
  return data as string;
}

/** Invalidates the code that is out in the world and returns a fresh one. */
export async function rotateInviteCode(wishlistId: string): Promise<string> {
  const { data, error } = await requireSupabase().rpc('rotate_invite_code', {
    wl: wishlistId,
  });
  if (error) throw error;
  return data as string;
}

/** Removes yourself. The owner leaving is refused by the database. */
export async function leaveWishlist(wishlistId: string, userId: string): Promise<void> {
  const { error } = await requireSupabase()
    .from('wishlist_members')
    .delete()
    .eq('wishlist_id', wishlistId)
    .eq('user_id', userId);
  if (error) throw error;
}

function rowToWishlist(r: Record<string, unknown>): Wishlist {
  return {
    id: r.id as string,
    name: r.name as string,
    city: r.city as string,
    ownerId: r.owner_id as string,
    inviteCode: (r.invite_code as string | null) ?? null,
    createdAt: r.created_at as string,
  };
}
