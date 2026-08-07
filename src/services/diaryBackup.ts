import { File, Paths } from 'expo-file-system';
import type { Visit } from '../domain/diary';
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

const FORMAT = 'pirt.diary';
/** Files written before the app was renamed. Still restorable. */
const LEGACY_FORMATS = ['tripcircle.diary'];
const VERSION = 1;

interface BackupPhoto {
  visitId: string;
  /** File extension including the dot, e.g. '.heic'. */
  extension: string;
  base64: string;
}

interface BackupFile {
  format: string;
  version: number;
  exportedAt: string;
  visits: Visit[];
  photos: BackupPhoto[];
}

export interface ImportSummary {
  added: number;
  skipped: number;
  photosRestored: number;
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
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    visits,
    photos,
  };

  const stamp = new Date().toISOString().slice(0, 10);
  const target = new File(Paths.cache, `pirt-diary-${stamp}.json`);
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
  const parsed = JSON.parse(raw) as Partial<BackupFile>;

  const recognised =
    parsed.format === FORMAT ||
    (typeof parsed.format === 'string' && LEGACY_FORMATS.includes(parsed.format));
  if (!recognised || !Array.isArray(parsed.visits)) {
    throw new Error('That file is not a PIRT diary export.');
  }
  if ((parsed.version ?? 0) > VERSION) {
    throw new Error('That backup was made by a newer version of the app.');
  }

  const known = new Set(existing.map((v) => v.id));
  const photosByVisit = new Map(
    (parsed.photos ?? []).map((p) => [p.visitId, p] as const)
  );

  const added: Visit[] = [];
  let photosRestored = 0;
  for (const visit of parsed.visits) {
    if (known.has(visit.id)) continue;
    // The exported photoUri points into the container this backup came from,
    // which no longer exists here. Either we rewrite it to a restored file or
    // we drop it — never carry the dead path across.
    const { photoUri: _stale, ...visitWithoutPhoto } = visit;
    const photo = photosByVisit.get(visit.id);
    if (!photo) {
      added.push(visitWithoutPhoto);
      continue;
    }
    try {
      added.push({
        ...visitWithoutPhoto,
        photoUri: restoreVisitPhoto(photo.extension, photo.base64),
      });
      photosRestored += 1;
    } catch {
      added.push(visitWithoutPhoto);
    }
  }

  return {
    visits: [...existing, ...added].sort((a, b) => a.timestamp - b.timestamp),
    summary: {
      added: added.length,
      skipped: parsed.visits.length - added.length,
      photosRestored,
    },
  };
}
