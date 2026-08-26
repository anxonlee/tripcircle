import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CategoryPin, PIN_ANCHOR, PinSlot, StartPin } from '../components/CategoryPin';
import { transportIcon, transportLabel } from '../components/icons';
import { aggregateAll } from '../domain/diary';
import type { CuratedPlace } from '../domain/types';
import { formatDayTime, formatTime } from '../lib/geo';
import { formatDuration, formatUsd, formatPlacePrice } from '../lib/format';
import { googleMapsStopUrl } from '../lib/maps';
import { optimizeDay, withAvailableModes, type DayPlan } from '../lib/optimizer';
import type { LegOptionsFn } from '../services/routing';
import { LATEST_HOME_BY_MIN, MIN_DAY_WINDOW_MIN } from '../lib/planner';
import type { RootStackParamList } from '../navigation';
import { placesService } from '../services/places';
import { routingService } from '../services/routing';
import { useDiaryStore } from '../store/useDiaryStore';
import { useTripStore } from '../store/useTripStore';
import { colors } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'StartDay'>;

/**
 * Start day (PRD §3.5, F7) — the planned day, one stop at a time.
 *
 * The Plan screen answers "what should the day be". This answers "where am I
 * meant to be now", which is a different question and needs a different
 * screen: one stop, its arrival time, how to reach it, and the two things a
 * person actually does there — navigate to it, and record having been.
 *
 * It is the step between planning a day and stamping one. Without it the app
 * supports both ends of its own loop and nothing in the middle.
 */

/** Minutes since midnight, from the wall clock. */
/**
 * The way past a refusal.
 *
 * Quiet on purpose, and second in the reading order: the screen's job is
 * still to say the day cannot be walked as planned, and this is the answer
 * to somebody who has read that and meant it anyway. A button styled to
 * compete with the explanation above it would be the app talking people
 * into a day it has just told them not to take.
 */
function AnywayButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.anyway, pressed && styles.anywayPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Run the day anyway, outside the window you set"
    >
      <MaterialCommunityIcons
        name="play-outline"
        size={15}
        color={colors.textSecondary}
      />
      <Text style={styles.anywayText}>Run it anyway</Text>
    </Pressable>
  );
}

function nowMinutes(now: Date): number {
  return now.getHours() * 60 + now.getMinutes();
}

