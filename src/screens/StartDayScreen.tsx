import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CategoryPin, PIN_ANCHOR, PinSlot, StartPin } from '../components/CategoryPin';
import { transportIcon, transportLabel } from '../components/icons';
import { aggregateAll } from '../domain/diary';
import type { CuratedPlace } from '../domain/types';
import { formatDayEnd, formatTime } from '../lib/geo';
import { formatDuration, formatUsd, formatPriceBand } from '../lib/format';
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
  const step = useTripStore((s) => s.startDayStep);
  const setStep = useTripStore((s) => s.setStartDayStep);
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
  const plan = useMemo<DayPlan | null>(() => {
    if (!startPlace || !legOptionsFn || selectedPlaces.length === 0) return null;
    return optimizeDay({
      startPlace,
      places: selectedPlaces,
      dayStartMin: anchorMin,
      homeByMin,
      goal,
      // The same mode set the day was planned with. Guiding someone into a
      // driving leg they cannot take would be worse here than on the plan
      // screen, because here they are already out.
      legOptions: withAvailableModes(legOptionsFn, { hasCar: hasCar ?? false }),
    });
  }, [startPlace, selectedPlaces, legOptionsFn, anchorMin, homeByMin, goal, hasCar]);

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
   * Too late for the day the user set. Re-anchoring can only move the start
   * forward, so once now is past the window there is nothing honest to show —
   * and silently stretching `homeByMin` would overrule a choice they made.
   */
  if (anchorMin > LATEST_HOME_BY_MIN - MIN_DAY_WINDOW_MIN || anchorMin >= homeByMin) {
    return (
      <Shell insets={insets} title="Start day" onClose={() => navigation.goBack()}>
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Your day window has passed</Text>
          <Text style={styles.emptyText}>
            It is {formatTime(anchorMin)}, and you asked to be home by{' '}
            {formatTime(homeByMin)}. Widen the window on the plan screen, or
            start this day tomorrow — the places are still chosen.
          </Text>
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
  if (plan.stops.length > 0 && reachable.length === 0) {
    return (
      <Shell insets={insets} title="Start day" onClose={() => navigation.goBack()}>
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Not enough of the day left</Text>
          <Text style={styles.emptyText}>
            Starting now, at {formatTime(anchorMin)}, everywhere on this day has
            closed by the time you would arrive. The places are still chosen —
            start the day earlier tomorrow.
          </Text>
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
            Back at {startPlace.name} by {formatDayEnd(plan.homeMin)}
          </Text>
          <Pressable style={styles.primary} onPress={() => navigation.goBack()}>
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
                    Arrive {formatTime(current.arriveMin)} ·{' '}
                    {current.place.visitDurationMin} min ·{' '}
                    {formatPriceBand(current.place.priceBand)}
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
                  — {current.waitMin} min to wait
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
