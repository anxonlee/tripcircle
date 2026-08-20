/**
 * What to show when the server says no.
 *
 * Errors from here arrive in three shapes — a thrown Error, a PostgREST
 * object with a `message`, or something else entirely — and every screen
 * that talks to the server has to render one. Having them all reach for the
 * same function is what stops one of them printing "[object Object]".
 */
export function serverMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e) {
    return String((e as { message: unknown }).message);
  }
  return 'Something went wrong.';
}
