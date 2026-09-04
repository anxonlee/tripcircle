import type { ContextTags, Visit, WouldGoAgain } from '../domain/diary';

/**
 * Reading a backup file, which is the only untrusted input this app has.
 *
 * Everything else the diary holds was written by the app itself. A backup is
 * a JSON file that has been out on a filesystem, through a chat client, and
 * possibly through a text editor, and it comes back claiming to be someone's
 * history. It gets checked like input from a stranger, because it is.
 *
 * Separated from `services/diaryBackup` so it can be tested without a device:
 * the file reading and the photo writing are the parts that need one, and
 * neither is the part that can be malformed.
 *
 * The bias throughout is to keep what can be kept. Someone restoring a
 * backup has usually just lost their phone, and a parser that refuses the
 * whole file over one bad row would be choosing purity over their memories.
 * What it will not do is admit a row that cannot be identified, placed in
 * time, or attached to a place — those are not partial visits, they are not
 * visits.
 */

export const BACKUP_FORMAT = 'tripcircle.diary';
/** Names earlier builds wrote. Still restorable, and must stay that way. */
export const LEGACY_BACKUP_FORMATS = ['pirt.diary'];
export const BACKUP_VERSION = 1;

export interface BackupPhoto {
  visitId: string;
  /** File extension including the dot, e.g. '.heic'. */
  extension: string;
  base64: string;
}

export interface ParsedBackup {
  visits: Visit[];
  photos: Map<string, BackupPhoto>;
  /** Rows that were not visits at all and could not be salvaged. */
  dropped: number;
  /** Visits kept, but with a field that had to be repaired. */
  repaired: number;
}

const ANSWERS: WouldGoAgain[] = ['yes', 'maybe', 'no'];

/** Non-empty string, or nothing. */
function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim().length > 0 ? v : undefined;
}

/**
 * The parse. Throws only when the file is not one of ours at all — a wrong
 * file picked in the document browser is the common case, and it deserves a
 * clear refusal rather than a diary quietly gaining nothing.
 */
export function parseBackup(raw: string): ParsedBackup {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error('That file is not a TripCircle diary export.');
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('That file is not a TripCircle diary export.');
  }

  const format = parsed.format;
  const recognised =
    format === BACKUP_FORMAT ||
    (typeof format === 'string' && LEGACY_BACKUP_FORMATS.includes(format));
  if (!recognised || !Array.isArray(parsed.visits)) {
    throw new Error('That file is not a TripCircle diary export.');
  }

  const version = typeof parsed.version === 'number' ? parsed.version : 0;
  if (version > BACKUP_VERSION) {
    throw new Error('That backup was made by a newer version of the app.');
  }

  const visits: Visit[] = [];
  /*
   * Ids seen in THIS file, not just in the diary already on the phone. A
   * file can list the same visit twice — most easily because it was itself
   * exported from a diary that had absorbed a duplicate — and admitting
   * both puts two visits with one id in the log, where editing or deleting
   * either one silently finds only the first.
   */
  const seen = new Set<string>();
  let dropped = 0;
  let repaired = 0;

  for (const row of parsed.visits as unknown[]) {
    if (!row || typeof row !== 'object') {
      dropped += 1;
      continue;
    }
    const r = row as Record<string, unknown>;
    const id = str(r.id);
    const placeId = str(r.placeId);
    const timestamp = typeof r.timestamp === 'number' && Number.isFinite(r.timestamp)
      ? r.timestamp
      : undefined;
    // Identity, a place, and a moment. Without all three there is nothing to
    // restore: it cannot be deduplicated, shown on a wall, or ordered.
    if (!id || !placeId || timestamp === undefined) {
      dropped += 1;
      continue;
    }
    if (seen.has(id)) {
      dropped += 1;
      continue;
    }
    seen.add(id);

    let wouldGoAgain = r.wouldGoAgain as WouldGoAgain;
    if (!ANSWERS.includes(wouldGoAgain)) {
      // Kept, not dropped — the visit happened even if the opinion is
      // unreadable. "maybe" is the answer that claims least, and the count
      // of repairs is reported so the substitution is not silent.
      wouldGoAgain = 'maybe';
      repaired += 1;
    }

    const visit: Visit = { id, placeId, timestamp, wouldGoAgain };

    const placeName = str(r.placeName);
    if (placeName) visit.placeName = placeName;
    const note = str(r.note);
    if (note) visit.note = note;
    // Ratings outside the scale are dropped rather than clamped: a 9 is not
    // a strong 5, it is a number from somewhere else.
    if (typeof r.rating === 'number' && Number.isInteger(r.rating) && r.rating >= 0 && r.rating <= 5) {
      visit.rating = r.rating;
    }
    const tags = sanitiseTags(r.contextTags);
    if (tags) visit.contextTags = tags;
    // photoUri is deliberately not carried across. The path points into the
    // container the backup came from, which does not exist here; the photo
    // is restored from the embedded base64 or not at all.

    visits.push(visit);
  }

  const photos = new Map<string, BackupPhoto>();
  if (Array.isArray(parsed.photos)) {
    for (const row of parsed.photos as unknown[]) {
      if (!row || typeof row !== 'object') continue;
      const p = row as Record<string, unknown>;
      const visitId = str(p.visitId);
      const base64 = str(p.base64);
      if (!visitId || !base64) continue;
      // First wins, matching every other reader in the app: a duplicate is
      // malformed, and taking the last lets anything appended rewrite it.
      if (photos.has(visitId)) continue;
      photos.set(visitId, {
        visitId,
        extension: str(p.extension) ?? '.jpg',
        base64,
      });
    }
  }

  return { visits, photos, dropped, repaired };
}

function sanitiseTags(raw: unknown): ContextTags | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const out: ContextTags = {};
  if (
    r.companion === 'solo' ||
    r.companion === 'date' ||
    r.companion === 'family' ||
    r.companion === 'friends'
  ) {
    out.companion = r.companion;
  }
  if (r.pace === 'relaxed' || r.pace === 'packed') out.pace = r.pace;
  const occasion = str(r.occasion);
  if (occasion) out.occasion = occasion;
  return out.companion || out.pace || out.occasion ? out : undefined;
}

/**
 * Merge, never replace. Visits already present win, so restoring the same
 * file twice is a no-op and restoring an old backup onto a newer diary
 * cannot delete anything.
 */
export function mergeVisits(existing: Visit[], incoming: Visit[]): Visit[] {
  const known = new Set(existing.map((v) => v.id));
  const added = incoming.filter((v) => !known.has(v.id));
  return [...existing, ...added].sort((a, b) => a.timestamp - b.timestamp);
}
