import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { CompositeNavigationProp } from '@react-navigation/native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useMemo, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CategoryPin, PIN_ANCHOR, PinSlot, StartPin } from '../components/CategoryPin';
import { categoryIcon } from '../components/icons';
import { formatPriceBand } from '../lib/format';

import {
  SUGGESTION_HISTORY_THRESHOLD,
  distinctPlacesVisited,
  hasEnoughHistory,
  suggestDay,
} from '../lib/planner';
import type { CuratedPlace } from '../domain/types';
import type { RootStackParamList, TabParamList } from '../navigation';
import { SEED_REGION, bayAreaPlaces } from '../services/mock/bayAreaPlaces';
import { useDiaryStore } from '../store/useDiaryStore';
import { useTripStore, useUiStore } from '../store/useTripStore';
import { categoryColors, colors, tint } from '../theme/colors';

/**
 * The thin planner's entry point (PRD FD5).
 *
 * Suggests a day from the Bay Area dataset plus the user's own visit
 * frequency and recency — never from Google ratings (§12.2). Every
 * suggestion shows why it is there, because §1.3.3 requires the optimizer to
 * show its reasoning and a suggestion the user cannot interrogate is just an
 * opaque recommendation.
 *
 * Suggestions are gated on the diary holding four distinct places (§3.3.0.1).
 * Below that, any suggestion would be arbitrary, so the screen sends the user
 * to Explore instead.
 *
 * Selection only. This screen chooses *which* places belong in the day and
 * hands them to the optimizer, which owns order, transport and timing — the
 * split is what lets either side change without touching the other.
 */

/**
 * Plan is a tab, but it navigates to stack routes (`Setup`, `DayPlan`) and to
 * a sibling tab (`Explore`). Both resolve at runtime by bubbling to the right
 * navigator; only the composite type says so, which is why this is not a cast.
 */
type PlanNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, 'Plan'>,
  NativeStackNavigationProp<RootStackParamList>
>;

