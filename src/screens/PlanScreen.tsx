import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CategoryPin, PIN_ANCHOR, PinSlot, StartPin } from '../components/CategoryPin';
import { transportIcon, transportLabel } from '../components/icons';
import { TimelineNode } from '../components/IconTile';
import type { Place, TransportMode } from '../domain/types';
import { formatTime } from '../lib/geo';
import { formatDuration, formatUsd } from '../lib/format';
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

type Props = NativeStackScreenProps<RootStackParamList, 'Plan'>;

/**
 * Plan day — the optimizer's output made visible (ui-guide §1.4: never show
 * an optimized result without its numbers). Clay dashed loop on the map,
 * numbered pins in route order, summary cells, timeline with leg chips, and
 * the Balanced/Fastest toggle with its delta.
 */
export function PlanScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const startPlace = useTripStore((s) => s.startPlace);
  const selectedIds = useTripStore((s) => s.selectedPlaceIds);
  const goal = useTripStore((s) => s.goal);
  const setGoal = useTripStore((s) => s.setGoal);
  const dayStartMin = useTripStore((s) => s.dayStartMin);
  const homeByMin = useTripStore((s) => s.homeByMin);
  const budgetCapUsd = useTripStore((s) => s.budgetCapUsd);
  const highlightedId = useUiStore((s) => s.highlightedPlaceId);
  const setHighlighted = useUiStore((s) => s.setHighlighted);

  const [selectedPlaces, setSelectedPlaces] = useState<Place[]>([]);
  const [legOptionsFn, setLegOptionsFn] = useState<LegOptionsFn | null>(null);
  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const all = await placesService.listPlaces();
      if (!alive) return;
      const byId = new Map(all.map((p) => [p.id, p]));
      const picked = selectedIds
        .map((id) => byId.get(id))
        .filter((p): p is Place => !!p);
      setSelectedPlaces(picked);

      // Prefetch travel estimates for exactly the points this plan will route
      // between, then hand the optimizer a synchronous lookup.
      const points = startPlace
        ? [startPlace.location, ...picked.map((p) => p.location)]
        : picked.map((p) => p.location);
      const fn = await routingService.getLegOptionsFn(points);
      if (alive) setLegOptionsFn(() => fn);
    })();
    return () => {
      alive = false;
    };
  }, [selectedIds, startPlace]);

  const plans = useMemo<Record<Goal, DayPlan> | null>(() => {
    if (!startPlace || !legOptionsFn || selectedPlaces.length === 0) return null;
    const base = {
      startPlace,
      places: selectedPlaces,
      dayStartMin,
      homeByMin,
      budgetCapUsd,
      legOptions: legOptionsFn,
    };
    return {
      balanced: optimizeDay({ ...base, goal: 'balanced' }),
      fastest: optimizeDay({ ...base, goal: 'fastest' }),
    };
  }, [startPlace, selectedPlaces, legOptionsFn, dayStartMin, homeByMin, budgetCapUsd]);

  const plan = plans?.[goal] ?? null;

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

  const snapPoints = useMemo(() => ['35%', '60%', '90%'], []);

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

  const other = plans[goal === 'balanced' ? 'fastest' : 'balanced'];
  const fasterMin =
    goal === 'balanced'
      ? plan.totals.travelMin - other.totals.travelMin
      : other.totals.travelMin - plan.totals.travelMin;
  const extraUsd =
    goal === 'balanced'
      ? other.totals.travelUsd - plan.totals.travelUsd
      : plan.totals.travelUsd - other.totals.travelUsd;
  let tradeoff: string;
  if (fasterMin <= 0 && extraUsd <= 0) {
    tradeoff = 'Same plan under both goals today';
  } else if (goal === 'balanced') {
    tradeoff = `Fastest: ${formatDuration(fasterMin)} faster · ${formatUsd(extraUsd)} more`;
  } else {
    tradeoff = `${formatDuration(fasterMin)} faster · ${formatUsd(extraUsd)} more than Balanced`;
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
                  categories={s.place.categories}
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

      <Pressable
        style={[styles.shareChip, { top: insets.top + 8 }]}
        onPress={() =>
          navigation.navigate('Publish', {
            title: 'My day out',
            city: 'San Francisco',
            themes: Array.from(
              new Set(plan.stops.flatMap((s) => s.place.categories))
            ).slice(0, 2),
            stopIds: plan.stops.map((s) => s.place.id),
          })
        }
      >
        <MaterialCommunityIcons name="share-variant-outline" size={16} color={colors.textPrimary} />
        <Text style={styles.backChipText}>Share</Text>
      </Pressable>

      <BottomSheet
        index={1}
        snapPoints={snapPoints}
        backgroundStyle={styles.sheet}
        handleIndicatorStyle={styles.handle}
      >
        <View style={styles.sheetTop}>
          <View style={styles.sheetHeaderText}>
            <Text style={styles.sheetTitle}>Day plan</Text>
            <Text style={styles.sheetContext}>
              From {startPlace.name} · leave {formatTime(plan.dayStartMin)}
            </Text>
          </View>
          <View style={styles.toggleRow}>
            <ToggleSeg
              icon="scale-balance"
              label="Balanced"
              active={goal === 'balanced'}
              onPress={() => setGoal('balanced')}
            />
            <ToggleSeg
              icon="lightning-bolt"
              label="Fastest"
              active={goal === 'fastest'}
              onPress={() => setGoal('fastest')}
            />
          </View>
          <Text style={styles.tradeoff}>{tradeoff}</Text>
          <View style={styles.cellsRow}>
            <SummaryCell label="Day total" value={formatUsd(plan.totals.totalUsd)} />
            <SummaryCell label="Travel" value={formatDuration(plan.totals.travelMin)} />
            <SummaryCell label="Home by" value={formatTime(plan.homeMin)} />
          </View>
        </View>

        <BottomSheetScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        >
          <View style={styles.timelineRow}>
            <View style={styles.gutter}>
              <StartPin size={30} />
            </View>
            <Text style={styles.anchorText}>Leave {formatTime(plan.dayStartMin)}</Text>
          </View>

          {plan.stops.map((s) => (
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
                style={[
                  styles.timelineRow,
                  highlightedId === s.place.id && styles.stopHighlighted,
                ]}
              >
                <View style={styles.gutter}>
                  <TimelineNode categories={s.place.categories} label={String(s.order)} />
                </View>
                <View style={styles.stopBody}>
                  <Text style={styles.stopName} numberOfLines={1}>
                    {s.place.name}
                  </Text>
                  <Text style={styles.stopCost}>
                    {s.place.avgCostUsd > 0 ? `${formatUsd(s.place.avgCostUsd)} · ` : ''}
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
                <Text style={styles.stopTime}>{formatTime(s.arriveMin)}</Text>
              </Pressable>
            </View>
          ))}

          {plan.returnLeg && (
            <>
              <LegRow
                mode={plan.returnLeg.mode}
                durationMin={plan.returnLeg.durationMin}
                costUsd={plan.returnLeg.costUsd}
              />
              <View style={styles.timelineRow}>
                <View style={styles.gutter}>
                  <StartPin size={30} />
                </View>
                <Text style={styles.anchorText}>Home by {formatTime(plan.homeMin)}</Text>
              </View>
            </>
          )}

          {plan.warnings.length > 0 && (
            <View style={styles.dayWarnings}>
              {plan.warnings.map((w, i) => (
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
        </BottomSheetScrollView>
      </BottomSheet>
    </View>
  );
}

function ToggleSeg({
  icon,
  label,
  active,
  onPress,
}: {
  icon: 'scale-balance' | 'lightning-bolt';
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.toggleSeg, active && styles.toggleSegActive]}
    >
      <MaterialCommunityIcons
        name={icon}
        size={14}
        color={active ? colors.textPrimary : colors.textSecondary}
      />
      <Text style={[styles.toggleText, active && styles.toggleTextActive]}>{label}</Text>
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
  shareChip: {
    position: 'absolute',
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.surface,
    borderRadius: 24,
    paddingLeft: 11,
    paddingRight: 13,
    height: 40,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
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
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceInput,
    borderRadius: 12,
    padding: 3,
  },
  toggleSeg: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 7,
    borderRadius: 9,
  },
  toggleSegActive: {
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  toggleText: { fontSize: 13, fontWeight: '500', color: colors.textSecondary },
  toggleTextActive: { color: colors.textPrimary },
  tradeoff: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
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
  stopBody: { flex: 1 },
  stopName: { fontSize: 14, fontWeight: '500', color: colors.textPrimary },
  stopCost: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  stopTime: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
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
