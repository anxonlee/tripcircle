import type { Visit } from '../../domain/diary';
import { mergeVisits, parseBackup } from '../diaryRestore';

/**
 * A backup is the only untrusted input this app takes. These are mostly
 * about what it must refuse and what it must salvage — losing someone's
 * history to a strict parser is as bad as admitting junk into it.
 */

const file = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    format: 'tripcircle.diary',
    version: 1,
    exportedAt: '2026-08-19T00:00:00.000Z',
    visits: [],
    photos: [],
    ...over,
  });

const row = (over: Record<string, unknown> = {}) => ({
  id: 'v1',
  placeId: 'ferry-building',
  timestamp: 1_700_000_000_000,
  wouldGoAgain: 'yes',
  ...over,
});

describe('what it refuses', () => {
  it('rejects a file that is not JSON at all', () => {
    expect(() => parseBackup('not json')).toThrow(/not a PIRT diary/);
  });

  it('rejects JSON that is not an object', () => {
    expect(() => parseBackup('[1,2,3]')).toThrow(/not a PIRT diary/);
    expect(() => parseBackup('null')).toThrow(/not a PIRT diary/);
    expect(() => parseBackup('"a string"')).toThrow(/not a PIRT diary/);
  });

  it('rejects someone else’s export', () => {
    expect(() => parseBackup(file({ format: 'other.app' }))).toThrow(
      /not a PIRT diary/
    );
  });

  it('rejects a file with no visits array', () => {
    expect(() => parseBackup(file({ visits: 'lots' }))).toThrow(/not a PIRT diary/);
  });

  it('refuses a backup from a newer build rather than half-reading it', () => {
    expect(() => parseBackup(file({ version: 2 }))).toThrow(/newer version/);
  });

  it('still accepts what older builds wrote', () => {
    const out = parseBackup(file({ format: 'pirt.diary', visits: [row()] }));
    expect(out.visits).toHaveLength(1);
  });

  it('accepts a file with no version field as version zero', () => {
    const out = parseBackup(file({ version: undefined, visits: [row()] }));
    expect(out.visits).toHaveLength(1);
  });
});

describe('what it drops', () => {
  it('drops a row that is not an object', () => {
    const out = parseBackup(file({ visits: [null, 'nope', 42, row()] }));
    expect(out.visits).toHaveLength(1);
    expect(out.dropped).toBe(3);
  });

  it('drops a visit with no id, since nothing could ever edit or delete it', () => {
    const out = parseBackup(file({ visits: [row({ id: undefined }), row({ id: '  ' })] }));
    expect(out.visits).toHaveLength(0);
    expect(out.dropped).toBe(2);
  });

  it('drops a visit with no place', () => {
    expect(parseBackup(file({ visits: [row({ placeId: undefined })] })).visits).toHaveLength(0);
  });

  it('drops a visit with no usable timestamp', () => {
    const out = parseBackup(
      file({
        visits: [
          row({ id: 'a', timestamp: undefined }),
          row({ id: 'b', timestamp: 'yesterday' }),
          row({ id: 'c', timestamp: NaN }),
        ],
      })
    );
    expect(out.visits).toHaveLength(0);
    expect(out.dropped).toBe(3);
  });

  it('admits the same id only once', () => {
    // The bug this exists for: a file listing one visit twice used to insert
    // both, leaving two visits under one id where editing or deleting either
    // finds only the first.
    const out = parseBackup(
      file({ visits: [row({ note: 'first' }), row({ note: 'second' })] })
    );
    expect(out.visits).toHaveLength(1);
    expect(out.visits[0].note).toBe('first');
    expect(out.dropped).toBe(1);
  });

  it('never carries a photo path from the phone it came from', () => {
    // The path points into a container that does not exist here. Carrying it
    // gives a visit a photo that cannot load.
    const out = parseBackup(
      file({ visits: [row({ photoUri: 'file:///old/container/pic.jpg' })] })
    );
    expect(out.visits[0].photoUri).toBeUndefined();
  });
});

