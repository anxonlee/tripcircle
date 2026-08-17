import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { CompositeNavigationProp } from '@react-navigation/native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CategoryPin, PIN_ANCHOR, PinSlot, StartPin } from '../components/CategoryPin';
import { categoryIcon } from '../components/icons';
import { formatPlacePrice } from '../lib/format';
import { openStatus } from '../lib/openStatus';

import {
  SUGGESTION_HISTORY_THRESHOLD,
  distinctPlacesVisited,
  hasEnoughHistory,
  suggestDay,
} from '../lib/planner';
import type { CuratedPlace } from '../domain/types';
import type { RootStackParamList, TabParamList } from '../navigation';
import { placesService } from '../services/places';
import { SEED_REGION, bayAreaPlaces } from '../services/mock/bayAreaPlaces';
import { useDiaryStore } from '../store/useDiaryStore';
import { useFoundPlacesStore } from '../store/useFoundPlacesStore';
import { useMyPlacesStore } from '../store/useMyPlacesStore';
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
  // Subscribed so a place added or found mid-session lands here too.
  const myPlaces = useMyPlacesStore((s) => s.places);
  const foundPlaces = useFoundPlacesStore((s) => s.places);
  const dayStartMin = useTripStore((s) => s.dayStartMin);
  const homeByMin = useTripStore((s) => s.homeByMin);
  const suggestionBias = useTripStore((s) => s.suggestionBias);
  const togglePlace = useTripStore((s) => s.togglePlace);
  const dismissed = useUiStore((s) => s.dismissedPlaceIds);
  const dismissSuggestion = useUiStore((s) => s.dismissSuggestion);
  const visits = useDiaryStore((s) => s.visits);

  const enoughHistory = hasEnoughHistory(visits);

  /**
   * Suggestions are asked for, never volunteered — at any diary size. With no
   * plan yet the tab offers both ways to get one and lets the user say which;
   * deciding for them is what made the old screen feel like it had an opinion
   * about how you should travel.
   *
   * §3.3.0.1 gates the *automatic* path on four stamped places, so this is
   * stricter than the rule, not looser. What the threshold still changes is
   * what a suggestion is made of: above it the diary ranks, below it only the
   * dataset's own signals do — curation, price, hours, distance — and the
   * screen says which rather than dressing a guess up as personal.
   * `suggestDay` is already pure about this: ranking with a thin diary is a
   * meaningful thing to ask for, and the tests ask for it.
   */
  const [wantsSuggestion, setWantsSuggestion] = useState(false);

  /**
   * What the user chose in Explore, in the order they chose it. The planner
   * sequences this; it never adds to it or swaps anything out (§3.3.0).
   */
  /*
   * Resolved through the service, not the seed list. A place the user added
   * or found through search is not in that list, and reading it directly
   * dropped those stops silently: Explore counted four, this screen showed
   * three, and the missing one was the one they had gone looking for.
   */
  const [allPlaces, setAllPlaces] = useState<CuratedPlace[]>([]);
  useEffect(() => {
    placesService.listPlaces().then(setAllPlaces);
  }, [myPlaces, foundPlaces]);

  const selectedPlaces = useMemo(() => {
    const byId = new Map(allPlaces.map((p) => [p.id, p]));
    return selectedIds
      .map((id) => byId.get(id))
      .filter((p): p is CuratedPlace => p !== undefined);
  }, [allPlaces, selectedIds]);
  const hasSelection = selectedPlaces.length > 0;

  /**
   * A selection means no suggestions at all — not suggestions computed and
   * then hidden. Ranking 53 places to throw the result away would be waste,
   * and having the value in scope invites exactly the comparison §3.3.0
   * exists to forbid.
   */
  const suggestions = useMemo(
    () =>
      startPlace && wantsSuggestion && !hasSelection
        ? suggestDay(
            // A dismissed place is out of the running entirely, not filtered
            // from the result: dropping it after the fact would leave a short
            // day, where removing it first lets the next candidate take the
            // place and the day stay the size it was sized to be.
            // Suggestions stay on the curated set on purpose. Proposing a
            // place whose hours are a category guess is a different promise
            // from ordering places the user chose knowing what they are.
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
      wantsSuggestion,
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
   * No plan yet: two ways to get one, and the tab asks rather than picks.
   * Both routes stay one tap away — a screen whose only content is text
   * telling the user to be on a different tab is the worst-converting empty
   * state there is, and an auto-suggested day is the other failure, where the
   * tab has already decided for someone who wanted to choose.
   *
   * Choosing your own places stays the primary because it is the one that
   * always produces a day the user wants. The suggestion is secondary and its
   * caption says what it is made of — above the threshold the diary, below it
   * the map alone (§3.3.0.1), never a guess passed off as personal.
   */
  if (!hasSelection && !wantsSuggestion) {
    const visited = distinctPlacesVisited(visits);
    const remaining = SUGGESTION_HISTORY_THRESHOLD - visited;
    return (
      <View style={[styles.screen, styles.center, { paddingTop: insets.top }]}>
        <MaterialCommunityIcons
          name="map-marker-plus-outline"
          size={26}
          color={colors.textMuted}
        />
        <Text style={styles.emptyTitle}>
          {enoughHistory ? 'Plan a day out' : 'Days get built from where you have been'}
        </Text>
        <Text style={styles.emptyText}>
          {enoughHistory
            ? 'Pick the places you want and Plan will order them for you — or let it put a day together from where you have been.'
            : visited === 0
              ? `Stamp ${SUGGESTION_HISTORY_THRESHOLD} places you have visited and suggestions start coming from your diary. Until then, pick the places you want and Plan will order them for you.`
              : `${visited} place${visited === 1 ? '' : 's'} stamped. ${remaining} more and suggestions start coming from your diary. Until then, pick the places you want and Plan will order them for you.`}
        </Text>
        <Pressable
          style={styles.primary}
          onPress={() => navigation.navigate('Explore')}
        >
          <MaterialCommunityIcons name="compass-outline" size={16} color="#FFFFFF" />
          <Text style={styles.primaryText}>Find places</Text>
        </Pressable>
        <Pressable
          style={styles.secondary}
          onPress={() => setWantsSuggestion(true)}
        >
          <MaterialCommunityIcons
            name="lightbulb-outline"
            size={15}
            color={colors.textSecondary}
          />
          <Text style={styles.secondaryText}>Want a suggestion?</Text>
        </Pressable>
        <Text style={styles.secondaryHint}>
          {enoughHistory
            ? 'A day built around the places you have stamped.'
            : 'A starter day from the map — not from your diary yet.'}
        </Text>
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
        {/*
          Back goes wherever the day on screen came from: a suggestion came
          from the two options, a selection came from Explore. Neither throws
          anything away — going back to Explore keeps the selection, and the
          × on each row stays the only way to drop a place. An arrow that
          silently binned the user's own picks would be the one thing a back
          button must never be.
        */}
        <Pressable
          onPress={() =>
            hasSelection
              ? navigation.navigate('Explore')
              : setWantsSuggestion(false)
          }
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={
            hasSelection
              ? 'Back to Explore, keeping your places'
              : 'Back to how you want to plan'
          }
          style={styles.back}
        >
          <MaterialCommunityIcons
            name="chevron-left"
            size={22}
            color={colors.textSecondary}
          />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>
            {hasSelection ? 'Your places' : 'Plan a day out'}
          </Text>
          <Text style={styles.sub}>
            {/* A starter day is the map's judgement, not the diary's — say so. */}
            {hasSelection
              ? `${dayItems.length} chosen · from ${startPlace.name}`
              : enoughHistory
                ? `Suggestions · from ${startPlace.name}`
                : `A starter day · from ${startPlace.name}`}
          </Text>
        </View>
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
          /*
            The same open/closed line the Explore card shows, so a suggested
            day can be judged where it is offered. Without it the first honest
            word about opening times is an optimiser warning, which arrives
            after the day has been committed to — and half the records carry
            category-estimated hours, which is exactly what "usually" hedges.
          */
          const status = openStatus(s.place);
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
                  {s.place.district} · {s.place.visitDurationMin} min
                  {formatPlacePrice(s.place)
                    ? ` · ${formatPlacePrice(s.place)}`
                    : ''}
                </Text>
                <Text style={styles.status} numberOfLines={1}>
                  {status.open ? (
                    <>
                      <Text style={styles.statusOpen}>{status.label}</Text>
                      {status.text ? (
                        <Text style={styles.statusMuted}> · {status.text}</Text>
                      ) : null}
                    </>
                  ) : (
                    <Text style={styles.statusMuted}>{status.text}</Text>
                  )}
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
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  headerText: { flex: 1 },
  /*
    Sits on the title's line, not above it: the 30pt tap target is taller
    than the 17pt title, so it is pulled up by half the difference to put the
    chevron's centre on the title's centre rather than the block's. The
    negative left margin keeps the glyph optically at the 16pt margin — the
    icon carries its own bearing, so aligning the box would look indented.
  */
  back: {
    marginLeft: -7,
    marginRight: 1,
    marginTop: -4,
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  /*
    Closed reads muted, not as a warning, and deliberately: the status is
    against the clock right now, while the day may be planned for hours
    later. Arrival-time reasoning belongs to the optimiser, which already
    warns. Colouring "Opens 11:00" as a problem here would raise an alarm
    the screen cannot know is one.
  */
  status: { fontSize: 11, marginTop: 1 },
  statusOpen: { color: colors.positive, fontSize: 11, fontWeight: '500' },
  statusMuted: { color: colors.textMuted, fontSize: 11 },
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
  /** Secondary button (ui-guide §5) — bordered, not the clay primary. */
  secondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 10,
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  secondaryText: { fontSize: 13, fontWeight: '500', color: colors.textSecondary },
  secondaryHint: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  hint: {
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 16,
  },
});
