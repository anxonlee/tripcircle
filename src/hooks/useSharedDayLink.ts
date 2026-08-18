import { useEffect, useRef } from 'react';
import { Alert, Linking } from 'react-native';
import { placesService } from '../services/places';
import { useTripStore } from '../store/useTripStore';
import { decodeDayLink, unresolvedCount, type DecodeFailure } from '../lib/tripLink';

/**
 * Receiving a shared day (§14 F11, §342 "clone re-anchors and re-optimises").
 *
 * A link arrives two ways and both have to work: cold, when tapping it is
 * what launched the app, and warm, when the app was already running. They are
 * different APIs and the cold one is easy to forget, because it only shows up
 * on a device that was not already open — which is every device except the
 * one being developed on.
 *
 * Adopting is destructive: it replaces whatever the recipient had selected.
 * So it asks first, and says what it is about to overwrite. A link from a
 * friend should not be able to delete an afternoon someone spent choosing.
 *
 * What is adopted is the stops, their order, the window, the objective, and
 * any times the sender pinned to a stop.
 * The start place is not in the link and is not touched — the day recomputes
 * from wherever the recipient starts, which is the whole idea: the same
 * Saturday from a different doorstep.
 */
export function useSharedDayLink(): void {
  const setSelection = useTripStore((s) => s.setSelection);
  const setDayOrder = useTripStore((s) => s.setDayOrder);
  const setDayWindow = useTripStore((s) => s.setDayWindow);
  const setGoal = useTripStore((s) => s.setGoal);
  const setPinnedTimes = useTripStore((s) => s.setPinnedTimes);

  /**
   * Collapses the double delivery of ONE tap: on a cold start the same URL
   * can arrive through both `getInitialURL` and the `url` event, a few
   * hundred milliseconds apart, and would prompt twice.
   *
   * Deliberately a short window rather than remembering the URL for good.
   * Tapping the same link again minutes later is a new intent — someone who
   * adopted a day, pulled it about, and wants the original back — and the
   * first version of this guard silently ignored that tap until the app was
   * next killed, which reads as the link being broken.
   */
  const handled = useRef<{ url: string; at: number } | null>(null);
  const DUPLICATE_WINDOW_MS = 5_000;

  useEffect(() => {
    let cancelled = false;

    const handle = async (url: string | null) => {
      if (!url || cancelled) return;
      const last = handled.current;
      if (
        last &&
        last.url === url &&
        Date.now() - last.at < DUPLICATE_WINDOW_MS
      ) {
        return;
      }

      // A cold start delivers the launch URL milliseconds in, likely before
      // AsyncStorage has answered. Everything below reads or writes the trip
      // store — the "replaces N places" line would count defaults, and an
      // adoption written pre-hydration would be overwritten when the stored
      // state landed on top of it. So the link waits for the store.
      await tripStoreHydrated();
      if (cancelled) return;

      const all = await placesService.listPlaces();
      if (cancelled) return;
      const known = new Set(all.map((p) => p.id));
      const result = decodeDayLink(url, known);

      // Marked only once the link is recognised as ours. A URL for some other
      // part of the app should stay available to whatever does handle it.
      if (!result.ok && result.reason.kind === 'notADayLink') return;
      handled.current = { url, at: Date.now() };

      if (!result.ok) {
        const { title, body } = explain(result.reason);
        Alert.alert(title, body);
        return;
      }

      const { placeIds, window, goal, pinnedTimes } = result.day;
      const pinCount = pinnedTimes ? Object.keys(pinnedTimes).length : 0;
      const missing = unresolvedCount(url, known);
      const { selectedPlaceIds, startDayStep } = useTripStore.getState();
      const existing = selectedPlaceIds.length;
      /**
       * Adopting calls `setSelection`, which sends Start day back to its
       * first stop — so a link arriving mid-outing quietly ends the outing.
       * That is a bigger loss than the selection and it was not being named.
       *
       * `startDayStep > 0` is the whole signal there is: step zero is both
       * "not started" and "standing at the first stop", and the two are not
       * distinguishable here. Warning at zero would mean warning every
       * recipient about a day they never began, so the check errs towards
       * silence and only speaks once someone has visibly moved through one.
       */
      const midOuting = startDayStep > 0;

      const lines = [
        `${placeIds.length} ${placeIds.length === 1 ? 'place' : 'places'}, planned from ${formatMin(window.dayStartMin)} to ${formatMin(window.homeByMin)}.`,
        // Named rather than silently dropped: a day that arrives two stops
        // short with no explanation reads as the sender's mistake.
        missing > 0
          ? `${missing} ${missing === 1 ? 'stop is' : 'stops are'} not in your places and will be left out.`
          : null,
        // First of the two losses, because it is the one that cannot be
        // undone by picking the places again.
        midOuting
          ? 'You are partway through a day out. Opening this ends it and starts the new one from the beginning.'
          : null,
        existing > 0
          ? `This replaces the ${existing} ${existing === 1 ? 'place' : 'places'} you have selected.`
          : null,
        // Said before the re-anchoring line, because it is the exception to
        // it: everything else about the day is worked out again, and these
        // are the one thing the sender fixed that survives the journey.
        pinCount > 0
          ? `${pinCount === 1 ? 'One stop has a time' : `${pinCount} stops have times`} the sender fixed. ${pinCount === 1 ? 'It comes' : 'They come'} with the day, and you can change ${pinCount === 1 ? 'it' : 'them'}.`
          : null,
        'The route is worked out again from your own start place.',
      ].filter(Boolean) as string[];

      Alert.alert('Open this day?', lines.join('\n\n'), [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Open it',
          onPress: () => {
            setSelection(placeIds);
            // The sender's arrangement is the shared artefact. Setting the
            // order is what stops the optimiser resequencing it on arrival
            // into something the sender never saw.
            setDayOrder(placeIds);
            setDayWindow(window);
            setGoal(goal);
            // After `setSelection`, which clears the recipient's own pins.
            // The window goes in first for the same reason: a pin is only
            // meaningful inside the day it was fixed in.
            setPinnedTimes(pinnedTimes ?? {});
          },
        },
      ]);
    };

    Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener('url', (e) => handle(e.url));
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [setSelection, setDayOrder, setDayWindow, setGoal, setPinnedTimes]);
}

