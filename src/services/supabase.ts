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
/**
 * How long any one request may hang before it is abandoned.
 *
 * The rest of this app already does this — see `services/google/http.ts`,
 * whose comment reads "so a hung request can't freeze a screen" — and the
 * Supabase client arrived without it. A transient TLS failure on the
 * simulator left the sign-in button disabled for forty seconds with no
 * explanation, which is the exact failure that comment was written about.
 *
 * Longer than the eight seconds Google gets, because this runs on whatever
 * connection someone has when they are out for the day, and a sign-in that
 * gives up early is worse than one that waits a moment.
 */
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Honours the caller's own signal as well as the deadline. supabase-js
 * passes one of its own for some requests, and dropping it would leave the
 * library unable to cancel work it had already given up on.
 */
function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const caller = init?.signal;
  if (caller) {
    if (caller.aborted) controller.abort();
    else caller.addEventListener('abort', () => controller.abort());
  }
  return fetch(input, { ...init, signal: controller.signal }).finally(() =>
    clearTimeout(timer)
  );
}

export const supabase: SupabaseClient | null = hasBackend
  ? createClient(url!, key!, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
      global: { fetch: fetchWithTimeout },
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