export function StartDayScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const startPlace = useTripStore((s) => s.startPlace);
  const selectedIds = useTripStore((s) => s.selectedPlaceIds);
  const goal = useTripStore((s) => s.goal);
  const homeByMin = useTripStore((s) => s.homeByMin);
  const hasCar = useTripStore((s) => s.hasCar);
  const dayOrder = useTripStore((s) => s.dayOrder);
  const pinnedTimes = useTripStore((s) => s.pinnedTimes);
  const step = useTripStore((s) => s.startDayStep);
  const setStep = useTripStore((s) => s.setStartDayStep);
  const beginDayOut = useTripStore((s) => s.beginDayOut);
  const endDayOut = useTripStore((s) => s.endDayOut);
  const visits = useDiaryStore((s) => s.visits);

  const [legOptionsFn, setLegOptionsFn] = useState<LegOptionsFn | null>(null);

  /**
   * The day is re-anchored to now, not to the window the user set this
   * morning. A plan built for a 09:00 departure and opened at 11:20 puts
   * every arrival time in the past, and a guidance screen whose times have
   * already happened is worse than no guidance.
   *
   * Captured once, when the screen mounts, rather than read live. Re-solving
   * every minute would shuffle the day under the user's thumb while they
   * were reading it.
   */
  const [anchorMin] = useState(() => nowMinutes(new Date()));

  /**
   * The user has read a refusal and asked for the day anyway.
   *
   * Both refusals below are about honesty rather than safety: a day whose
   * times have already happened is worse than no guidance, and a day where
   * everywhere is shut is not guidance at all. Neither is a reason the app
   * gets to have the last word — someone walking a route to see it, or
   * heading out late on purpose, is not confused, and telling them to come
   * back tomorrow is the app declining to do the one thing it is for.
   *
   * So the refusals stay, they just stop being the end of the road. Saying
   * yes solves the day against the latest the clock allows instead of the
   * window the user set this morning, and the stepper carries a standing
   * notice saying so — the app has said its piece, and it keeps saying it
   * rather than pretending the times are a promise.
   *
   * Read straight from the store rather than mirrored into local state, and
   * that is not tidiness. Mirrored, the copy lands a render after
   * rehydration does, and the effect below reads a `windowGone` computed
   * from the stored window against a local override that has not caught up
   * — so returning to a running day would end it, and take the step with it.
   *
   * Their day window itself is untouched. This says what one outing did, not
   * what the user prefers, which is why every change to the selection clears
   * it along with the rest of the day.
   */
  const dayStartedAt = useTripStore((st) => st.dayStartedAt);
  const ignoresWindow = useTripStore((st) => st.dayIgnoresWindow);
  const ignoreDayWindow = useTripStore((st) => st.ignoreDayWindow);
  /*
   * An override belongs to the outing that asked for it and to that
   * calendar day. Checked rather than trusted, because the flag is
   * persisted: left to stand on its own it would still be set at nine the
   * next morning, quietly stretching a day window the user had not been
   * asked about — which is the exact move the refusal exists to prevent.
   */
  const ignoreWindow =
    ignoresWindow &&
    dayStartedAt !== null &&
    new Date(dayStartedAt).toDateString() === new Date().toDateString();

  /**
   * Resolved through the service rather than the seed list directly, so a
   * place discovered through a live provider is still findable here (§12).
   */
  const [selectedPlaces, setSelectedPlaces] = useState<CuratedPlace[]>([]);
  useEffect(() => {
    placesService.listPlaces().then((all) => {
      const byId = new Map(all.map((p) => [p.id, p]));
      const chosen = selectedIds
        .map((id) => byId.get(id))
        .filter((p): p is CuratedPlace => !!p);
      setSelectedPlaces(chosen);
      // Fetched together with the places, and given the points, so a live
      // provider prices this day rather than falling back to estimates. The
      // day out is usually the same one the plan screen just bought, so this
      // costs nothing beyond the first look.
      const points = [
        ...(startPlace ? [startPlace.location] : []),
        ...chosen.map((p) => p.location),
      ];
      routingService
        .getLegOptionsFn(points)
        .then((fn) => setLegOptionsFn(() => fn));
    });
  }, [selectedIds, startPlace]);

  /**
   * Re-solved here rather than handed over from the Plan screen. `optimizeDay`
   * is pure, so passing a plan through navigation would only risk carrying a
   * stale one — and the start time differs from the Plan screen's anyway.
   */
  /**
   * The day as the user arranged it, reconciled the same way the Plan screen
   * reconciles it — known ids in their order, anything new at the end.
   */
  const orderedPlaces = useMemo(() => {
    if (!dayOrder) return selectedPlaces;
    const byId = new Map(selectedPlaces.map((p) => [p.id, p]));
    const known = dayOrder
      .map((id) => byId.get(id))
      .filter((p): p is CuratedPlace => p !== undefined);
    return [...known, ...selectedPlaces.filter((p) => !dayOrder.includes(p.id))];
  }, [selectedPlaces, dayOrder]);

  const pinMap = useMemo(
    () => new Map(Object.entries(pinnedTimes)),
    [pinnedTimes]
  );

  const plan = useMemo<DayPlan | null>(() => {
    if (!startPlace || !legOptionsFn || orderedPlaces.length === 0) return null;
    return optimizeDay({
      startPlace,
      places: orderedPlaces,
      dayStartMin: anchorMin,
      // Overridden, the day is solved against the last minute before
      // midnight rather than a home-by that has already gone by.
      //
      // A target, not a ceiling — the optimiser reports lateness rather than
      // refusing, so a day started at 22:38 finishes "by 1:21 next day" and
      // says so. That is the honest answer to running a day this late, and
      // clamping it would only hide the overrun.
      homeByMin: ignoreWindow ? LATEST_HOME_BY_MIN : homeByMin,
      goal,
      // The same mode set the day was planned with. Guiding someone into a
      // driving leg they cannot take would be worse here than on the plan
      // screen, because here they are already out.
      legOptions: withAvailableModes(legOptionsFn, { hasCar: hasCar ?? false }),
      /*
       * Both of the user's own decisions come with them out of the door.
       * This screen re-solves against the real clock rather than the planned
       * start, and without these it was re-solving against their intentions
       * too: a day arranged by hand came back in the optimiser's order the
       * moment it was started, and a time pinned to a stop was not a
       * constraint any more. Whatever is on the Plan screen is what someone
       * is standing in the street following.
       */
      fixedOrder: dayOrder !== null,
      pinnedTimes: pinMap,
    });
  }, [
    startPlace,
    orderedPlaces,
    legOptionsFn,
    anchorMin,
    homeByMin,
    ignoreWindow,
    goal,
    hasCar,
    dayOrder,
    pinMap,
  ]);

  /**
   * Whether this screen is actually going to run a day, rather than refuse.
   *
   * Every refusal below is included, and that is the whole point: `plan` is
   * computed before any of them, so keying off the plan alone marked a day
   * started that the screen then declined to run — leaving a banner
   * pointing at a screen that says "your day window has passed".
   */
  const willRun =
    Boolean(startPlace) &&
    selectedPlaces.length > 0 &&
    anchorMin <= LATEST_HOME_BY_MIN - MIN_DAY_WINDOW_MIN &&
    (ignoreWindow || anchorMin < homeByMin) &&
    Boolean(plan) &&
    plan!.stops.length > 0 &&
    // Same test as the "everywhere is shut" refusal below, computed here
    // because hooks cannot live after an early return.
    (ignoreWindow ||
      plan!.stops.some(
        (st) => !st.place.openHours || st.beginMin < st.place.openHours.close
      ));

  /**
   * The window has gone by while the day was still marked as running —
   * somebody set off and never finished. Nothing more can happen today, so
   * the outing is over; the places stay chosen, which is what this screen
   * tells them.
   */
  const windowGone =
    !ignoreWindow &&
    (anchorMin > LATEST_HOME_BY_MIN - MIN_DAY_WINDOW_MIN ||
      anchorMin >= homeByMin);

  useEffect(() => {
    if (willRun) beginDayOut();
    else if (windowGone) endDayOut();
  }, [willRun, windowGone, beginDayOut, endDayOut]);

  /** Places stamped since midnight — what "done" means on this screen. */
  const stampedToday = useMemo(() => {
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    const since = midnight.getTime();
    const ids = new Set<string>();
    for (const [placeId, s] of aggregateAll(visits)) {
      if (s.lastVisitedAt >= since) ids.add(placeId);
    }
    return ids;
  }, [visits]);

  if (!startPlace || selectedPlaces.length === 0) {
    return (
      <Shell insets={insets} title="Start day" onClose={() => navigation.goBack()}>
        <View style={styles.center}>
          <Text style={styles.emptyText}>
            There is no day to start. Pick some places in Explore and plan them
            first.
          </Text>
        </View>
      </Shell>
    );
  }

  /**
   * Too late for any day at all: there is not `MIN_DAY_WINDOW_MIN` left
   * before midnight. Nothing can be offered here, not even an override —
   * the day would have to run into tomorrow, which is a different day.
   */
  if (anchorMin > LATEST_HOME_BY_MIN - MIN_DAY_WINDOW_MIN) {
    return (
      <Shell insets={insets} title="Start day" onClose={() => navigation.goBack()}>
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>There is no day left</Text>
          <Text style={styles.emptyText}>
            It is {formatTime(anchorMin)}, and a day has to finish before
            midnight. The places are still chosen — start this one tomorrow.
          </Text>
        </View>
      </Shell>
    );
  }

  /**
   * Past the window the user set. Re-anchoring can only move the start
   * forward, and silently stretching `homeByMin` would overrule a choice they
   * made — so the day is refused rather than quietly rescheduled.
   *
   * Refused, but not forbidden. Overruling their window without asking and
   * refusing to run when they ask are two different things, and only the
   * first is the app deciding for them.
   */
  if (anchorMin >= homeByMin && !ignoreWindow) {
    return (
      <Shell insets={insets} title="Start day" onClose={() => navigation.goBack()}>
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Your day window has passed</Text>
          <Text style={styles.emptyText}>
            It is {formatTime(anchorMin)}, and you asked to be home by{' '}
            {formatTime(homeByMin)}. Widen the window on the plan screen, or
            start this day tomorrow — the places are still chosen.
          </Text>
          <AnywayButton onPress={ignoreDayWindow} />
        </View>
      </Shell>
    );
  }

  if (!plan) {
    return (
      <Shell insets={insets} title="Start day" onClose={() => navigation.goBack()}>
        <View style={styles.center}>
          <Text style={styles.emptyText}>Working out the day…</Text>
        </View>
      </Shell>
    );
  }

  /**
   * A window wide enough to be legal is not a window wide enough to be a day.
   * Starting at 23:21 leaves 38 minutes, which clears `MIN_DAY_WINDOW_MIN` and
   * still puts every stop after closing — observed, with the stepper offering
   * directions to a bakery that had shut two and a half hours earlier.
   *
   * The test is whether anything at all can still be reached, not whether the
   * arithmetic is valid. A day where some stops work is still worth walking,
   * and their own warnings say which; a day where none do is not guidance.
   */
  const reachable = plan.stops.filter(
    (s) => !s.place.openHours || s.beginMin < s.place.openHours.close
  );
  if (plan.stops.length > 0 && reachable.length === 0 && !ignoreWindow) {
    return (
      <Shell insets={insets} title="Start day" onClose={() => navigation.goBack()}>
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Not enough of the day left</Text>
          <Text style={styles.emptyText}>
            Starting now, at {formatTime(anchorMin)}, everywhere on this day has
            closed by the time you would arrive. The places are still chosen —
            start the day earlier tomorrow.
          </Text>
          <AnywayButton onPress={ignoreDayWindow} />
        </View>
      </Shell>
    );
  }

  const total = plan.stops.length;
  const done = step >= total;
  const current = done ? null : plan.stops[step];

  return (
    <Shell
      insets={insets}
      title={done ? 'Day complete' : `Stop ${step + 1} of ${total}`}
      onClose={() => navigation.goBack()}
    >
      {/*
        The refusal, kept on screen rather than dismissed by the override.
        Someone who asked for a day outside its window still needs to know
        which parts of it are fiction, and a warning that appears once and
        goes is a warning you are not reading when it matters.
      */}
      {ignoreWindow && (
        <View style={styles.overrideNotice}>
          <MaterialCommunityIcons
            name="alert-outline"
            size={14}
            color={colors.warning}
          />
          <Text style={styles.overrideNoticeText}>
            {anchorMin >= homeByMin
              ? `Running past your ${formatTime(homeByMin)} finish. `
              : ''}
            Times are worked out from now, and some of these places will
            already be shut.
          </Text>
        </View>
      )}

      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            { width: `${(Math.min(step, total) / total) * 100}%` },
          ]}
        />
      </View>

      {done ? (
        <View style={styles.center}>
          <View style={styles.doneBadge}>
            <MaterialCommunityIcons name="check" size={32} color="#FFFFFF" />
          </View>
          <Text style={styles.emptyTitle}>Day complete</Text>
          <Text style={styles.emptyText}>
            {total} stop{total === 1 ? '' : 's'} ·{' '}
            {formatDuration(plan.totals.travelMin)} travelling ·{' '}
            {formatUsd(plan.totals.totalUsd)} in fares
          </Text>
          <Text style={styles.emptyText}>
            Back at {startPlace.name} by {formatDayTime(plan.homeMin)}
          </Text>
          <Pressable
            style={styles.primary}
            onPress={() => {
              // Finishing is the one exit that ends the outing. Closing the
              // screen does not: leaving the app mid-day is the normal way
              // to use it, which is what the banner exists for.
              endDayOut();
              navigation.goBack();
            }}
          >
            <Text style={styles.primaryText}>Done</Text>
          </Pressable>
        </View>
      ) : (
        current && (
          <ScrollView contentContainerStyle={styles.body}>
            <View style={styles.legChip}>
              <MaterialCommunityIcons
                name={transportIcon[current.leg.mode]}
                size={14}
                color={colors.textSecondary}
              />
              <Text style={styles.legText}>
                {step === 0 ? `From ${startPlace.name} · ` : 'Next · '}
                {transportLabel[current.leg.mode]}{' '}
                {formatDuration(current.leg.durationMin)}
                {current.leg.costUsd > 0 ? ` · ${formatUsd(current.leg.costUsd)}` : ''}
              </Text>
            </View>

            <View style={styles.card}>
              <View style={styles.cardHead}>
                <PinSlot>
                  <CategoryPin
                    categories={current.place.themes}
                    size={38}
                    label={String(current.order)}
                  />
                </PinSlot>
                <View style={styles.cardText}>
                  <Text style={styles.stopName}>{current.place.name}</Text>
                  <Text style={styles.stopMeta}>
                    Arrive {formatDayTime(current.arriveMin)} ·{' '}
                    {current.place.visitDurationMin} min
                    {formatPlacePrice(current.place)
                      ? ` · ${formatPlacePrice(current.place)}`
                      : ''}
                  </Text>
                </View>
              </View>

              {current.waitMin >= 15 && (
                <Text style={styles.wait}>
                  {/* Estimated hours are hedged, here as on the place card —
                      a wait stated to the minute off a guessed window is the
                      planner presenting a guess as fact. */}
                  {current.place.hoursEstimated ? 'Usually opens at' : 'Opens at'}{' '}
                  {current.place.openHours
                    ? formatTime(current.place.openHours.open)
                    : ''}{' '}
                  — {formatDuration(current.waitMin)} to wait
                </Text>
              )}

              {current.place.tips ? (
                <Text style={styles.tips}>{current.place.tips}</Text>
              ) : null}

              {current.warnings.map((w, i) => (
                <View key={i} style={styles.warningRow}>
                  <MaterialCommunityIcons
                    name="alert-outline"
                    size={13}
                    color={colors.warning}
                  />
                  <Text style={styles.warningText}>{w}</Text>
                </View>
              ))}

              <Pressable
                style={styles.mapsBtn}
                onPress={() => Linking.openURL(googleMapsStopUrl(current.place.location, current.leg.mode))}
                accessibilityRole="button"
                accessibilityLabel={`Navigate to ${current.place.name} in Google Maps`}
              >
                <MaterialCommunityIcons
                  name="navigation-variant"
                  size={16}
                  color={colors.accent}
                />
                <Text style={styles.mapsBtnText}>Navigate in Maps</Text>
              </Pressable>
            </View>

            {/*
              Stamping is why this screen is worth having: the diary is meant
              to be written where the visit happens, not reconstructed at home
              from memory. The stop is already known, so the stamp screen
              skips straight to the question.
            */}
            {stampedToday.has(current.place.id) ? (
              <View style={styles.stamped}>
                <MaterialCommunityIcons
                  name="check-circle"
                  size={16}
                  color={colors.positive}
                />
                <Text style={styles.stampedText}>Stamped today</Text>
              </View>
            ) : (
              <Pressable
                style={styles.primary}
                onPress={() =>
                  navigation.navigate('Stamp', { placeId: current.place.id })
                }
              >
                <MaterialCommunityIcons name="bookmark-plus-outline" size={16} color="#FFFFFF" />
                <Text style={styles.primaryText}>Stamp this visit</Text>
              </Pressable>
            )}

            <View style={styles.navRow}>
              <Pressable
                style={[styles.navBtn, step === 0 && styles.navBtnOff]}
                disabled={step === 0}
                onPress={() => setStep(step - 1)}
                accessibilityRole="button"
                accessibilityLabel="Previous stop"
              >
                <MaterialCommunityIcons
                  name="chevron-left"
                  size={20}
                  color={step === 0 ? colors.textMuted : colors.textPrimary}
                />
                <Text
                  style={[styles.navBtnText, step === 0 && styles.navBtnTextOff]}
                >
                  Back
                </Text>
              </Pressable>
              <Pressable style={styles.navBtn} onPress={() => setStep(step + 1)}>
                <Text style={styles.navBtnText}>
                  {step === total - 1 ? 'Finish' : 'Next stop'}
                </Text>
                <MaterialCommunityIcons
                  name="chevron-right"
                  size={20}
                  color={colors.textPrimary}
                />
              </Pressable>
            </View>
          </ScrollView>
        )
      )}
    </Shell>
  );
}

