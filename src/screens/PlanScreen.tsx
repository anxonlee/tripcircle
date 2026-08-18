import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import { GestureDetector, type PanGesture } from 'react-native-gesture-handler';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CategoryPin, PIN_ANCHOR, PinSlot, StartPin } from '../components/CategoryPin';
import { DayWindowControl } from '../components/DayWindowControl';
import { PinTimeSheet } from '../components/PinTimeSheet';
import { ReorderableStack } from '../components/ReorderableStack';
import { categoryIcon, transportIcon, transportLabel } from '../components/icons';
import { TimelineNode } from '../components/IconTile';
import type { CuratedPlace, TransportMode } from '../domain/types';
import { formatDayEnd, formatTime } from '../lib/geo';
import {
  formatDayTotal,
  formatDuration,
  formatUsd,
  formatPlacePrice,
} from '../lib/format';
import {
  droppedStopsWarning,
  dayOverviewMisstatesTransit,
  googleMapsDirUrl,
  googleMapsStopUrl,
  waypointLimit,
} from '../lib/maps';
import { DATASET_CITY, encodeDayLink } from '../lib/tripLink';
import {
  optimizeDay,
  type DayPlan,
  type Goal,
  type LegOptionsFn,
} from '../lib/optimizer';
import { suggestGapFillers } from '../lib/planner';
import type { RootStackParamList } from '../navigation';
import { placesService } from '../services/places';
import { routingService } from '../services/routing';
import { useDiaryStore } from '../store/useDiaryStore';
import { useFoundPlacesStore } from '../store/useFoundPlacesStore';
import { useMyPlacesStore } from '../store/useMyPlacesStore';
import { useTripStore, useUiStore } from '../store/useTripStore';
import { categoryColors, colors, pressedWell, tint } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'DayPlan'>;

/**
 * How long a stop must be held to open arrange mode.
 *
 * A shade longer than the ~500ms iOS uses for the same gesture on the home
 * screen, which is the length people's hands already know. Long enough that a
 * thumb resting on a row while reading does not trip it; short enough that
 * someone deliberately holding does not let go first.
 *
 * This is the only way into arrange mode, which is what makes the haptic on
 * landing part of the feature rather than a flourish: an invisible gesture
 * that also gives no answer is one nobody can confirm they performed.
 */
const ARRANGE_HOLD_MS = 800;

/**
 * The tap that says a hold has landed.
 *
 * Swallowing everything is deliberate and it covers two different cases: a
 * device with no haptic engine, and a build made before the native module was
 * added, where the call throws rather than rejects. Neither is worth a crash —
 * the gesture still works, it just goes unremarked.
 */
function tapFeedback() {
  try {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  } catch {
    // nothing to say
  }
}

/**
 * The four objectives, in the order they appear in the bar and the pager.
 * Ordered as a spectrum on money-versus-time, with Least Walking last
 * because it sits on a different axis entirely.
 *
 * "Least Walking" is a literal description of what the optimiser does: it
 * penalises walking distance. It is deliberately not called accessible,
 * step-free, or wheelchair-friendly. The model holds no accessibility data —
 * no lift locations, no step-free exits, no low-floor vehicle information —
 * so any of those labels would be a claim the software cannot support.
 */
const OBJECTIVES: { goal: Goal; label: string; icon: 'piggy-bank-outline' | 'scale-balance' | 'lightning-bolt' | 'seat-passenger' }[] = [
  { goal: 'economic', label: 'Economic', icon: 'piggy-bank-outline' },
  { goal: 'balanced', label: 'Balanced', icon: 'scale-balance' },
  { goal: 'fastest', label: 'Fastest', icon: 'lightning-bolt' },
  { goal: 'leastWalking', label: 'Least Walking', icon: 'seat-passenger' },
];

/**
 * Plan day — the optimizer's output made visible (ui-guide §1.4: never show
 * an optimized result without its numbers). Clay dashed loop on the map,
 * numbered pins in route order, summary cells, timeline with leg chips, and
 * a four-objective bar over a swipeable pager.
 *
 * All four plans are solved once when the selection changes and held in a
 * memo. Switching objective, by tap or by swipe, only reads that cache.
 */
