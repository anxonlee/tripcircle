/**
 * Reading whatever the sign-in email actually contained.
 *
 * Supabase decides between a link and a code by what the Magic Link template
 * mentions: `{{ .ConfirmationURL }}` sends a link, `{{ .Token }}` sends a
 * six-digit code. That is a project setting rather than something the client
 * chooses, so an app that only accepts a code is an app that breaks when
 * somebody edits a template — or when a new project is stood up with the
 * default one, which is exactly how this project started.
 *
 * So the field takes either. A code is typed; a link is pasted, which is
 * what people do when the thing in their inbox is not the thing the screen
 * asked for.
 *
 * There is a second reason to accept the hash: corporate mail scanners
 * (Microsoft Defender's Safe Links, for one) follow links in incoming mail,
 * and a magic link is one-time — so by the time the user taps it, it has
 * already been spent and reads as "token expired". A pasted link still
 * carries a usable hash.
 */

export type OtpInput =
  | { kind: 'code'; token: string }
  | { kind: 'link'; tokenHash: string };

/** Six digits is what `{{ .Token }}` produces. */
const CODE = /^\d{6}$/;

export function parseOtpInput(raw: string): OtpInput | null {
  const text = raw.trim();
  if (text === '') return null;

  // Spaces and dashes are how a code arrives when someone copies it out of a
  // sentence, or types it the way it was displayed.
  const compact = text.replace(/[\s-]/g, '');
  if (CODE.test(compact)) return { kind: 'code', token: compact };

  // A confirmation URL, pasted whole. Parsed by hand rather than with URL,
  // which React Native only polyfills partially, and because the value can
  // arrive wrapped in angle brackets by a mail client.
  const hash = text.match(/[?&]token_hash=([A-Za-z0-9_-]+)/);
  if (hash) return { kind: 'link', tokenHash: hash[1] };

  // Some templates use `token=` rather than `token_hash=`. It is the same
  // value from the client's point of view.
  const plain = text.match(/[?&]token=([A-Za-z0-9_-]+)/);
  if (plain) {
    return CODE.test(plain[1])
      ? { kind: 'code', token: plain[1] }
      : { kind: 'link', tokenHash: plain[1] };
  }

  return null;
}
