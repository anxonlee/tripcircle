import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';

/**
 * The one place this app talks to a server.
 *
 * Everything else — the diary, the planner, day sharing — works with no
 * network and no account, and that is not an accident to be eroded. Shared
 * wishlists are the exception because a list only one person can see is not
 * a shared list. Nothing else should be routed through here without the same
 * argument being made out loud.
 *
 * Absent configuration is a supported state, not an error. A build with no
 * Supabase keys is the app as it shipped before the server existed: the
 * wishlist screen says so, and no other screen changes. That keeps the
 * fallback honest rather than leaving a feature half-lit.
 */

const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY?.trim();

/** Whether this build has a server at all. */
export const hasBackend = Boolean(url && key);

/**
 * Sessions persist in AsyncStorage, beside the diary.
 *
 * `detectSessionInUrl` is off because that is a browser concern — there is
 * no URL bar here, and leaving it on makes the client reach for `window` on
 * a platform that has none.
 */
export const supabase: SupabaseClient | null = hasBackend
  ? createClient(url!, key!, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

/**
 * The client, or a thrown error naming what is missing.
 *
 * Callers that have already checked `hasBackend` use this rather than
 * threading a null through every function. The message is for a developer;
 * the screens check `hasBackend` and say something human instead.
 */
export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      'No Supabase configuration — set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_KEY.'
    );
  }
  return supabase;
}
