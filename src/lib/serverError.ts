/**
 * What to show when the server says no.
 *
 * Errors from here arrive in three shapes — a thrown Error, a PostgREST
 * object with a `message`, or something else entirely — and every screen
 * that talks to the server has to render one. Having them all reach for the
 * same function is what stops one of them printing "[object Object]".
 */
/**
 * A dropped connection and a timeout both arrive as something unreadable —
 * "Aborted", or a native TLS exception with a Swift file name in it. Neither
 * tells anyone what to do, and both mean the same thing to the person
 * holding the phone.
 */
const NETWORK = /abort|network request failed|tls|timed? ?out|fetch failed/i;

export function serverMessage(e: unknown): string {
  const raw =
    e instanceof Error
      ? e.message
      : e && typeof e === 'object' && 'message' in e
        ? String((e as { message: unknown }).message)
        : '';
  if (NETWORK.test(raw)) {
    return 'Could not reach the server. Check your connection and try again.';
  }
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e) {
    return String((e as { message: unknown }).message);
  }
  return 'Something went wrong.';
}