function Shell({
  insets,
  title,
  onClose,
  children,
}: {
  insets: { top: number; bottom: number };
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.screen, { paddingTop: insets.top + 6 }]}>
      <View style={styles.header}>
        <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
          <MaterialCommunityIcons name="close" size={22} color={colors.textSecondary} />
        </Pressable>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.headerSpacer} />
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
  },
  title: { fontSize: 16, fontWeight: '500', color: colors.textPrimary },
  headerSpacer: { flex: 1 },
  progressTrack: {
    height: 3,
    backgroundColor: colors.surfaceAlt,
    marginHorizontal: 16,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: { height: 3, backgroundColor: colors.accent },
  body: { padding: 16, gap: 14, paddingBottom: 40 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 32,
  },
  legChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: colors.surfaceAlt,
  },
  legText: { fontSize: 12, color: colors.textSecondary },
  card: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardText: { flex: 1, gap: 2 },
  stopName: { fontSize: 18, fontWeight: '500', color: colors.textPrimary },
  stopMeta: { fontSize: 12, color: colors.textSecondary },
  wait: { fontSize: 12, color: colors.warning },
  tips: { fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
  warningRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  warningText: { flex: 1, fontSize: 12, color: colors.warning, lineHeight: 17 },
  mapsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  mapsBtnText: { fontSize: 14, fontWeight: '500', color: colors.accent },
  stamped: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
  },
  stampedText: { fontSize: 14, color: colors.positive },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 46,
    borderRadius: 14,
    backgroundColor: colors.accent,
    paddingHorizontal: 20,
  },
  primaryText: { fontSize: 14, fontWeight: '500', color: '#FFFFFF' },
  anyway: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 42,
    borderRadius: 13,
    paddingHorizontal: 18,
    backgroundColor: colors.surfaceAlt,
  },
  anywayPressed: { opacity: 0.6 },
  anywayText: { fontSize: 14, fontWeight: '500', color: colors.textSecondary },
  /**
   * Above the progress bar rather than in the scrolling body, so it cannot be
   * scrolled away from — it is a caveat on the whole day, not on one stop.
   */
  overrideNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 10,
  },
  overrideNoticeText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: colors.warning,
  },
  navRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  navBtnOff: { opacity: 0.4 },
  navBtnText: { fontSize: 14, fontWeight: '500', color: colors.textPrimary },
  navBtnTextOff: { color: colors.textMuted },
  doneBadge: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: colors.positive,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
  },
});
