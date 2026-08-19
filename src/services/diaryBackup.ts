import { File, Paths } from 'expo-file-system';
import type { Visit } from '../domain/diary';
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  mergeVisits,
  parseBackup,
  type BackupPhoto,
} from '../lib/diaryRestore';
import { restoreVisitPhoto } from './photoStore';

/**
 * Export and restore of the visit log (PRD §3A, FD6).
 *
 * The diary lives only on the device, so deleting the app deletes years of
 * memories with it. Phase 2 will have accounts and sync; until then a user
 * needs some way to carry their history off the phone, and a file they own
 * is the version that keeps the promise in §3A.6 — nothing leaves the device
 * unless the user explicitly sends it somewhere.
 *
 * Photos are embedded as base64 rather than referenced, because a backup
 * pointing at file paths inside a deleted app's container restores nothing.
 * That makes the file large; it also makes it complete.
 */

/**
 * The marker written into every backup this app produces.
 *
 * This branch is TripCircle, so `pirt.diary` moved to the legacy list rather
 * than staying the current name. The swap is safe in both directions: builds
 * that wrote `pirt.diary` accepted `tripcircle.diary` as legacy, so a file
 * written now still restores on an older install, and a file written by an
 * older install still restores here.
 *
 * The names and the reading of them live in `lib/diaryRestore`, which is
 * pure and therefore testable — a backup is the one input this app does not
 * write itself, and it was the one input with no tests.
 */
interface BackupFile {
  format: string;
  version: number;
  exportedAt: string;
  visits: Visit[];
  photos: BackupPhoto[];
}

export interface ImportSummary {
  added: number;
  /** Already in the diary — the same file restored twice. */
  skipped: number;
  photosRestored: number;
  /** Rows that were not visits and could not be salvaged. */
  dropped: number;
  /** Visits kept with a field repaired, e.g. an unreadable answer. */
  repaired: number;
}

/**
 * Writes a backup into the cache directory and returns its URI for the share
 * sheet. Cache is right here: the file exists to be handed to Files or
 * AirDrop, and a copy left behind after that is just clutter the OS should
 * be free to reclaim.
 */
export async function exportDiary(visits: Visit[]): Promise<string> {
  const photos: BackupPhoto[] = [];
  for (const visit of visits) {
    if (!visit.photoUri) continue;
    try {
      const source = new File(visit.photoUri);
      if (!source.exists) continue;
      photos.push({
        visitId: visit.id,
        extension: source.extension || '.jpg',
        base64: await source.base64(),
      });
    } catch {
      // A photo that cannot be read should not cost the user the rest of
      // their diary — the visit itself still exports.
    }
  }

  const payload: BackupFile = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    visits,
    photos,
  };

  const stamp = new Date().toISOString().slice(0, 10);
  // The name the user sees in the share sheet and in Files, so it names the
  // app they are using. Nothing reads it back: restore goes by the `format`
  // field inside the file, not by the filename.
  const target = new File(Paths.cache, `tripcircle-diary-${stamp}.json`);
  if (target.exists) target.delete();
  target.create();
  target.write(JSON.stringify(payload));
  return target.uri;
}

/**
 * Restores a backup, merging rather than replacing: visits already present
 * (matched by id) are left alone. Restoring the same file twice is a no-op,
 * and restoring an older backup onto a newer diary cannot delete anything.
 */
export async function importDiary(
  fileUri: string,
  existing: Visit[]
): Promise<{ visits: Visit[]; summary: ImportSummary }> {
  const raw = await new File(fileUri).text();
  const { visits: incoming, photos, dropped, repaired } = parseBackup(raw);

  const known = new Set(existing.map((v) => v.id));
  const fresh: Visit[] = [];
  let photosRestored = 0;

  for (const visit of incoming) {
    if (known.has(visit.id)) continue;
    const photo = photos.get(visit.id);
    if (!photo) {
      fresh.push(visit);
      continue;
    }
    try {
      fresh.push({
        ...visit,
        photoUri: restoreVisitPhoto(photo.extension, photo.base64),
      });
      photosRestored += 1;
    } catch {
      // A photo that will not write should not cost the user the visit.
      fresh.push(visit);
    }
  }

  return {
    visits: mergeVisits(existing, fresh),
    summary: {
      added: fresh.length,
      // Counted against what parsed, not against the file's row count:
      // rows that were never visits are `dropped`, and calling those
      // "already here" would tell the user their diary contains junk it
      // does not.
      skipped: incoming.length - fresh.length,
      photosRestored,
      dropped,
      repaired,
    },
  };
}
