import type { Visit } from '../../domain/diary';
import { importDiary } from '../diaryBackup';

/**
 * Restore is the one path where a bug destroys data the user cannot get
 * back, so the merge rules are pinned here: never drop an existing visit,
 * never double-add, never carry a photo path from a container that is gone.
 */

let fileContents = '';

jest.mock('expo-file-system', () => ({
  File: class {
    constructor(..._uris: unknown[]) {}
    text() {
      return Promise.resolve(fileContents);
    }
  },
  Paths: { cache: {}, document: {} },
}));

jest.mock('../photoStore', () => ({
  restoreVisitPhoto: (ext: string) => `file:///restored/photo${ext}`,
}));

const visit = (id: string, timestamp: number, extra: Partial<Visit> = {}): Visit => ({
  id,
  placeId: 'tartine-bakery',
  timestamp,
  wouldGoAgain: 'yes',
  ...extra,
});

function backup(visits: Visit[], photos: unknown[] = [], over: object = {}) {
  return JSON.stringify({
    format: 'tripcircle.diary',
    version: 1,
    exportedAt: '2026-07-27T00:00:00.000Z',
    visits,
    photos,
    ...over,
  });
}

/**
 * A file written by a build that called the format `pirt.diary`. Restoring
 * one has to keep working: the name on the tin changed, what the app accepts
 * did not. Without this the legacy branch has no coverage at all, since
 * `backup` above writes the current name.
 */
function legacyBackup(visits: Visit[], photos: unknown[] = [], over: object = {}) {
  return JSON.stringify({
    format: 'pirt.diary',
    version: 1,
    exportedAt: '2026-07-27T00:00:00.000Z',
    visits,
    photos,
    ...over,
  });
}

describe('importDiary', () => {
  it('rejects a file that is not a diary export', async () => {
    fileContents = JSON.stringify({ some: 'other file' });
    await expect(importDiary('file:///x.json', [])).rejects.toThrow(
      /not a TripCircle diary export/
    );
  });

  it('refuses a backup from a newer app version rather than guessing', async () => {
    fileContents = backup([], [], { version: 99 });
    await expect(importDiary('file:///x.json', [])).rejects.toThrow(/newer version/);
  });

  it('still restores a backup written when the format was called pirt.diary', async () => {
    fileContents = legacyBackup([visit('a', 100)]);
    const { visits, summary } = await importDiary('file:///x.json', []);
    expect(visits.map((v) => v.id)).toEqual(['a']);
    expect(summary).toMatchObject({ added: 1, skipped: 0 });
  });

  it('adds new visits and keeps them in chronological order', async () => {
    fileContents = backup([visit('b', 200), visit('a', 100)]);
    const { visits, summary } = await importDiary('file:///x.json', []);
    expect(visits.map((v) => v.id)).toEqual(['a', 'b']);
    expect(summary).toMatchObject({ added: 2, skipped: 0 });
  });

  it('is idempotent — restoring the same backup twice adds nothing', async () => {
    const existing = [visit('a', 100)];
    fileContents = backup([visit('a', 100)]);
    const { visits, summary } = await importDiary('file:///x.json', existing);
    expect(visits).toHaveLength(1);
    expect(summary).toMatchObject({ added: 0, skipped: 1 });
  });

  it('never removes a visit the backup does not contain', async () => {
    const existing = [visit('local-only', 50)];
    fileContents = backup([visit('from-backup', 100)]);
    const { visits } = await importDiary('file:///x.json', existing);
    expect(visits.map((v) => v.id)).toEqual(['local-only', 'from-backup']);
  });

  it('rewrites photoUri to the restored file', async () => {
    fileContents = backup(
      [visit('a', 100, { photoUri: 'file:///old/container/gone.jpg' })],
      [{ visitId: 'a', extension: '.jpg', base64: 'AAAA' }]
    );
    const { visits, summary } = await importDiary('file:///x.json', []);
    expect(visits[0].photoUri).toBe('file:///restored/photo.jpg');
    expect(summary.photosRestored).toBe(1);
  });

  it('drops a dead photo path when the backup carries no photo for it', async () => {
    // Otherwise the visit restores pointing at a container that no longer
    // exists, and the wall renders a permanently broken tile.
    fileContents = backup([visit('a', 100, { photoUri: 'file:///old/gone.jpg' })], []);
    const { visits, summary } = await importDiary('file:///x.json', []);
    expect(visits[0].photoUri).toBeUndefined();
    expect(summary.photosRestored).toBe(0);
  });
});