/**
 * Resolves once the trip store has come back from storage.
 *
 * The re-check after subscribing is the whole point. Hydration can finish in
 * the gap between asking whether it has and asking to be told when it does,
 * and `onFinishHydration` only reports the future — a listener registered a
 * moment too late is never called at all. The promise would then never
 * settle and the link would be dropped in silence: no prompt, no error,
 * nothing to retry against.
 *
 * That gap is not a remote corner. This function is only reached when
 * hydration is in flight, which is exactly the window it lives in.
 */
function tripStoreHydrated(): Promise<void> {
  if (useTripStore.persist.hasHydrated()) return Promise.resolve();
  return new Promise<void>((resolve) => {
    // Declared before subscribing, and with `let`. A listener that fired
    // during subscription would reach this binding before a `const` was
    // initialised, and that is a ReferenceError rather than an undefined
    // that optional chaining would forgive.
    let unsub: (() => void) | undefined;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      unsub?.();
      resolve();
    };
    unsub = useTripStore.persist.onFinishHydration(finish);
    if (useTripStore.persist.hasHydrated()) finish();
  });
}

function explain(reason: DecodeFailure): { title: string; body: string } {
  switch (reason.kind) {
    case 'tooNew':
      return {
        title: 'Made by a newer PIRT',
        body: 'This day was shared from a later version of the app. Updating should let you open it.',
      };
    case 'otherCity':
      return {
        title: 'A day somewhere else',
        body: 'This plan is for a different city than the places this copy of PIRT carries, so none of its stops are ones it knows.',
      };
    case 'empty':
      return {
        title: 'Nothing to open',
        body: 'None of the places in this day are in your list.',
      };
    default:
      return { title: 'Cannot open that link', body: 'It is not a PIRT day.' };
  }
}

/** Local to the alert; the app's own formatter lives behind heavier imports. */
function formatMin(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}
