/**
 * What a crash looks like once it is written down, and how a pile of them
 * becomes something a friend can send in one tap.
 *
 * The app carries no reporting SDK — the privacy page promises none — so the
 * report has to travel by hand. That constrains the format more than it
 * sounds: whatever comes out of here lands in a chat message, so it has to
 * survive being pasted, stay readable to the person sending it, and still
 * name the build it came from. A JSON blob would fail the middle one, and a
 * friend who cannot read what they are sending is right not to send it.
 *
 * Pure, and separate from the storage that holds it, so the capping and the
 * formatting can be tested without a device.
 */

export interface CrashRecord {
  /** ISO 8601, in the device's own clock — see the caveat in formatReport. */
  at: string;
  /** 'render' from the boundary, 'js' from the global handler. */
  source: 'render' | 'js';
  /** Whether the app could carry on afterwards. */
  fatal: boolean;
  message: string;
  stack: string | null;
  /** React's own tree trace. Only a render error has one. */
  componentStack: string | null;
}

/**
 * How many are kept.
 *
 * Small on purpose. These sit in the same AsyncStorage as the diary, and a
 * crash loop could otherwise write until the disk complains — which would
 * turn a bug into data loss, the one outcome the diary must never suffer.
 * Five is enough to show a pattern and small enough to paste.
 */
export const CRASH_LOG_CAP = 5;

/**
 * Newest first, capped, with an exact repeat of the newest collapsed.
 *
 * A crash loop produces the same error many times a second. Keeping all of
 * them would push out the earlier, different crashes that actually explain
 * the sequence, so a repeat refreshes the timestamp instead of taking a slot.
 */
export function addCrash(
  log: CrashRecord[],
  next: CrashRecord,
  cap: number = CRASH_LOG_CAP
): CrashRecord[] {
  const newest = log[0];
  if (
    newest &&
    newest.message === next.message &&
    newest.source === next.source &&
    newest.stack === next.stack
  ) {
    return [next, ...log.slice(1)];
  }
  return [next, ...log].slice(0, cap);
}

/**
 * Strips the bundle URL out of a stack frame, keeping the position.
 *
 * A frame arrives as `at SettingsScreen (http://localhost:8081/index.bundle
 * //&platform=ios&dev=true&…:238244:68)` — the useful part is the name and
 * the two numbers, and the ninety characters between them push everything
 * else off the screen. On the error screen it was burying the Send button
 * under one frame; in a chat message it makes the report unreadable, which
 * is the same as not having one.
 */
export function shortenFrame(line: string): string {
  return line.replace(/\((?:https?:\/\/|file:\/\/)[^)]*?(\d+:\d+)\)/g, '($1)');
}

/** One line per frame, trimmed — a stack is context, not the message. */
export function trimStack(stack: string | null, lines: number): string[] {
  if (!stack) return [];
  return stack
    .split('\n')
    .map((l) => shortenFrame(l.trim()))
    .filter((l) => l.length > 0)
    .slice(0, lines);
}

/**
 * The text that gets shared.
 *
 * Times are the sending device's local clock and are labelled as such: the
 * recipient is in the same city today, but "14:32" from a phone left on
 * another timezone would otherwise quietly disagree with when the app
 * actually broke.
 *
 * Nothing from the diary goes in here — not a visit, not a note, not a place
 * the user has been. A crash report that carries someone's Saturday is a
 * worse privacy failure than the SDK this format exists to avoid.
 */
export function formatReport(
  log: CrashRecord[],
  meta: { version: string; build: string }
): string {
  if (log.length === 0) return '';
  const head = `TripCircle ${meta.version} (${meta.build}) — ${log.length} ${
    log.length === 1 ? 'problem' : 'problems'
  }, newest first. Times are the phone's own clock.`;

  const blocks = log.map((c, i) => {
    // A JS stack repeats its own message on the first line. Printed under
    // `c.message` that is the same sentence twice, which reads like two
    // different errors at a glance.
    const frames = trimStack(c.stack, 7).filter((l) => l !== c.message);
    const lines = [
      `${i + 1}. ${c.at} · ${c.source === 'render' ? 'screen' : 'background'}${
        c.fatal ? '' : ' · recovered'
      }`,
      c.message,
      ...frames.slice(0, 6),
    ];
    // The component stack names the screen, which is usually the whole
    // diagnosis, so it earns its lines even though the JS stack is above it.
    // Its frames carry their own "at ", which "in ..." would double up.
    const tree = trimStack(c.componentStack, 4).map((l) =>
      l.replace(/^at\s+/, '')
    );
    if (tree.length > 0) lines.push('in ' + tree.join(' < '));
    return lines.join('\n');
  });

  return [head, ...blocks].join('\n\n');
}