describe('what it repairs', () => {
  it('keeps a visit whose answer is unreadable, and says it did', () => {
    const out = parseBackup(
      file({ visits: [row({ wouldGoAgain: 'definitely' }), row({ id: 'v2' })] })
    );
    expect(out.visits).toHaveLength(2);
    expect(out.visits[0].wouldGoAgain).toBe('maybe');
    expect(out.repaired).toBe(1);
  });

  it('drops a rating from outside the scale rather than clamping it', () => {
    // A 9 is not a strong 5; it is a number from somewhere else.
    const out = parseBackup(
      file({ visits: [row({ rating: 9 }), row({ id: 'v2', rating: 2.5 }), row({ id: 'v3', rating: 4 })] })
    );
    expect(out.visits[0].rating).toBeUndefined();
    expect(out.visits[1].rating).toBeUndefined();
    expect(out.visits[2].rating).toBe(4);
  });

  it('drops a blank note rather than storing an empty one', () => {
    const out = parseBackup(file({ visits: [row({ note: '   ' })] }));
    expect(out.visits[0].note).toBeUndefined();
  });

  it('keeps only context tags it recognises', () => {
    const out = parseBackup(
      file({
        visits: [
          row({ contextTags: { companion: 'friends', pace: 'sprinting', extra: 'x' } }),
        ],
      })
    );
    expect(out.visits[0].contextTags).toEqual({ companion: 'friends' });
  });

  it('drops a tags object with nothing recognisable in it', () => {
    const out = parseBackup(file({ visits: [row({ contextTags: { who: 'me' } })] }));
    expect(out.visits[0].contextTags).toBeUndefined();
  });
});

describe('photos', () => {
  it('indexes photos by visit', () => {
    const out = parseBackup(
      file({
        visits: [row()],
        photos: [{ visitId: 'v1', extension: '.heic', base64: 'AAA' }],
      })
    );
    expect(out.photos.get('v1')?.extension).toBe('.heic');
  });

  it('defaults a missing extension rather than writing a file with none', () => {
    const out = parseBackup(
      file({ visits: [row()], photos: [{ visitId: 'v1', base64: 'AAA' }] })
    );
    expect(out.photos.get('v1')?.extension).toBe('.jpg');
  });

  it('ignores a photo with no data', () => {
    const out = parseBackup(
      file({ visits: [row()], photos: [{ visitId: 'v1', base64: '' }] })
    );
    expect(out.photos.size).toBe(0);
  });

  it('takes the first of a duplicated visit id', () => {
    const out = parseBackup(
      file({
        visits: [row()],
        photos: [
          { visitId: 'v1', base64: 'FIRST' },
          { visitId: 'v1', base64: 'SECOND' },
        ],
      })
    );
    expect(out.photos.get('v1')?.base64).toBe('FIRST');
  });

  it('survives photos being absent entirely', () => {
    const out = parseBackup(file({ visits: [row()], photos: undefined }));
    expect(out.photos.size).toBe(0);
  });
});

describe('mergeVisits', () => {
  const v = (id: string, timestamp: number): Visit => ({
    id,
    placeId: 'a',
    timestamp,
    wouldGoAgain: 'yes',
  });

  it('keeps what is already there when ids collide', () => {
    const mine = { ...v('x', 100), note: 'mine' };
    const theirs = { ...v('x', 100), note: 'theirs' };
    expect(mergeVisits([mine], [theirs])).toEqual([mine]);
  });

  it('is a no-op the second time the same file is restored', () => {
    const existing = [v('a', 1), v('b', 2)];
    const once = mergeVisits(existing, [v('c', 3)]);
    expect(mergeVisits(once, [v('c', 3)])).toEqual(once);
  });

  it('cannot delete anything when an older backup lands on a newer diary', () => {
    const existing = [v('new', 500)];
    const merged = mergeVisits(existing, [v('old', 100)]);
    expect(merged.map((x) => x.id)).toEqual(['old', 'new']);
  });

  it('returns the log in time order', () => {
    const merged = mergeVisits([v('b', 200)], [v('c', 300), v('a', 100)]);
    expect(merged.map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });
});
