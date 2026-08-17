import AsyncStorage from '@react-native-async-storage/async-storage';
import { addCrash, type CrashRecord } from '../lib/crashReport';

/**
 * Where crashes are kept until someone sends them.
 *
 * On the device, because there is nowhere else: the app ships no reporting
 * SDK and the privacy page promises none. That makes this the whole of
 * "crash reporting" here — the app remembers what went wrong, and Settings
 * gives the user a way to hand it over. Nothing is transmitted by the app
 * itself, ever.
 */
const KEY = 'pirt-crash-log';

/**
 * Read the log. Never throws: this is called while handling an error, and a
 * reporter that can itself fail is a reporter that hides the bug it was
 * meant to catch.
 */
export async function readCrashLog(): Promise<CrashRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Written by this app, but a half-finished write or an older shape would
    // both land here, and a bad row must not take the good ones with it.
    return parsed.filter(
      (c): c is CrashRecord =>
        typeof c === 'object' && c !== null && typeof (c as CrashRecord).message === 'string'
    );
  } catch {
    return [];
  }
}

/**
 * Record one crash. Read-modify-write, which is safe enough here because
 * crashes are rare and the loop case is collapsed by `addCrash` — and
 * because losing a duplicate report costs nothing.
 */
export async function recordCrash(next: CrashRecord): Promise<void> {
  try {
    const log = addCrash(await readCrashLog(), next);
    await AsyncStorage.setItem(KEY, JSON.stringify(log));
  } catch {
    // Swallowed on purpose. There is nothing sensible to do with a failure
    // to write a crash report, and rethrowing here would crash the crash.
  }
}

export async function clearCrashLog(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    /* see recordCrash */
  }
}

/** Turns anything thrown into something with a message and maybe a stack. */
export function describeThrown(e: unknown): { message: string; stack: string | null } {
  if (e instanceof Error) {
    return { message: `${e.name}: ${e.message}`, stack: e.stack ?? null };
  }
  return { message: typeof e === 'string' ? e : JSON.stringify(e), stack: null };
}

/**
 * Catch the errors the boundary cannot see.
 *
 * An ErrorBoundary only catches throws during render. A failure inside a
 * press handler, a timer, or an await lands in React Native's global handler
 * instead — the app shows the red box in development and, in a release
 * build, frequently just does nothing at all. Those are exactly the reports
 * that never arrive: the friend saw "the button did nothing" and has no
 * screen to send.
 *
 * The previous handler is kept and called, because it is the one that shows
 * the red box and ends the process on a fatal — replacing it silently would
 * make development worse in order to make TestFlight better.
 */
export function installGlobalErrorHandler(): void {
  const errorUtils = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  if (!errorUtils?.getGlobalHandler || !errorUtils.setGlobalHandler) return;

  const previous = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((e: unknown, isFatal?: boolean) => {
    const { message, stack } = describeThrown(e);
    // Deliberately not awaited: the process may be about to end, and a
    // handler that blocks on storage would delay the crash it is reporting.
    void recordCrash({
      at: new Date().toISOString(),
      source: 'js',
      fatal: isFatal === true,
      message,
      stack,
      componentStack: null,
    });
    previous?.(e, isFatal);
  });
}

interface ErrorUtilsLike {
  getGlobalHandler?: () => ((e: unknown, isFatal?: boolean) => void) | undefined;
  setGlobalHandler?: (h: (e: unknown, isFatal?: boolean) => void) => void;
}