export function PlanSuggestScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<PlanNavigation>();
  const startPlace = useTripStore((s) => s.startPlace);
  const setSelection = useTripStore((s) => s.setSelection);
  const selectedIds = useTripStore((s) => s.selectedPlaceIds);
  const dayStartMin = useTripStore((s) => s.dayStartMin);
  const homeByMin = useTripStore((s) => s.homeByMin);
  const suggestionBias = useTripStore((s) => s.suggestionBias);
  const togglePlace = useTripStore((s) => s.togglePlace);
  const dismissed = useUiStore((s) => s.dismissedPlaceIds);
  const dismissSuggestion = useUiStore((s) => s.dismissSuggestion);
  const visits = useDiaryStore((s) => s.visits);

  const enoughHistory = hasEnoughHistory(visits);

  /**
   * What the user chose in Explore, in the order they chose it. The planner
   * sequences this; it never adds to it or swaps anything out (§3.3.0).
   */
  const selectedPlaces = useMemo(
    () =>
      selectedIds
        .map((id) => bayAreaPlaces.find((p) => p.id === id))
        .filter((p): p is CuratedPlace => p !== undefined),
    [selectedIds]
  );
  const hasSelection = selectedPlaces.length > 0;

  /**
   * A selection means no suggestions at all — not suggestions computed and
   * then hidden. Ranking 53 places to throw the result away would be waste,
   * and having the value in scope invites exactly the comparison §3.3.0
   * exists to forbid.
   */
  const suggestions = useMemo(
    () =>
      startPlace && enoughHistory && !hasSelection
        ? suggestDay(
            // A dismissed place is out of the running entirely, not filtered
            // from the result: dropping it after the fact would leave a short
            // day, where removing it first lets the next candidate take the
            // place and the day stay the size it was sized to be.
            bayAreaPlaces.filter((p) => !dismissed.includes(p.id)),
            visits,
            startPlace,
            { dayStartMin, homeByMin },
            Date.now(),
            suggestionBias
          )
        : [],
    [
      startPlace,
      enoughHistory,
      hasSelection,
      visits,
      dayStartMin,
      homeByMin,
      suggestionBias,
      dismissed,
    ]
  );

  /**
   * One list for the map, the totals and the rows. A chosen place carries no
   * reasons: the user does not need telling why they picked it.
   */
  const dayItems = useMemo(
    () =>
      hasSelection
        ? selectedPlaces.map((place) => ({ place, reasons: [] as string[] }))
        : suggestions.map((s) => ({ place: s.place, reasons: s.reasons })),
    [hasSelection, selectedPlaces, suggestions]
  );

  const mapRef = useRef<MapView>(null);

  /**
   * The loop, start place included at both ends — a day out comes back.
   * Drawn dashed because this is not a routed path: the optimizer has not
   * chosen transport modes yet.
   */
  const routeCoords = useMemo(() => {
    if (!startPlace || dayItems.length === 0) return [];
    return [
      startPlace.location,
      ...dayItems.map((s) => s.place.location),
      startPlace.location,
    ];
  }, [startPlace, dayItems]);

  useEffect(() => {
    if (routeCoords.length > 1) {
      mapRef.current?.fitToCoordinates(routeCoords, {
        edgePadding: { top: 46, left: 46, right: 46, bottom: 46 },
        animated: true,
      });
    }
  }, [routeCoords]);

  const hours =
    dayItems.reduce((sum, s) => sum + s.place.visitDurationMin, 0) / 60;
  /** The optimiser has nothing to order with fewer than two stops. */
  const tooFewToPlan = dayItems.length < 2;

  if (!startPlace) {
    return (
      <View style={[styles.screen, styles.center, { paddingTop: insets.top }]}>
        <MaterialCommunityIcons
          name="map-marker-outline"
          size={26}
          color={colors.textMuted}
        />
        <Text style={styles.emptyText}>
          Set a start place and a day gets built around it.
        </Text>
        <Pressable style={styles.primary} onPress={() => navigation.navigate('Setup')}>
          <Text style={styles.primaryText}>Set start place</Text>
        </Pressable>
      </View>
    );
  }

  /**
   * Not enough diary to suggest from (§3.3.0.1). The button matters more than
   * the words: a screen whose only content is text telling the user to be on
   * a different tab is the worst-converting empty state there is.
   */
  if (!enoughHistory && !hasSelection) {
    const visited = distinctPlacesVisited(visits);
    const remaining = SUGGESTION_HISTORY_THRESHOLD - visited;
    return (
      <View style={[styles.screen, styles.center, { paddingTop: insets.top }]}>
        <MaterialCommunityIcons
          name="map-marker-plus-outline"
          size={26}
          color={colors.textMuted}
        />
        <Text style={styles.emptyTitle}>Days get built from where you have been</Text>
        <Text style={styles.emptyText}>
          {visited === 0
            ? `Stamp ${SUGGESTION_HISTORY_THRESHOLD} places you have visited and this tab starts suggesting days around them. Until then, pick the places you want and Plan will order them for you.`
            : `${visited} place${visited === 1 ? '' : 's'} stamped. ${remaining} more and this tab starts suggesting days around them. Until then, pick the places you want and Plan will order them for you.`}
        </Text>
        <Pressable
          style={styles.primary}
          onPress={() => navigation.navigate('Explore')}
        >
          <MaterialCommunityIcons name="compass-outline" size={16} color="#FFFFFF" />
          <Text style={styles.primaryText}>Find places</Text>
        </Pressable>
      </View>
    );
  }

  /**
   * With a selection, the selection is already the plan and the store needs
   * nothing written to it. Only a suggested day writes, and only into an
   * empty selection — never over one (§3.3.0).
   */
  const planIt = () => {
    if (!hasSelection) setSelection(dayItems.map((s) => s.place.id));
    navigation.navigate('DayPlan');
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>
          {hasSelection ? 'Your places' : 'Plan a day out'}
        </Text>
        <Text style={styles.sub}>
          {hasSelection
            ? `${dayItems.length} chosen · from ${startPlace.name}`
            : `Suggestions · from ${startPlace.name}`}
        </Text>
      </View>

      <View style={styles.mapWrap}>
        <MapView ref={mapRef} style={styles.map} initialRegion={SEED_REGION}>
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
          {dayItems.map((s, i) => (
            <Marker
              key={s.place.id}
              coordinate={s.place.location}
              anchor={PIN_ANCHOR}
              tracksViewChanges={false}
            >
              <PinSlot>
                <CategoryPin
                  categories={s.place.themes}
                  size={28}
                  label={String(i + 1)}
                />
              </PinSlot>
            </Marker>
          ))}
        </MapView>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.statRow}>
          <Stat label="Stops" value={String(dayItems.length)} />
          <Stat label="Time there" value={`${hours.toFixed(1)} h`} />
        </View>

        {/*
          The optimiser needs two places to have anything to order, so with
          one left the button would lead to a screen telling the user to go
          back. Say it here instead, where the place they just removed is
          still on screen and putting it back is one tap in Explore.
        */}
        <Pressable
          style={[styles.primary, tooFewToPlan && styles.primaryOff]}
          onPress={planIt}
          disabled={tooFewToPlan}
        >
          <MaterialCommunityIcons name="map-outline" size={16} color="#FFFFFF" />
          <Text style={styles.primaryText}>
            {hasSelection
              ? `Plan my ${dayItems.length} place${dayItems.length === 1 ? '' : 's'}`
              : 'Plan this day'}
          </Text>
        </Pressable>
        {tooFewToPlan && (
          <Text style={styles.hint}>
            A day needs somewhere to go and somewhere to go next. Add one more
            in Explore.
          </Text>
        )}

        {dayItems.map((s, i) => {
          const primary = s.place.themes[0];
          return (
            <View key={s.place.id} style={styles.row}>
              <View
                style={[styles.icon, { backgroundColor: tint(categoryColors[primary]) }]}
              >
                <MaterialCommunityIcons
                  name={categoryIcon[primary]}
                  size={18}
                  color={categoryColors[primary]}
                />
              </View>
              <View style={styles.body}>
                <Text style={styles.name}>
                  {i + 1}. {s.place.name}
                </Text>
                <Text style={styles.meta}>
                  {s.place.district} · {s.place.visitDurationMin} min ·{' '}
                  {formatPriceBand(s.place.priceBand)}
                </Text>
                {s.reasons.length > 0 && (
                  <Text style={styles.reason}>{s.reasons.join(' · ')}</Text>
                )}
              </View>
              {/*
                The same control, two meanings. Against a selection it takes
                the place out of what the user chose; against a suggestion it
                waves the suggestion away and the next candidate steps up
                (§3.3.0.1). Both are "not this one", which is why they look
                alike.
              */}
              <Pressable
                onPress={() =>
                  hasSelection
                    ? togglePlace(s.place.id)
                    : dismissSuggestion(s.place.id)
                }
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel={
                  hasSelection
                    ? `Remove ${s.place.name} from your places`
                    : `Not ${s.place.name}, suggest something else`
                }
                style={styles.remove}
              >
                <MaterialCommunityIcons
                  name="close"
                  size={15}
                  color={colors.textMuted}
                />
              </Pressable>
            </View>
          );
        })}


      </ScrollView>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  center: { alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  header: { paddingHorizontal: 16, paddingBottom: 10 },
  title: { fontSize: 17, fontWeight: '500', color: colors.textPrimary },
  sub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  mapWrap: {
    height: 236,
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
  },
  map: { flex: 1 },
  content: { padding: 16, gap: 14, paddingBottom: 40 },
  statRow: { flexDirection: 'row', gap: 9 },
  stat: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 2,
  },
  statLabel: { fontSize: 11, color: colors.textMuted },
  statValue: { fontSize: 16, fontWeight: '500', color: colors.textPrimary },
  row: { flexDirection: 'row', gap: 11, alignItems: 'flex-start' },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 2 },
  remove: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
    marginTop: 6,
  },
  name: { fontSize: 14, fontWeight: '500', color: colors.textPrimary },
  meta: { fontSize: 12, color: colors.textSecondary },
  reason: { fontSize: 11, color: colors.textMuted },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.accent,
    paddingHorizontal: 20,
  },
  primaryOff: { opacity: 0.4 },
  primaryText: { fontSize: 14, fontWeight: '500', color: '#FFFFFF' },
  hint: {
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 16,
  },
});
