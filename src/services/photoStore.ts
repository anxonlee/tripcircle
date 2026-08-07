import { Directory, File, Paths } from 'expo-file-system';
import { SaveFormat, manipulateAsync } from 'expo-image-manipulator';

/**
 * Durable storage for visit photos.
 *
 * `expo-image-picker` hands back a URI inside `Library/Caches/ImagePicker/`,
 * which iOS is free to purge whenever the device runs low on storage and
 * which is excluded from device backup. Storing that URI in the diary means
 * a visit's photo can silently become a broken reference — the one kind of
 * data loss a place diary cannot afford, because the photo IS the memory.
 *
 * So every picked image is written into the document directory, which the OS
 * does not reclaim and backups do include, and only that path is persisted.
 *
 * It is re-encoded rather than copied, which drops the file's metadata. A
 * phone photo normally carries GPS coordinates and a capture time in EXIF,
 * and a byte-for-byte copy would carry them into the diary and into every
 * backup the user shares — persisting location the app promises never to
 * keep, through a side door, and more precisely than the stamp-time fix ever
 * would have. Re-encoding also bakes in the EXIF rotation, so stripping the
 * tag does not leave photos sideways, and normalises iOS HEIC to JPEG.
 *
 * The original in the user's photo library is untouched; only our copy is
 * sanitised.
 *
 * Verifying this is fiddlier than it looks, because the simulator's stock
 * photos carry no GPS to begin with — a passing check there proves nothing.
 * Supply a control instead:
 *
 *   1. Write a JPEG with known GPS EXIF (PIL: `exif[0x8825] = {...}`) and
 *      read it back to confirm the tags are actually in the file.
 *   2. `xcrun simctl addmedia <udid> control.jpg`
 *   3. Attach it through the app, then read the EXIF of the file that lands
 *      in Documents/visit-photos.
 *
 * Last run: GPS latitude/longitude and device model present in the control,
 * absent from the stored copy, pixels identical.
 */

const PHOTO_DIR = 'visit-photos';

function photoDirectory(): Directory {
  const dir = new Directory(Paths.document, PHOTO_DIR);
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/**
 * Writes a freshly picked image into durable storage, stripped of metadata,
 * and returns the URI to persist.
 */
export async function persistVisitPhoto(pickedUri: string): Promise<string> {
  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const destination = new File(photoDirectory(), name);

  try {
    // No actions — the re-encode itself is what discards the metadata.
    const stripped = await manipulateAsync(pickedUri, [], {
      compress: 0.9,
      format: SaveFormat.JPEG,
    });
    await new File(stripped.uri).move(destination);
    return destination.uri;
  } catch {
    // Re-encoding failed. Keep the photo rather than lose the memory, but
    // this copy still carries whatever the original held — which is why the
    // policy describes the strip without claiming it is absolute.
    try {
      await new File(pickedUri).copy(destination);
      return destination.uri;
    } catch {
      return pickedUri;
    }
  }
}

/**
 * Writes a photo back out of a backup and returns its new durable URI.
 * Synchronous because it runs inside the import loop, one file per visit.
 */
export function restoreVisitPhoto(extension: string, base64: string): string {
  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${extension}`;
  const file = new File(photoDirectory(), name);
  file.create();
  file.write(base64, { encoding: 'base64' });
  return file.uri;
}

/**
 * Removes a stored photo when its visit is deleted, so the document
 * directory does not accumulate files nothing references. Never throws —
 * a missing file means the work is already done.
 */
export function deleteVisitPhoto(uri: string | undefined): void {
  if (!uri || !uri.includes(PHOTO_DIR)) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // An orphaned file is not worth failing a delete over.
  }
}
