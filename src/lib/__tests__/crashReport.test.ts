import {
  addCrash,
  CRASH_LOG_CAP,
  formatReport,
  type CrashRecord,
} from '../crashReport';

const crash = (over: Partial<CrashRecord> = {}): CrashRecord => ({
  at: '2026-08-16T10:00:00.000Z',
  source: 'render',
  fatal: true,
  message: 'TypeError: undefined is not an object',
  stack: 'at PlanScreen (PlanScreen.tsx:120)\nat renderWithHooks',
  componentStack: 'PlanScreen\nErrorBoundary',
  ...over,
});

const META = { version: '1.0.0', build: '10' };

describe('addCrash', () => {
  it('puts the newest first', () => {
    const log = addCrash(addCrash([], crash({ message: 'first' })), crash({ message: 'second' }));
    expect(log.map((c) => c.message)).toEqual(['second', 'first']);
  });

  it('keeps only the cap, dropping the oldest', () => {
    const log = Array.from({ length: CRASH_LOG_CAP + 3 }).reduce<CrashRecord[]>(
      (acc, _, i) => addCrash(acc, crash({ message: `e${i}` })),
      []
    );
    expect(log).toHaveLength(CRASH_LOG_CAP);
    expect(log[0].message).toBe(`e${CRASH_LOG_CAP + 2}`);
    expect(log.map((c) => c.message)).not.toContain('e0');
  });

  it('collapses a repeat rather than spending a slot on it', () => {
    // A crash loop must not push out the different, earlier crashes that
    // explain how it got there.
    const earlier = crash({ message: 'the one that started it' });
    let log = addCrash([], earlier);
    for (let i = 0; i < 20; i++) {
      log = addCrash(log, crash({ at: `2026-08-16T10:00:${String(i).padStart(2, '0')}.000Z` }));
    }
    expect(log).toHaveLength(2);
    expect(log[1]).toEqual(earlier);
    expect(log[0].at).toBe('2026-08-16T10:00:19.000Z');
  });

  it('does not collapse two different errors that arrive together', () => {
    const log = addCrash(addCrash([], crash({ message: 'a' })), crash({ message: 'b' }));
    expect(log).toHaveLength(2);
  });
});

describe('formatReport', () => {
  it('is empty when there is nothing to send', () => {
    expect(formatReport([], META)).toBe('');
  });

  it('names the build, because a report against an unknown build is noise', () => {
    expect(formatReport([crash()], META)).toContain('TripCircle 1.0.0 (10)');
  });

  it('carries the message and the top of the stack', () => {
    const out = formatReport([crash()], META);
    expect(out).toContain('TypeError: undefined is not an object');
    expect(out).toContain('at PlanScreen (PlanScreen.tsx:120)');
  });

  it('names the screen from the component stack', () => {
    expect(formatReport([crash()], META)).toContain('in PlanScreen < ErrorBoundary');
  });

  it('says when the app carried on', () => {
    expect(formatReport([crash({ fatal: false, source: 'js' })], META)).toContain('recovered');
    expect(formatReport([crash()], META)).not.toContain('recovered');
  });

  it('says whose clock the times are on', () => {
    // The reader is not necessarily in the sender's timezone.
    expect(formatReport([crash()], META)).toContain("phone's own clock");
  });

  it('strips the bundle URL but keeps the position', () => {
    // The dev bundle URL is ~200 characters of query string per frame; left
    // in, one frame fills the error screen and buries the Send button.
    const noisy =
      'at SettingsScreen (http://localhost:8081/index.bundle//&platform=ios&dev=true&lazy=true&minify=false:238244:68)';
    const out = formatReport([crash({ stack: noisy })], META);
    expect(out).toContain('at SettingsScreen (238244:68)');
    expect(out).not.toContain('platform=ios');
  });

  it('leaves a frame that carries no URL alone', () => {
    const out = formatReport([crash({ stack: 'at renderWithHooks' })], META);
    expect(out).toContain('at renderWithHooks');
  });

  it('does not print the message twice when the stack repeats it', () => {
    // A JS stack's first line is its own message; printed under the message
    // line it reads like two separate errors.
    const out = formatReport(
      [
        crash({
          message: 'Error: render boom',
          stack: 'Error: render boom\nat SettingsScreen (1:2)',
        }),
      ],
      META
    );
    expect(out.match(/Error: render boom/g)).toHaveLength(1);
    expect(out).toContain('at SettingsScreen (1:2)');
  });

  it('does not write "in at Screen"', () => {
    const out = formatReport([crash({ componentStack: 'at PlanScreen\nat Tabs' })], META);
    expect(out).toContain('in PlanScreen < Tabs');
    expect(out).not.toContain('in at ');
  });

  it('survives a crash with no stack at all', () => {
    const out = formatReport(
      [crash({ stack: null, componentStack: null, message: 'thrown string' })],
      META
    );
    expect(out).toContain('thrown string');
    expect(out).not.toContain('undefined');
  });
});
