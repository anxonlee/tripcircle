import type { CuratedPlace } from '../domain/types';
import { formatTime } from './geo';

/**
 * The place card's "Open now" line, incl. past-midnight closers (close >
 * 24:00). Pure — lives here rather than in the component so it can be
 * tested with fake timers, the same split the optimizer uses.
 *
 * `hoursEstimated` marks hours that are a category default rather than the
 * venue's own — 206 of the 421 records carrying hours. Those must not render
 * as the confident "Open now": a friend who walks to a closed shop because
 * the card said otherwise stops trusting every number in the app. "Usually"
 * is the whole fix — the same line, hedged exactly as much as the data is.
 */
export function openStatus(p: CuratedPlace): {
  open: boolean;
  label: string;
  text: string;
} {
  if (!p.openHours) return { open: true, label: 'Open now', text: '' };
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const { open, close } = p.openHours;
  const isOpen =
    (nowMin >= open && nowMin < close) ||
    (nowMin + 1440 >= open && nowMin + 1440 < close);
  const usually = p.hoursEstimated === true;
  return isOpen
    ? {
        open: true,
        label: usually ? 'Usually open' : 'Open now',
        text: `til ${formatTime(close)}`,
      }
    : {
        open: false,
        label: '',
        text: `${usually ? 'Usually opens' : 'Opens'} ${formatTime(open)}`,
      };
}
