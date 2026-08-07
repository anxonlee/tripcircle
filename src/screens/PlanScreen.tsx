import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CategoryPin, PIN_ANCHOR, PinSlot, StartPin } from '../components/CategoryPin';
import { DayOrderEditor } from '../components/DayOrderEditor';
import { DayWindowControl } from '../components/DayWindowControl';
import { transportIcon, transportLabel } from '../components/icons';
import { TimelineNode } from '../components/IconTile';
import type { CuratedPlace, TransportMode } from '../domain/types';
import { formatDayEnd, formatTime } from '../lib/geo';
import {
  formatDayTotal,
  formatDuration,
  formatUsd,
  formatPriceBand,
} from '../lib/format';
import {
  droppedStopsWarning,
  dayOverviewMisstatesTransit,
  googleMapsDirUrl,
  googleMapsStopUrl,
  waypointLimit,
} from '../lib/maps';
import {
  optimizeDay,
  type DayPlan,
  type Goal,
  type LegOptionsFn,
} from '../lib/optimizer';
import type { RootStackParamList } from '../navigation';
import { placesService } from '../services/places';
import { routingService } from '../services/routing';
import { useTripStore, useUiStore } from '../store/useTripStore';
import { colors } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'DayPlan'>;

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
  const highlightedId = useUiStore((s) => s.highlightedPlaceId);
  const setHighlighted = useUiStore((s) => s.setHighlighted);
  const { width } = useWindowDimensions();

  const [selectedPlaces, setSelectedPlaces] = useState<CuratedPlace[]>([]);
  const [legOptionsFn, setLegOptionsFn] = useState<LegOptionsFn | null>(null);
  const mapRef = useRef<MapView>(null);
  const pagerRef = useRef<ScrollView>(null);
  const [editing, setEditing] = useState(false);

  /**
   * The day in the order the user arranged, if they arranged one (F6).
   *
   * Reconciled rather than replaced: a stored order that no longer matches
   * the selection keeps the places it still knows, in their places, and puts
   * anything new at the end. Adding a place should not discard an
   * arrangement made by hand.
   */

  useEffect(() => {
    placesService.listPlaces().then((all) => {
      const byId = new Map(all.map((p) => [p.id, p]));
      setSelectedPlaces(
        selectedIds.map((id) => byId.get(id)).filter((p): p is CuratedPlace => !!p)
      );
    });
    routingService.getLegOptionsFn().then((fn) => setLegOptionsFn(() => fn));
  }, [selectedIds]);

  /**
   * Every objective is solved here, once, and cached until the selection
   * changes. Four solves of a typical day cost single-digit milliseconds
   * together, so paying for all of them up front buys instant switching.
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

  const plans = useMemo<Record<Goal, DayPlan> | null>(() => {
    if (!startPlace || !legOptionsFn || orderedPlaces.length === 0) return null;
    const base = {
      startPlace,
      places: orderedPlaces,
      dayStartMin,
      homeByMin,
      legOptions: legOptionsFn,
      // The four objectives still differ with a fixed order — they choose
      // transport per leg, not just the sequence.
      fixedOrder: dayOrder !== null,
    };
    return {
      economic: optimizeDay({ ...base, goal: 'economic' }),
      balanced: optimizeDay({ ...base, goal: 'balanced' }),
      fastest: optimizeDay({ ...base, goal: 'fastest' }),
      leastWalking: optimizeDay({ ...base, goal: 'leastWalking' }),
    };
  }, [startPlace, orderedPlaces, legOptionsFn, dayStartMin, homeByMin, dayOrder]);

  const plan = plans?.[goal] ?? null;
  const goalIndex = OBJECTIVES.findIndex((o) => o.goal === goal);

  /** Tap on the bar: move the pager, which is the single source of truth. */
  const selectGoal = useCallback(
    (next: Goal) => {
      const i = OBJECTIVES.findIndex((o) => o.goal === next);
      pagerRef.current?.scrollTo({ x: i * width, animated: true });
      setGoal(next);
    },
    [width, setGoal]
  );

  /** Swipe: keep the bar in sync. Reads cache only, never re-solves. */
  const onPagerSettled = useCallback(
    (x: number) => {
      const i = Math.round(x / width);
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

  const snapPoints = useMemo(() => ['35%', '60%', '90%'], []);

  /**
   * One objective's timeline. Rendered four times into the pager, so it takes
   * the plan rather than reading the selected one.
   */
  const renderTimeline = (p: DayPlan) => (
    <>
      <View style={styles.timelineRow}>
        <View style={styles.gutter}>
          <StartPin size={30} />
        </View>
        <Text style={styles.anchorText}>Leave {formatTime(p.dayStartMin)}</Text>
      </View>

      {p.stops.map((s) => (
        <View key={s.place.id}>
          <LegRow mode={s.leg.mode} durationMin={s.leg.durationMin} costUsd={s.leg.costUsd} />
          <Pressable
            onPress={() => {
              setHighlighted(s.place.id);
              mapRef.current?.animateToRegion(
                { ...s.place.location, latitudeDelta: 0.02, longitudeDelta: 0.02 },
                200
              );
            }}
            // The gesture people already know from rearranging apps.
            onLongPress={() => setEditing(true)}
            delayLongPress={400}
            style={[
              styles.timelineRow,
              highlightedId === s.place.id && styles.stopHighlighted,
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
                {s.place.priceBand !== 'free' ? `${formatPriceBand(s.place.priceBand)} · ` : ''}
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
              <Text style={styles.stopTime}>{formatTime(s.arriveMin)}</Text>
              <View style={styles.stopActions}>
                <Pressable
                  onPress={() =>
                    Linking.openURL(googleMapsStopUrl(s.place.location, s.leg.mode))
                  }
                  hitSlop={10}
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
                  hitSlop={10}
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
            </View>
          </Pressable>
        </View>
      ))}

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
        // While arranging, the sheet stops listening for pans. A drag that
        // the sheet also claims is a drag that moves the sheet instead of
        // the stop.
        enableContentPanningGesture={!editing}
        backgroundStyle={styles.sheet}
        handleIndicatorStyle={styles.handle}
      >
        <View style={styles.sheetTop}>
          <View style={styles.sheetHeaderText}>
            <Text style={styles.sheetTitle}>Day plan</Text>
            <Text style={styles.sheetContext}>From {startPlace.name}</Text>
            <DayWindowControl
              window={{ dayStartMin, homeByMin }}
              onChange={setDayWindow}
            />
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
                total={formatDayTotal(plans[o.goal].totals.totalUsd)}
                duration={formatDuration(plans[o.goal].totals.travelMin)}
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
          */}
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
            {/*
              Long-pressing a stop also opens this, the way rearranging apps
              does. The button exists because a gesture nobody is told about
              is a gesture nobody finds (F6).
            */}
            <Pressable
              style={styles.mapsBtn}
              onPress={() => setEditing(true)}
              accessibilityRole="button"
              accessibilityLabel="Arrange the order of the day"
            >
              <MaterialCommunityIcons
                name="sort"
                size={16}
                color={dayOrder ? colors.accent : colors.textPrimary}
              />
              <Text
                style={[styles.mapsBtnText, dayOrder && { color: colors.accent }]}
              >
                Order
              </Text>
            </Pressable>
          </View>
        </View>

        <BottomSheetScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        >
          {/*
            Edit mode replaces the timeline rather than overlaying it, which
            is what keeps the gestures from competing: while the editor is up
            the pager is locked and there is only one recogniser listening
            for a drag.
          */}
          {editing ? (
            <DayOrderEditor
              places={orderedPlaces}
              onReorder={setDayOrder}
              onDone={() => setEditing(false)}
              onOptimise={() => {
                clearDayOrder();
                setEditing(false);
              }}
            />
          ) : (
            /* Horizontal pager: one page per objective, all rendered from the
               cache. Swiping settles on a page and reports back to the bar. */
            <ScrollView
              ref={pagerRef}
              horizontal
              pagingEnabled
              scrollEnabled={!editing}
              showsHorizontalScrollIndicator={false}
              contentOffset={{ x: goalIndex * width, y: 0 }}
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
        </BottomSheetScrollView>
      </BottomSheet>
    </View>
  );
}

/**
 * One segment of the objective bar. Carries its own day total and travel
 * time so the four are comparable without switching between them
 * (ui-guide §5: never show an optimised result without its numbers).
 *
 * No clay here. The accent belongs to the screen's primary action, and a
 * selected segment is a state, not an action (ui-guide §1.3).
 */
function ObjectiveSeg({
  icon,
  label,
  total,
  duration,
  active,
  onPress,
}: {
  icon: 'piggy-bank-outline' | 'scale-balance' | 'lightning-bolt' | 'seat-passenger';
  label: string;
  total: string;
  duration: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${label}, ${total}, ${duration} travelling`}
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
      <Text
        style={[styles.objectiveMeta, active && styles.objectiveMetaActive]}
        numberOfLines={1}
      >
        {total}
      </Text>
      <Text style={styles.objectiveMeta} numberOfLines={1}>
        {duration}
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
  sheetHeaderText: {},
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
  objectiveMeta: { fontSize: 10, color: colors.textMuted, textAlign: 'center' },
  objectiveMetaActive: { color: colors.textSecondary },
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
  stopBody: { flex: 1 },
  stopName: { fontSize: 14, fontWeight: '500', color: colors.textPrimary },
  stopCost: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  stopTime: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  stopTail: { alignItems: 'flex-end', gap: 6 },
  stopActions: { flexDirection: 'row', gap: 6 },
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