export function PlanScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const startPlace = useTripStore((s) => s.startPlace);
  const myPlaces = useMyPlacesStore((s) => s.places);
  const foundPlaces = useFoundPlacesStore((s) => s.places);
  const selectedIds = useTripStore((s) => s.selectedPlaceIds);
  const goal = useTripStore((s) => s.goal);
  const setGoal = useTripStore((s) => s.setGoal);
  const togglePlace = useTripStore((s) => s.togglePlace);
  const dayStartMin = useTripStore((s) => s.dayStartMin);
  const homeByMin = useTripStore((s) => s.homeByMin);
  const setDayWindow = useTripStore((s) => s.setDayWindow);
  const dayOrder = useTripStore((s) => s.dayOrder);
  const setDayOrder = useTripStore((s) => s.setDayOrder);
  const clearDayOrder = useTripStore((s) => s.clearDayOrder);
  const pinnedTimes = useTripStore((s) => s.pinnedTimes);
  const setPinnedTime = useTripStore((s) => s.setPinnedTime);
  const clearPinnedTime = useTripStore((s) => s.clearPinnedTime);
  const highlightedId = useUiStore((s) => s.highlightedPlaceId);
  const setHighlighted = useUiStore((s) => s.setHighlighted);
  const dismissed = useUiStore((s) => s.dismissedPlaceIds);
  const dismissSuggestion = useUiStore((s) => s.dismissSuggestion);
  const visits = useDiaryStore((s) => s.visits);
  const hydrated = useTripStore((s) => s.hydrated);
  const { width } = useWindowDimensions();

  const [allPlaces, setAllPlaces] = useState<CuratedPlace[]>([]);
  const [selectedPlaces, setSelectedPlaces] = useState<CuratedPlace[]>([]);
  const [legOptionsFn, setLegOptionsFn] = useState<LegOptionsFn | null>(null);
  const mapRef = useRef<MapView>(null);
  const pagerRef = useRef<ScrollView>(null);
  /**
   * The sheet's scrollable, handed to the reorder handles so their drag can
   * outrank it. Without this the scroll view claims a vertical pan the moment
   * it starts and the row never moves.
   */
  const sheetScrollRef = useRef<any>(null);
  const [editing, setEditing] = useState(false);
  /** The stop whose time is being fixed, if the sheet is open. */
  const [pinning, setPinning] = useState<{
    placeId: string;
    name: string;
    suggested: number;
  } | null>(null);
  /** Set once a hold has run its course, read when the finger comes off. */
  const holdArmed = useRef(false);

  useEffect(() => {
    placesService.listPlaces().then((all) => {
      setAllPlaces(all);
      const byId = new Map(all.map((p) => [p.id, p]));
      const chosen = selectedIds
        .map((id) => byId.get(id))
        .filter((p): p is CuratedPlace => !!p);
      setSelectedPlaces(chosen);
      // The points have to go with the request: a live provider prices the
      // legs it is told about and falls back to estimates for the rest, so
      // calling this bare would leave the day costed by guesswork.
      const points = [
        ...(startPlace ? [startPlace.location] : []),
        ...chosen.map((p) => p.location),
      ];
      routingService
        .getLegOptionsFn(points)
        .then((fn) => setLegOptionsFn(() => fn));
    });
    // `myPlaces` so a place put away while a day is on screen leaves it,
    // rather than lingering until the next cold start.
  }, [selectedIds, startPlace, myPlaces, foundPlaces]);

  /**
   * The day in the order the user arranged, if they arranged one (F6).
   *
   * Reconciled rather than replaced: a stored order that no longer matches
   * the selection keeps the places it still knows, in their places, and puts
   * anything new at the end. Adding a place from the gap strip should not
   * discard an arrangement made by hand.
   */
  const orderedPlaces = useMemo(() => {
    if (!dayOrder) return selectedPlaces;
    const byId = new Map(selectedPlaces.map((p) => [p.id, p]));
    const known = dayOrder
      .map((id) => byId.get(id))
      .filter((p): p is CuratedPlace => p !== undefined);
    const added = selectedPlaces.filter((p) => !dayOrder.includes(p.id));
    return [...known, ...added];
  }, [selectedPlaces, dayOrder]);

  /**
   * Every objective is solved here, once, and cached until the selection
   * changes. Four solves of a typical day cost single-digit milliseconds
   * together, so paying for all of them up front buys instant switching.
   */
  /**
   * The pins as the optimiser wants them. Stored as an object so it
   * persists, passed as a Map because the schedule looks one up per stop —
   * and rebuilt only when the pins change, or every solve would see a new
   * object and re-run.
   */
  const pinMap = useMemo(
    () => new Map(Object.entries(pinnedTimes)),
    [pinnedTimes]
  );

  const plans = useMemo<Record<Goal, DayPlan> | null>(() => {
    /*
     * Nothing is solved until storage has answered. `dayOrder` decides
     * whether the optimiser may reorder at all, and it arrives a beat after
     * the first render — solving before it lands showed a hand-arranged day
     * in the optimiser's order, which then jumped to the user's once the
     * saved arrangement caught up.
     */
    if (!hydrated || !startPlace || !legOptionsFn || orderedPlaces.length === 0)
      return null;
    const base = {
      startPlace,
      places: orderedPlaces,
      dayStartMin,
      homeByMin,
      legOptions: legOptionsFn,
      // The four objectives still differ with a fixed order — they choose
      // transport per leg, not just the sequence.
      fixedOrder: dayOrder !== null,
      pinnedTimes: pinMap,
    };
    return {
      economic: optimizeDay({ ...base, goal: 'economic' }),
      balanced: optimizeDay({ ...base, goal: 'balanced' }),
      fastest: optimizeDay({ ...base, goal: 'fastest' }),
      leastWalking: optimizeDay({ ...base, goal: 'leastWalking' }),
    };
  }, [
    hydrated,
    startPlace,
    orderedPlaces,
    legOptionsFn,
    dayStartMin,
    homeByMin,
    dayOrder,
    pinMap,
  ]);

  const plan = plans?.[goal] ?? null;
  const goalIndex = OBJECTIVES.findIndex((o) => o.goal === goal);

  /**
   * Where the pager opens — at mount, and again when arranging ends and the
   * pager remounts.
   *
   * On iOS `contentOffset` is not an initial-only prop: any change to its
   * value is re-applied as an instant, unanimated jump. Passing the live
   * goal index made every tap on the bar a three-way race — selectGoal
   * starts an animated scrollTo, the setGoal re-render stomps that animation
   * with the prop, and the interrupted animation fires its momentum-end at a
   * garbage offset that onPagerSettled rounds to a NEIGHBOURING page.
   * Tapping Fastest selected Least Walking; tapping Balanced, Economic.
   *
   * `editing` is deliberately the only dependency. Recomputing on goal
   * changes is precisely the bug; recomputing when the pager remounts after
   * arranging is the one time the prop must be fresh, because the goal may
   * have changed while the pager did not exist.
   */
  const pagerMountOffset = useMemo(
    () => ({ x: goalIndex * width, y: 0 }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editing]
  );

  /**
   * The page a programmatic scroll is heading for; null when the pager is
   * the user's. A tap has to survive its own scroll animation — the scrollTo
   * below emits exactly one momentum-end when it lands, and without this
   * marker that event is indistinguishable from a swipe.
   */
  const pendingPage = useRef<number | null>(null);

  /** Tap on the bar: set the goal and bring the pager along. */
  const selectGoal = useCallback(
    (next: Goal) => {
      const i = OBJECTIVES.findIndex((o) => o.goal === next);
      pendingPage.current = i;
      pagerRef.current?.scrollTo({ x: i * width, animated: true });
      setGoal(next);
    },
    [width, setGoal]
  );

  /**
   * Swipe: keep the bar in sync. Reads cache only, never re-solves.
   *
   * A settle that lands where a tap was already heading is that tap's own
   * scroll reporting in, and is swallowed — the goal is already set. A
   * settle anywhere else is the user's, whether or not a scroll was in
   * flight (grabbing the pager mid-animation is allowed to win). The index
   * is clamped because paging bounce can report past either end.
   */
  const onPagerSettled = useCallback(
    (x: number) => {
      const i = Math.min(
        OBJECTIVES.length - 1,
        Math.max(0, Math.round(x / width))
      );
      if (pendingPage.current !== null && i === pendingPage.current) {
        pendingPage.current = null;
        return;
      }
      pendingPage.current = null;
      const next = OBJECTIVES[i]?.goal;
      if (next && next !== goal) setGoal(next);
    },
    [width, goal, setGoal]
  );

  const routeCoords = useMemo(() => {
    if (!plan || !startPlace) return [];
    return [
      startPlace.location,
      ...plan.stops.map((s) => s.place.location),
      startPlace.location,
    ];
  }, [plan, startPlace]);

  useEffect(() => {
    if (routeCoords.length > 1) {
      mapRef.current?.fitToCoordinates(routeCoords, {
        edgePadding: { top: insets.top + 40, left: 50, right: 50, bottom: 560 },
        animated: true,
      });
    }
  }, [routeCoords, insets.top]);

  /**
   * Drop a stop from the day. Editing the selection is enough: the four plans
   * are a memo over it, so all of them re-solve and the map redraws.
   *
   * A day needs two stops to be a day, so the last two are not removable —
   * better to refuse than to drop the user into the empty state from a
   * control that looked like a tidy-up.
   */
  const removeStop = useCallback(
    (placeId: string, placeName: string) => {
      if (selectedIds.length <= 2) {
        Alert.alert(
          'Keep at least two places',
          'A day out needs somewhere to go and somewhere to go next. Add another place in Explore before removing this one.'
        );
        return;
      }
      Alert.alert(`Remove ${placeName}?`, 'The rest of the day re-plans around it.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => togglePlace(placeId),
        },
      ]);
    },
    [selectedIds.length, togglePlace]
  );

  /**
   * Share the day as a link another copy of the app can adopt.
   *
   * What goes in the message is the day in the order it is on screen, and
   * nothing else. Not the start place — a start place plus a day out says
   * where someone lives and when they are not home, and the recipient
   * re-anchors to their own — and not a route, because a route computed from
   * someone else's doorstep is not a fact about theirs.
   *
   * The stops come from `plan.stops` — the sequence on screen — and NOT from
   * `orderedPlaces`.
   *
   * `orderedPlaces` is the user's arrangement only once they have made one.
   * Before that it is the order places were ticked in Explore, while the
   * timeline shows whatever the optimiser chose, and a day out is a loop:
   * A→B→C→home costs the same as C→B→A→home, so the solver takes the mirror
   * about half the time. The link carried the ticked order, the recipient
   * pinned it as an arrangement and so never re-solved, and two people with
   * the same start place saw the same day backwards.
   *
   * With an arrangement the two are genuinely identical, because a fixed
   * order is exactly what stops the optimiser resequencing. So reading the
   * plan is right in both cases, and it is the honest rule besides: what
   * travels is what the sender was looking at.
   */
  const shareDay = useCallback(async () => {
    const shared = plan ? plan.stops.map((s) => s.place) : orderedPlaces;
    if (shared.length === 0) return;
    const link = encodeDayLink({
      city: DATASET_CITY,
      placeIds: shared.map((p) => p.id),
      window: { dayStartMin, homeByMin },
      goal,
    });
    const names = shared.map((p) => p.name).join(' · ');
    // The names ride along as plain text because a pirtsf:// link renders as
    // nothing but its own scheme in most chat apps, and a friend who has not
    // installed the app yet should still be able to read what they were sent.
    await Share.share({
      message: `A day in the Bay Area: ${names}\n\nOpen in PIRT: ${link}`,
    });
  }, [plan, orderedPlaces, dayStartMin, homeByMin, goal]);

  /**
   * Hand the whole day to Google Maps.
   *
   * Two things Google cannot do are said out loud rather than discovered:
   * it carries nine waypoints in its own app and only three in a mobile
   * browser, and its transit engine ignores waypoints altogether, so a BART
   * day can only be drawn as a driving loop. Per-stop arrows in the timeline
   * give the real transit directions.
   *
   * The limit is chosen by probing for the app rather than assumed, because
   * the two targets differ by six stops and Google drops the excess in
   * silence — the same day would arrive whole on one phone and quietly short
   * on another.
   */
  const openDayInMaps = useCallback(async () => {
    if (!startPlace || !plan) return;
    // The https link opens either target; this only asks which one will take it.
    const hasApp = await Linking.canOpenURL('comgooglemaps://').catch(() => false);
    const { url, dropped } = googleMapsDirUrl(
      startPlace,
      plan,
      waypointLimit(hasApp)
    );
    const caveats: string[] = [];
    const droppedNote = droppedStopsWarning(dropped);
    if (droppedNote) caveats.push(droppedNote);
    if (dayOverviewMisstatesTransit(plan)) {
      caveats.push(
        'Maps cannot draw a multi-stop transit route, so the loop opens as driving. Use the arrow on a stop for its real transit directions.'
      );
    }
    if (caveats.length === 0) {
      Linking.openURL(url);
      return;
    }
    Alert.alert('Opening in Google Maps', caveats.join('\n\n'), [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Open', onPress: () => Linking.openURL(url) },
    ]);
  }, [startPlace, plan]);

  /**
   * What could fill the day's empty stretch (§3.3.0).
   *
   * Ungated on diary history, unlike suggestions into an empty Plan tab: the
   * gap's hours and the corridor between two chosen places do the
   * constraining that a diary would otherwise have to. Dismissed places are
   * removed from the input rather than the output, so the next candidate
   * steps up and the strip keeps its length.
   */
  const gapFillers = useMemo(() => {
    if (!plan?.gap || !startPlace) return [];
    return suggestGapFillers(
      allPlaces.filter(
        (p) => !selectedIds.includes(p.id) && !dismissed.includes(p.id)
      ),
      visits,
      startPlace,
      plan.gap
    );
  }, [plan?.gap, startPlace, selectedIds, dismissed, visits, allPlaces]);

  const snapPoints = useMemo(() => ['35%', '60%', '90%'], []);

  /**
   * One objective's timeline. Rendered four times into the pager, so it takes
   * the plan rather than reading the selected one.
   */
  const renderTimeline = (p: DayPlan, arranging = false) => {
    /**
     * One stop and the leg that reaches it, as the timeline always drew them.
     *
     * Arranging renders exactly this — the same rows, at the same heights,
     * carrying the same warnings. The only differences are the ones that cost
     * no layout: the block wobbles, a grip stands in the tail's control box,
     * and the controls that would compete for a tap are switched off.
     */
    const stopBlock = (s: DayPlan['stops'][number], drag?: PanGesture) => (
      <>
        <LegRow mode={s.leg.mode} durationMin={s.leg.durationMin} costUsd={s.leg.costUsd} />
          <Pressable
            disabled={arranging}
            onPress={() => {
              setHighlighted(s.place.id);
              mapRef.current?.animateToRegion(
                { ...s.place.location, latitudeDelta: 0.02, longitudeDelta: 0.02 },
                200
              );
            }}
            /*
             * The gesture people already know from rearranging apps, but the
             * mode opens on the lift rather than on the hold.
             *
             * Opening it under a live finger moved the sheet: entering the
             * mode locks the sheet's content panning, and taking that
             * recogniser away mid-touch left an in-flight gesture to settle
             * itself, which it did by jumping to the next snap point. Waiting
             * for the finger costs nothing — the hold is over by then — and
             * the sheet stays exactly where it was put.
             */
            onLongPress={() => {
              holdArmed.current = true;
              /*
               * The mode opens on the lift, so without this the hold has no
               * moment — the finger is down for 800ms and the screen says
               * nothing. The tap answers at the instant the hold lands, which
               * is the whole reason iOS can get away with a silent gesture.
               */
              tapFeedback();
            }}
            onPressOut={() => {
              if (!holdArmed.current) return;
              holdArmed.current = false;
              setEditing(true);
            }}
            delayLongPress={ARRANGE_HOLD_MS}
            /*
             * Darkens under the finger, the way a list row does on iOS. It
             * earns its place here more than it would on an ordinary button:
             * the hold runs for most of a second before it does anything, and
             * a row that stays inert for that long reads as a row that missed
             * the touch.
             */
            style={({ pressed }) => [
              styles.timelineRow,
              highlightedId === s.place.id && styles.stopHighlighted,
              pressed && styles.stopPressed,
            ]}
          >
            <View style={styles.gutter}>
              <TimelineNode categories={s.place.themes} label={String(s.order)} />
            </View>
            <View style={styles.stopBody}>
              <Text style={styles.stopName} numberOfLines={1}>
                {s.place.name}
              </Text>
              <Text style={styles.stopCost}>
                {formatPlacePrice(s.place) && s.place.priceBand !== 'free'
                  ? `${formatPlacePrice(s.place)} · `
                  : ''}
                {s.place.visitDurationMin} min visit
                {s.waitMin >= 15 ? ` · wait ${s.waitMin} min` : ''}
              </Text>
              {s.warnings.map((w, i) => (
                <View key={i} style={styles.warningRow}>
                  <MaterialCommunityIcons
                    name="alert-outline"
                    size={12}
                    color={colors.warning}
                  />
                  <Text style={styles.warningText}>{w}</Text>
                </View>
              ))}
            </View>
            <View style={styles.stopTail}>
              {/*
                Live while arranging as well as outside it. Arranging is
                where someone is already saying what the day should be by
                hand, and the grip sits in the tail's other box, so the two
                manual controls stand side by side rather than in different
                modes.
              */}
              <Pressable
                onPress={() =>
                  setPinning({
                    placeId: s.place.id,
                    name: s.place.name,
                    suggested: s.beginMin,
                  })
                }
                hitSlop={{ top: 12, bottom: 12, left: 10, right: 4 }}
                accessibilityRole="button"
                accessibilityLabel={
                  s.pinnedMin === undefined
                    ? `Arrives ${formatTime(s.arriveMin)}. Tap to fix a time for ${s.place.name}.`
                    : `${s.place.name} pinned to ${formatTime(s.pinnedMin)}. Tap to change it.`
                }
                style={styles.timeTap}
              >
                <Text style={styles.stopTime}>{formatTime(s.arriveMin)}</Text>
                {/*
                  The pin sits under the arrival rather than replacing it.
                  They are different facts once a pin is held — you get there
                  at 12:20 and go in at 13:00 — and the row already reports
                  the wait between them.
                */}
                {s.pinnedMin !== undefined && (
                  <View style={styles.pinChip}>
                    <MaterialCommunityIcons
                      name="pin"
                      size={9}
                      color={colors.accent}
                    />
                    <Text style={styles.pinChipText}>
                      {formatTime(s.pinnedMin)}
                    </Text>
                  </View>
                )}
              </Pressable>
              {/*
                The grip stands in the box the row's own controls already
                occupied rather than taking one of its own. Same 44pt square,
                so the row keeps its height to the pixel as the mode opens —
                the way a home screen icon keeps its grid square when the
                remove badge appears on it. Neither navigating to a stop nor
                removing one is something to be doing mid-arrange anyway.
              */}
              {drag ? (
                <GestureDetector gesture={drag}>
                  <View style={styles.tailControl}>
                    <MaterialCommunityIcons
                      name="drag"
                      size={26}
                      color={colors.textSecondary}
                    />
                  </View>
                </GestureDetector>
              ) : (
                <View style={styles.tailControl}>
                  <Pressable
                    onPress={() =>
                      Linking.openURL(googleMapsStopUrl(s.place.location, s.leg.mode))
                    }
                    hitSlop={8}
                    style={styles.stopAction}
                    accessibilityRole="button"
                    accessibilityLabel={`Directions to ${s.place.name} in Google Maps`}
                  >
                    <MaterialCommunityIcons
                      name="navigation-variant-outline"
                      size={14}
                      color={colors.textSecondary}
                    />
                  </Pressable>
                  <Pressable
                    onPress={() => removeStop(s.place.id, s.place.name)}
                    hitSlop={8}
                    style={styles.stopAction}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${s.place.name} from the day`}
                  >
                    <MaterialCommunityIcons
                      name="close"
                      size={14}
                      color={colors.textMuted}
                    />
                  </Pressable>
                </View>
              )}
            </View>
          </Pressable>
        </>
    );

    return (
    <>
      <View style={styles.timelineRow}>
        <View style={styles.gutter}>
          <StartPin size={30} />
        </View>
        <Text style={styles.anchorText}>Leave {formatTime(p.dayStartMin)}</Text>
      </View>

      {arranging ? (
        <ReorderableStack
          ids={p.stops.map((s) => s.place.id)}
          onReorder={setDayOrder}
          scrollRef={sheetScrollRef}
          renderItem={(id, drag) => {
            const s = p.stops.find((x) => x.place.id === id);
            return s ? stopBlock(s, drag) : null;
          }}
        />
      ) : (
        p.stops.map((s) => <View key={s.place.id}>{stopBlock(s)}</View>)
      )}

      {p.returnLeg && (
        <>
          <LegRow
            mode={p.returnLeg.mode}
            durationMin={p.returnLeg.durationMin}
            costUsd={p.returnLeg.costUsd}
          />
          <View style={styles.timelineRow}>
            <View style={styles.gutter}>
              <StartPin size={30} />
            </View>
            <Text style={styles.anchorText}>Home by {formatDayEnd(p.homeMin)}</Text>
          </View>
        </>
      )}

      {p.warnings.length > 0 && (
        <View style={styles.dayWarnings}>
          {p.warnings.map((w, i) => (
            <View key={i} style={styles.warningRow}>
              <MaterialCommunityIcons
                name="alert-outline"
                size={12}
                color={colors.warning}
              />
              <Text style={styles.warningText}>{w}</Text>
            </View>
          ))}
        </View>
      )}
    </>
    );
  };

  if (!startPlace || selectedIds.length < 2) {
    return (
      <View style={styles.loading}>
        <MaterialCommunityIcons name="map-outline" size={22} color={colors.textMuted} />
        <Text style={styles.loadingText}>
          {startPlace
            ? 'Save at least two places in Explore to plan a day'
            : 'Set a start place first'}
        </Text>
        <Pressable style={styles.loadingBack} onPress={() => navigation.goBack()}>
          <Text style={styles.loadingBackText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  if (!plan || !plans) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Planning your day…</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        onPress={() => setHighlighted(null)}
      >
        <Polyline
          coordinates={routeCoords}
          strokeColor="rgba(217,119,87,0.9)"
          strokeWidth={3.5}
          lineDashPattern={[2, 7]}
          lineCap="round"
        />
        <Marker
          coordinate={startPlace.location}
          anchor={PIN_ANCHOR}
          tracksViewChanges={false}
          zIndex={20}
        >
          <PinSlot>
            <StartPin />
          </PinSlot>
        </Marker>
        {plan.stops.map((s) => {
          const highlighted = highlightedId === s.place.id;
          return (
            <Marker
              key={`${s.place.id}-${s.order}-${highlighted ? 1 : 0}`}
              coordinate={s.place.location}
              anchor={PIN_ANCHOR}
              tracksViewChanges={false}
              zIndex={highlighted ? 30 : 1}
              onPress={() => setHighlighted(s.place.id)}
            >
              <PinSlot label={highlighted ? s.place.name : undefined}>
                <CategoryPin
                  categories={s.place.themes}
                  size={highlighted ? 35 : 28}
                  label={String(s.order)}
                />
              </PinSlot>
            </Marker>
          );
        })}
      </MapView>

      <Pressable
        style={[styles.backChip, { top: insets.top + 8 }]}
        onPress={() => navigation.goBack()}
      >
        <MaterialCommunityIcons name="chevron-left" size={18} color={colors.textPrimary} />
        <Text style={styles.backChipText}>Back</Text>
      </Pressable>


      <BottomSheet
        index={1}
        snapPoints={snapPoints}
        // Without this the sheet can travel past the status bar at its
        // tallest snap point, and "Day plan" renders through the clock.
        // Bounding the travel is the fix rather than padding the header,
        // which would leave a white gap at every other snap point.
        topInset={insets.top}
        /*
         * While arranging, the sheet moves by its grabber and not by its
         * content.
         *
         * Unlocking content panning altogether was tried and lost the row
         * drag: a vertical pan starting on a row handle was claimed by the
         * sheet, so the sheet slid up and the row never moved. Splitting the
         * two gestures by *where* they start settles it — the grabber is the
         * sheet's, everything below it belongs to the list — and the sheet
         * stays movable while the day is being arranged, which is the point.
         */
        enableContentPanningGesture={!editing}
        enableHandlePanningGesture
        backgroundStyle={styles.sheet}
        handleIndicatorStyle={styles.handle}
      >
        <View style={styles.sheetTop}>
          <View style={styles.sheetHeaderRow}>
          <View style={styles.sheetHeaderText}>
            <Text style={styles.sheetTitle}>Day plan</Text>
            <Text style={styles.sheetContext}>From {startPlace.name}</Text>
            <View style={styles.windowRow}>
              <DayWindowControl
                window={{ dayStartMin, homeByMin }}
                onChange={setDayWindow}
              />
              {/*
                The Order button used to carry this by going orange. With the
                button gone the fact still has to be somewhere: a stored order
                means the optimiser is no longer sequencing the day, which is
                why the times can be worse than they were. Deliberately not a
                control — arranging is reached by holding a stop, and a second
                door here would be the button back under another name.
              */}
              {dayOrder && (
                <View style={styles.ownOrder}>
                  <MaterialCommunityIcons
                    name="sort"
                    size={12}
                    color={colors.accent}
                  />
                  <Text style={styles.ownOrderText}>Your order</Text>
                </View>
              )}
            </View>
          </View>
          {/*
            Share sits up here rather than in the action row below. That row
            is Start day plus Maps already, and a third control there would
            crowd the narrowest phone likely to receive a link.

            Icon only, and no label to grow: it is beside a heading that
            already says what the sheet is, and the share sheet names the
            action the moment it opens.
          */}
          <Pressable
            style={styles.shareBtn}
            onPress={shareDay}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Share this day as a link"
          >
            <MaterialCommunityIcons
              name="tray-arrow-up"
              size={18}
              color={colors.textSecondary}
            />
          </Pressable>
          </View>
          {/*
            Four objectives, four columns, all on screen. This was a
            horizontal scroller and Least Walking sat off the right edge,
            which defeats the point of showing four answers at once (§6): a
            comparison you have to scroll to is not a comparison.
          */}
          <View style={styles.objectiveBar}>
            {OBJECTIVES.map((o) => (
              <ObjectiveSeg
                key={o.goal}
                icon={o.icon}
                label={o.label}
                active={goal === o.goal}
                onPress={() => selectGoal(o.goal)}
              />
            ))}
          </View>
          <View style={styles.cellsRow}>
            <SummaryCell
              label="Fares"
              value={formatDayTotal(plan.totals.totalUsd)}
            />
            <SummaryCell label="Travel" value={formatDuration(plan.totals.travelMin)} />
            <SummaryCell label="Home by" value={formatDayEnd(plan.homeMin)} />
          </View>
          {/*
            The two things to do with a finished plan: walk it, or hand it to
            something that will navigate it. Start day leads, because it is
            the one that ends in a stamp and keeps the loop closed.

            Both sit in the sheet rather than floating over the map. The Maps
            hand-off used to be a chip pinned to the top corner, which put the
            day's two end-actions on opposite sides of the screen with no
            indication they were alternatives.

            While arranging, the same strip carries Auto and Done instead.
            Putting them here rather than above the list is what keeps the day
            from sliding down the screen as the mode opens: the list starts at
            the same place either way, and the stop under the finger stays
            under it. Start day and Maps have nothing to act on mid-arrange
            anyway, so nothing is lost by their standing down.
          */}
          {editing ? (
            <View style={styles.actionRow}>
              <Pressable
                style={styles.startBtn}
                onPress={() => setEditing(false)}
                accessibilityRole="button"
                accessibilityLabel="Finish arranging the day"
              >
                <MaterialCommunityIcons name="check" size={16} color="#FFFFFF" />
                <Text style={styles.startBtnText}>Done</Text>
              </Pressable>
              {/*
                §3.4: the optimiser becomes an on-demand assist rather than
                all-or-nothing, and this is how it is asked back.
              */}
              <Pressable
                style={styles.mapsBtn}
                onPress={() => {
                  clearDayOrder();
                  setEditing(false);
                }}
                accessibilityRole="button"
                accessibilityLabel="Let the planner order the day again"
              >
                <MaterialCommunityIcons
                  name="auto-fix"
                  size={16}
                  color={colors.textPrimary}
                />
                <Text style={styles.mapsBtnText}>Auto</Text>
              </Pressable>
              <View style={styles.arrangeNote}>
                <MaterialCommunityIcons
                  name="drag-horizontal-variant"
                  size={16}
                  color={colors.textMuted}
                />
                <Text style={styles.arrangeNoteText}>
                  Drag to reorder · tap a time to pin it
                </Text>
              </View>
            </View>
          ) : (
          <View style={styles.actionRow}>
            <Pressable
              style={styles.startBtn}
              onPress={() => navigation.navigate('StartDay')}
              accessibilityRole="button"
              accessibilityLabel="Start the day, one stop at a time"
            >
              <MaterialCommunityIcons name="play" size={16} color="#FFFFFF" />
              <Text style={styles.startBtnText}>Start day</Text>
            </Pressable>
            <Pressable
              style={styles.mapsBtn}
              onPress={openDayInMaps}
              accessibilityRole="button"
              accessibilityLabel="Open the whole day in Google Maps"
            >
              <MaterialCommunityIcons
                name="navigation-variant-outline"
                size={16}
                color={colors.textPrimary}
              />
              <Text style={styles.mapsBtnText}>Maps</Text>
            </Pressable>
          </View>
          )}
        </View>

        <BottomSheetScrollView
          ref={sheetScrollRef}
          contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        >
          {/*
            Arranging does not replace the timeline; it decorates it. The
            pager stands down because a horizontal swipe and a vertical drag
            cannot share a finger, so the selected objective is rendered on
            its own — same width, same rows, same heights, nothing moved.
          */}
          {editing ? (
            <View style={{ width }}>{renderTimeline(plan, true)}</View>
          ) : (
            /* Horizontal pager: one page per objective, all rendered from the
               cache. Swiping settles on a page and reports back to the bar. */
            <ScrollView
              ref={pagerRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              contentOffset={pagerMountOffset}
              onMomentumScrollEnd={(e) =>
                onPagerSettled(e.nativeEvent.contentOffset.x)
              }
            >
              {OBJECTIVES.map((o) => (
                <View key={o.goal} style={{ width }}>
                  {renderTimeline(plans[o.goal])}
                </View>
              ))}
            </ScrollView>
          )}

          {/*
            Offered, never added (§3.3.0). It sits below the timeline, outside
            the pager, because the gap comes from opening hours rather than
            from the objective — the same hole whichever route wins — and
            repeating it four times would say so four times.
          */}
          {!editing && gapFillers.length > 0 && plan.gap && (
            <View style={styles.suggestBlock}>
              <View style={styles.suggestHead}>
                <MaterialCommunityIcons
                  name="star-four-points"
                  size={14}
                  color={colors.accent}
                />
                <Text style={styles.suggestTitle}>Suggested</Text>
                <Text style={styles.suggestSub}>
                  {formatDuration(plan.gap.toMin - plan.gap.fromMin)} free from{' '}
                  {formatTime(plan.gap.fromMin)}
                </Text>
              </View>
              <Text style={styles.suggestWhy}>
                Add one and the day can start earlier instead of waiting.
              </Text>
              {gapFillers.map((s) => {
                const primary = s.place.themes[0];
                return (
                  <View key={s.place.id} style={styles.suggestRow}>
                    <View
                      style={[
                        styles.suggestIcon,
                        { backgroundColor: tint(categoryColors[primary]) },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={categoryIcon[primary]}
                        size={16}
                        color={categoryColors[primary]}
                      />
                    </View>
                    <View style={styles.suggestBody}>
                      <Text style={styles.suggestName}>{s.place.name}</Text>
                      <Text style={styles.suggestMeta}>
                        {s.place.district} · {s.place.visitDurationMin} min
                        {formatPlacePrice(s.place)
                          ? ` · ${formatPlacePrice(s.place)}`
                          : ''}
                      </Text>
                      {s.reasons.length > 0 && (
                        <Text style={styles.suggestReason}>
                          {s.reasons.join(' · ')}
                        </Text>
                      )}
                    </View>
                    <Pressable
                      onPress={() => dismissSuggestion(s.place.id)}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel={`Not ${s.place.name}`}
                      style={styles.suggestDismiss}
                    >
                      <MaterialCommunityIcons
                        name="close"
                        size={14}
                        color={colors.textMuted}
                      />
                    </Pressable>
                    <Pressable
                      onPress={() => togglePlace(s.place.id)}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel={`Add ${s.place.name} to the day`}
                      style={styles.suggestAdd}
                    >
                      <MaterialCommunityIcons name="plus" size={16} color="#FFFFFF" />
                    </Pressable>
                  </View>
                );
              })}
            </View>
          )}
        </BottomSheetScrollView>
      </BottomSheet>

      {/*
        Outside the bottom sheet on purpose. A modal rendered inside it
        inherits the sheet's clipping, so the card would have appeared
        cropped to whatever height the sheet happened to be at.

        Keyed by place so the stepper starts from the stop that was tapped
        rather than from whichever one opened it first.
      */}
      {pinning && (
        <PinTimeSheet
          key={pinning.placeId}
          placeName={pinning.name}
          pinned={pinnedTimes[pinning.placeId]}
          suggested={pinning.suggested}
          dayStartMin={dayStartMin}
          homeByMin={homeByMin}
          onPin={(minutes) => {
            setPinnedTime(pinning.placeId, minutes);
            setPinning(null);
          }}
          onClear={() => {
            clearPinnedTime(pinning.placeId);
            setPinning(null);
          }}
          onClose={() => setPinning(null)}
        />
      )}
    </View>
  );
}

/**
 * One segment of the objective bar: an icon and what the objective is called.
 *
 * The segment used to carry its own day total and travel time, so the four
 * were comparable without switching between them. They are gone because four
 * columns of two stacked figures, at 10pt in a quarter of a phone's width,
 * read as a wall of small numbers rather than as a comparison — and on a
 * compact walkable day all four are identical, so it was the same two figures
 * four times over. The numbers for the objective actually selected sit
 * directly underneath in the summary cells, at a size someone can read.
 *
 * ui-guide §5 is still met: the optimised result is never shown without its
 * numbers. What is lost is the side-by-side, which now costs a tap.
 *
 * No clay here. The accent belongs to the screen's primary action, and a
 * selected segment is a state, not an action (ui-guide §1.3).
 */
function ObjectiveSeg({
  icon,
  label,
  active,
  onPress,
}: {
  icon: 'piggy-bank-outline' | 'scale-balance' | 'lightning-bolt' | 'seat-passenger';
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      style={[styles.objectiveSeg, active && styles.objectiveSegActive]}
    >
      <MaterialCommunityIcons
        name={icon}
        size={15}
        color={active ? colors.textPrimary : colors.textSecondary}
      />
      {/*
        Stacked rather than laid out in a row: a quarter of a phone is not
        wide enough for an icon and "Least Walking" side by side, and the
        label is not shortenable — it names what the optimiser does, and the
        short forms all overclaim.
      */}
      <Text
        style={[styles.objectiveLabel, active && styles.objectiveLabelActive]}
        numberOfLines={2}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.cell}>
      <Text style={styles.cellLabel}>{label}</Text>
      <Text style={styles.cellValue}>{value}</Text>
    </View>
  );
}

function LegRow({
  mode,
  durationMin,
  costUsd,
}: {
  mode: TransportMode;
  durationMin: number;
  costUsd: number;
}) {
  return (
    <View style={styles.legRow}>
      <View style={styles.gutter}>
        <View style={styles.spine} />
      </View>
      <View style={styles.legChip}>
        <MaterialCommunityIcons
          name={transportIcon[mode]}
          size={12}
          color={colors.textSecondary}
        />
        <Text style={styles.legText}>
          {transportLabel[mode]} {formatDuration(durationMin)}
          {costUsd > 0 ? ` · ${formatUsd(costUsd)}` : ''}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  loading: {
    flex: 1,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 40,
  },
  loadingText: { color: colors.textSecondary, fontSize: 14, textAlign: 'center' },
  loadingBack: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  loadingBackText: { fontSize: 13, fontWeight: '500', color: colors.textSecondary },
  backChip: {
    position: 'absolute',
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 24,
    paddingLeft: 8,
    paddingRight: 13,
    height: 40,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  backChipText: { fontSize: 13, fontWeight: '500', color: colors.textPrimary },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  handle: { backgroundColor: colors.borderStrong, width: 36, height: 4 },
  sheetTop: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 10,
  },
  /* Heading and share, one line: the button aligns to the top so it sits
     against the title rather than floating beside the window control. */
  sheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  sheetHeaderText: { flex: 1 },
  shareBtn: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceInput,
  },
  sheetTitle: { fontSize: 17, fontWeight: '500', color: colors.textPrimary },
  sheetContext: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  /**
   * Objective bar. Same segmented-control language as the old two-way
   * toggle (ui-guide §5): surfaceInput track, white active segment, subtle
   * shadow. Four labels do not fit a fixed row on a narrow phone, so the
   * track scrolls horizontally rather than truncating.
   */
  objectiveBar: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceInput,
    borderRadius: 12,
    padding: 3,
    gap: 3,
  },
  objectiveSeg: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    paddingHorizontal: 2,
    paddingVertical: 7,
    borderRadius: 9,
    gap: 1,
  },
  objectiveSegActive: {
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  objectiveLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 14,
  },
  objectiveLabelActive: { color: colors.textPrimary },
  actionRow: { flexDirection: 'row', gap: 8 },
  startBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    borderRadius: 13,
    backgroundColor: colors.accent,
  },
  startBtnText: { fontSize: 14, fontWeight: '500', color: '#FFFFFF' },
  mapsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 13,
    backgroundColor: colors.surfaceAlt,
  },
  mapsBtnText: { fontSize: 14, fontWeight: '500', color: colors.textPrimary },
  /**
   * Not a button. It fills what Maps and Start day leave behind so the strip
   * keeps its width, and says what the grips are for — the instruction used
   * to sit above the list, where it pushed the day down the screen.
   */
  arrangeNote: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
  },
  arrangeNoteText: { fontSize: 12, color: colors.textMuted },
  windowRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ownOrder: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 9,
    backgroundColor: tint(colors.accent),
  },
  ownOrderText: { fontSize: 12, fontWeight: '500', color: colors.accent },
  suggestBlock: {
    marginHorizontal: 16,
    marginTop: 8,
    padding: 14,
    borderRadius: 16,
    backgroundColor: colors.surfaceAlt,
    gap: 10,
  },
  suggestHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  suggestTitle: { fontSize: 13, fontWeight: '500', color: colors.textPrimary },
  suggestSub: { fontSize: 11, color: colors.textMuted, flex: 1, textAlign: 'right' },
  suggestWhy: { fontSize: 11, color: colors.textSecondary, lineHeight: 16, marginTop: -4 },
  suggestRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  suggestIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestBody: { flex: 1, gap: 1 },
  suggestName: { fontSize: 13, fontWeight: '500', color: colors.textPrimary },
  suggestMeta: { fontSize: 11, color: colors.textSecondary },
  suggestReason: { fontSize: 10, color: colors.textMuted },
  suggestDismiss: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestAdd: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  cellsRow: { flexDirection: 'row', gap: 8 },
  cell: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  cellLabel: { fontSize: 11, color: colors.textMuted },
  cellValue: { fontSize: 15, fontWeight: '500', color: colors.textPrimary, marginTop: 1 },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 12,
  },
  gutter: { width: 30, alignItems: 'center' },
  spine: { width: 2, height: 30, backgroundColor: colors.borderStrong },
  anchorText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textPrimary,
    marginTop: 5,
  },
  legRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 12,
  },
  legChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.surfaceInput,
    borderRadius: 14,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  legText: { fontSize: 11, color: colors.textSecondary },
  stopHighlighted: { backgroundColor: colors.surfaceAlt },
  /**
   * A rounded slab under the finger, held clear of the screen edges so the
   * corners are visible as corners — the shape iOS gives a pressed row, and
   * the shape of the app icons the gesture is borrowed from.
   *
   * The inset is paid for out of the row's own padding: 8 of margin plus 8 of
   * padding is the 16 the row already had, so the slab appears around the
   * content without moving a pixel of it. Adding margin alone would shove
   * every stop sideways on touch, which is the movement this screen has spent
   * a long time getting rid of.
   */
  stopPressed: {
    backgroundColor: pressedWell,
    marginHorizontal: 8,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  stopBody: { flex: 1 },
  stopName: { fontSize: 14, fontWeight: '500', color: colors.textPrimary },
  stopCost: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  stopTime: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  /** Column so a held time can sit under the arrival without widening the tail. */
  timeTap: { alignItems: 'flex-end', gap: 2 },
  pinChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 6,
    backgroundColor: colors.surfaceAlt,
  },
  pinChipText: { fontSize: 10, fontWeight: '500', color: colors.accent },
  /**
   * Arrival time and the row's controls, side by side.
   *
   * They were stacked, which put the time directly above a grip you were
   * about to put a thumb on. Alongside, the time stays readable while the row
   * is being moved, and the tail is one control's height rather than two
   * things' worth.
   */
  stopTail: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  /**
   * The box the row's controls sit in, and the box the grip stands in.
   *
   * Deliberately the same for each, and deliberately larger than what it
   * holds. Same, because a tail that changed size between the two modes would
   * move the rest of the row the moment arranging opened — which is the one
   * thing this mode must not do. Larger, because 44pt is the smallest thing a
   * thumb hits reliably and this one sits at the screen edge, where thumbs
   * are least accurate.
   *
   * The width is fixed rather than derived, and this branch needs that where
   * Hong Kong did not: there the box holds one control in each mode, here it
   * holds two (directions and remove) in one and a grip in the other. Sized
   * to its contents it came out 50pt against the grip's 44, and the arrival
   * time beside it slid 6pt sideways as the mode opened. 50 is the wider of
   * the two, so both modes now measure the same and nothing moves.
   */
  tailControl: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: 50,
    height: 44,
    gap: 6,
  },
  stopAction: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceInput,
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  warningText: { fontSize: 11, color: colors.warning, flexShrink: 1 },
  dayWarnings: {
    marginTop: 12,
    marginHorizontal: 16,
    gap: 2,
  },
});
