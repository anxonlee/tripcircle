import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { hasBackend, supabase } from '../services/supabase';

/**
 * Who is signed in, if anyone.
 *
 * Signed out is the normal state, not a problem to be solved. Everything the
 * app does on its own — the diary, the planner, sharing a day — works with
 * no account, and nothing here should start nagging for one. An account
 * buys exactly one thing: a list other people can also see.
 *
 * Sign-in is a code sent to an email address. No passwords, so this app
 * never handles one, never stores one, and cannot leak one. It also avoids
 * magic links, which would need deep-link plumbing to work from a mail app
 * back into a React Native build.
 */

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

interface AuthState {
  status: AuthStatus;
  session: Session | null;
  /** The signed-in person's own display name, once their profile has loaded. */
  displayName: string | null;
  /** Starts the session listener. Safe to call more than once. */
  init: () => void;
  sendCode: (email: string) => Promise<void>;
  verifyCode: (email: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
  setDisplayName: (name: string) => Promise<void>;
}

let listening = false;

export const useAuthStore = create<AuthState>()((set, get) => ({
  // A build with no server is not "loading" — it is settled, and saying so
  // immediately stops the wishlist screen flashing a spinner it will never
  // resolve.
  status: hasBackend ? 'loading' : 'signedOut',
  session: null,
  displayName: null,

  init: () => {
    if (!supabase || listening) return;
    listening = true;
    void supabase.auth.getSession().then(({ data }) => {
      set({
        session: data.session,
        status: data.session ? 'signedIn' : 'signedOut',
      });
      if (data.session) void loadProfile(set);
    });
    // Covers token refresh and sign-out from anywhere, not just this screen.
    supabase.auth.onAuthStateChange((_event, session) => {
      set({ session, status: session ? 'signedIn' : 'signedOut' });
      if (session) void loadProfile(set);
      else set({ displayName: null });
    });
  },

  sendCode: async (email) => {
    if (!supabase) throw new Error('This build has no server configured.');
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      // Signing in and signing up are the same act here. Asking someone
      // whether they already have an account is asking them to remember
      // something the app can check itself.
      options: { shouldCreateUser: true },
    });
    if (error) throw error;
  },

  verifyCode: async (email, code) => {
    if (!supabase) throw new Error('This build has no server configured.');
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'email',
    });
    if (error) throw error;
  },

  signOut: async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    set({ session: null, status: 'signedOut', displayName: null });
  },

  setDisplayName: async (name) => {
    const id = get().session?.user.id;
    if (!supabase || !id) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: trimmed })
      .eq('id', id);
    if (error) throw error;
    set({ displayName: trimmed });
  },
}));

async function loadProfile(set: (partial: Partial<AuthState>) => void) {
  if (!supabase) return;
  const { data } = await supabase.auth.getUser();
  const id = data.user?.id;
  if (!id) return;
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', id)
    .maybeSingle();
  // Absent rather than guessed: the trigger writes a profile at signup, and
  // if one is missing that is worth seeing rather than papering over.
  set({ displayName: profile?.display_name ?? null });
}
