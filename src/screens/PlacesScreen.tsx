import BottomSheet, { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { FlatList } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CategoryPin, PIN_ANCHOR, PinSlot, StartPin } from '../components/CategoryPin';
import { CARD_GAP, CARD_HEIGHT, PlaceCard } from '../components/PlaceCard';
import type { Category, CuratedPlace } from '../domain/types';
import { haversineKm } from '../lib/geo';
import type { RootStackParamList, TabParamList } from '../navigation';
import { placeSearchIsLive, placesService } from '../services/places';
import { useFoundPlacesStore } from '../store/useFoundPlacesStore';
import { useMyPlacesStore } from '../store/useMyPlacesStore';
import { useTripStore, useUiStore } from '../store/useTripStore';
import { categoryColors, categoryLabels, colors } from '../theme/colors';

/** Centered on SF proper, wide enough to show the bridge and the Mission. */
const BAY_AREA_REGION = {
  latitude: 37.772,
  longitude: -122.437,
  latitudeDelta: 0.1,
  longitudeDelta: 0.13,
};

/** Upper bound on simultaneously drawn map pins — see markerPlaces. */
const MAX_MARKERS = 120;

const FILTERS: Category[] = [
  'food',
  'historical',
  'shopping',
  'nature',
  'nightlife',
  'cafe',
];

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Explore'>,
  NativeStackScreenProps<RootStackParamList>
>;

/**
 * Explore — canonical map-top/sheet-bottom screen (ui-guide §4). Floating
 * search pill + single-select filter chips on the map; place cards in the
 * sheet; pin ↔ card linking both ways. The clay Plan day action lives in the
 * tab bar's center button; the start chip is the start-place identity.
 */
export function PlacesScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const startPlace = useTripStore((s) => s.startPlace);
  const selectedIds = useTripStore((s) => s.selectedPlaceIds);
  const togglePlace = useTripStore((s) => s.togglePlace);
  const highlightedId = useUiStore((s) => s.highlightedPlaceId);
  const setHighlighted = useUiStore((s) => s.setHighlighted);

  const [places, setPlaces] = useState<CuratedPlace[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Category | null>(null);
  /** Live provider results; null means "show the local list". */
  const [searchHits, setSearchHits] = useState<CuratedPlace[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [region, setRegion] = useState(BAY_AREA_REGION);
  const mapRef = useRef<MapView>(null);
  const listRef = useRef<FlatList<CuratedPlace>>(null);
  const sheetRef = useRef<BottomSheet>(null);

  /**
   * Subscribed to, not just read: adding a place should put it in this list
   * on the way back from the form, not on the next cold start. The service
   * reads the same store, so re-asking it is all that is needed.
   */
  const myPlaces = useMyPlacesStore((s) => s.places);
  const foundPlaces = useFoundPlacesStore((s) => s.places);
  useEffect(() => {
    placesService.listPlaces().then(setPlaces);
  }, [myPlaces, foundPlaces]);

  /**
   * With a live provider, typing searches the real POI index (debounced) so
   * friends can add any Bay Area spot, not just the curated set. Without one,
   * the same box filters the seed list locally.
   */
  useEffect(() => {
    const q = query.trim();
    if (!placeSearchIsLive || q.length < 2) {
      setSearchHits(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    let alive = true;
    const t = setTimeout(async () => {
      const hits = await placesService.searchPlaces(q, startPlace?.location);
      if (!alive) return;
      setSearchHits(hits);
      setSearching(false);
    }, 350);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [query, startPlace]);

  const visiblePlaces = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = searchHits ?? places;
    return base.filter(
      (p) =>
        (!filter || p.themes.includes(filter)) &&
        // Live hits are already matched server-side; only filter locally.
        (searchHits !== null || !q || p.name.toLowerCase().includes(q))
    );
  }, [places, searchHits, query, filter]);

  /**
   * The catalogue is ~500 places; rendering every one as a Marker makes the
   * map unusable. Draw only what's in view, capped, and always keep the
   * selected and highlighted pins regardless of where the camera is.
   */
  const markerPlaces = useMemo(() => {
    const selected = new Set(selectedIds);
    const inView = visiblePlaces.filter((p) => {
      if (selected.has(p.id) || p.id === highlightedId) return true;
      return (
        Math.abs(p.location.latitude - region.latitude) <= region.latitudeDelta / 2 &&
        Math.abs(p.location.longitude - region.longitude) <= region.longitudeDelta / 2
      );
    });
    if (inView.length <= MAX_MARKERS) return inView;
    // Too dense to draw: keep the ones nearest the middle of the screen.
    return [...inView]
      .sort(
        (a, b) =>
          haversineKm(a.location, region) - haversineKm(b.location, region)
      )
      .slice(0, MAX_MARKERS);
  }, [visiblePlaces, region, selectedIds, highlightedId]);

  /**
   * The list in three bands: the tapped pin, then the day being built, then
   * everything else.
   *
   * A tapped dot has to put its card where the user can reach it, and at the
   * sheet stops where the map is worth tapping only about one card shows.
   * Sorting is the only move that survives the sheet's locked scroller.
   *
   * The chosen places sit under it because they are the thing being made:
   * the list is 441 long, and a day you have half-built should not need
   * scrolling to find. It costs a card jumping to the top the moment it is
   * ticked, which is movement under the finger that just tapped — accepted,
   * because the alternative is picks scattered through 441 rows.
   *
   * Sort is stable, so each band keeps the order it already had rather than
   * resequencing by when things were picked. Selection order does carry
   * meaning — the planner treats it as the user's own arrangement — but
   * reordering the list as someone taps would move cards they were not
   * touching.
   */
  const listData = useMemo(() => {
    const selected = new Set(selectedIds);
    if (!highlightedId && selected.size === 0) return visiblePlaces;
    const band = (p: CuratedPlace) =>
      p.id === highlightedId ? 0 : selected.has(p.id) ? 1 : 2;
    return [...visiblePlaces].sort((a, b) => band(a) - band(b));
  }, [visiblePlaces, highlightedId, selectedIds]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const snapPoints = useMemo(() => ['30%', '55%', '88%'], []);

  const focusPlace = (p: CuratedPlace) => {
    setHighlighted(p.id);
    mapRef.current?.animateToRegion(
      { ...p.location, latitudeDelta: 0.03, longitudeDelta: 0.03 },
      200
    );
  };

  /**
   * Set by a pin tap, read by the map's own press handler.
   *
   * iOS delivers the background press as well as the marker's when a marker
   * draws its own children, so clearing the highlight there wiped the name
   * chip in the same frame it appeared: tapping a dot moved the map and told
   * you nothing. The pin's tap wins, and the flag is dropped immediately so
   * the next press on open map still clears.
   */
  const pinTapped = useRef(false);

  const onMapPress = () => {
    if (pinTapped.current) {
      pinTapped.current = false;
      return;
    }
    setHighlighted(null);
  };

  /**
   * Tapping a dot answers "what is this?" and offers "add it" — the name on
   * the pin, and the place's own card brought under it.
   *
   * The sheet drops to its shortest stop first: at the middle stop it covers
   * the point the pin's name chip hangs in, so the answer to "what is this?"
   * arrives underneath the thing asking.
   *
   * The card is brought to the user by sorting, not by scrolling. This sheet
   * locks its own scroller at every stop below the tallest — that is how it
   * hands the drag gesture back to the sheet — so `scrollToIndex` is inert
   * at exactly the heights where the map is visible enough to tap a pin at
   * all. It reported a valid ref and a real function and moved nothing.
   */
  const onMarkerPress = (p: CuratedPlace) => {
    pinTapped.current = true;
    focusPlace(p);
    sheetRef.current?.snapToIndex(0);
  };

  return (
    <View style={styles.screen}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={BAY_AREA_REGION}
        mapPadding={{ top: insets.top + 90, left: 0, right: 0, bottom: 240 }}
        onPress={onMapPress}
        onRegionChangeComplete={setRegion}
      >
        {startPlace && (
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
        )}
        {markerPlaces.map((p) => {
          const daySelected = selectedSet.has(p.id);
          const highlighted = highlightedId === p.id;
          const base = daySelected ? 28 : 24;
          const size = highlighted ? Math.round(base * 1.25) : base;
          return (
            <Marker
              key={`${p.id}-${daySelected ? 1 : 0}-${highlighted ? 1 : 0}`}
              coordinate={p.location}
              anchor={PIN_ANCHOR}
              tracksViewChanges={false}
              zIndex={highlighted ? 30 : daySelected ? 5 : 1}
              onPress={() => onMarkerPress(p)}
            >
              <PinSlot label={highlighted ? p.name : undefined}>
                <CategoryPin categories={p.themes} size={size} />
              </PinSlot>
            </Marker>
          );
        })}
      </MapView>

      <View style={[styles.floatTop, { top: insets.top + 8 }]}>
        <View style={styles.searchRow}>
          {startPlace && (
            <Pressable style={styles.startChip} onPress={() => navigation.navigate('Setup')}>
              <MaterialCommunityIcons name="home" size={14} color={colors.accent} />
              <Text style={styles.startChipText} numberOfLines={1}>
                {startPlace.name}
              </Text>
            </Pressable>
          )}
          <View style={styles.searchPill}>
            {searching ? (
              <ActivityIndicator size="small" color={colors.textMuted} />
            ) : (
              <MaterialCommunityIcons name="magnify" size={16} color={colors.textMuted} />
            )}
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Search places"
              placeholderTextColor={colors.textMuted}
              autoCorrect={false}
            />
          </View>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          <FilterChip
            label="All"
            color={colors.positive}
            active={filter === null}
            onPress={() => setFilter(null)}
          />
          {FILTERS.map((c) => (
            <FilterChip
              key={c}
              label={categoryLabels[c]}
              color={categoryColors[c]}
              showDot
              active={filter === c}
              onPress={() => setFilter(filter === c ? null : c)}
            />
          ))}
        </ScrollView>
      </View>

      <BottomSheet
        ref={sheetRef}
        index={1}
        snapPoints={snapPoints}
        backgroundStyle={styles.sheet}
        handleIndicatorStyle={styles.handle}
      >
        <View style={styles.sheetHeader}>
          <View style={styles.sheetHeaderText}>
            <Text style={styles.sheetTitle}>Your day out</Text>
            <Text style={styles.sheetContext} numberOfLines={1}>
              {/*
                The old copy sent people to "the map button below to plan",
                which is the tab bar's centre button — and that one stamps a
                visit. It named a route that never existed.
              */}
              {selectedIds.length === 0
                ? 'Pick a couple of places and plan the day here'
                : selectedIds.length === 1
                  ? `1 of ${places.length} selected · one more to plan`
                  : `${selectedIds.length} of ${places.length} places selected`}
            </Text>
          </View>
          {/*
            Planning finishes where choosing finishes. The day was reachable
            only by leaving for the Plan tab and pressing its button, which
            is a second screen asking the same question the user has already
            answered here.

            Two, because the optimiser has nothing to order with one stop —
            the same floor the Plan tab enforces. Below that the button is
            absent rather than disabled: a control that cannot be pressed
            says less than the line beside it, which names what is missing.
          */}
          {selectedIds.length >= 2 && (
            <Pressable
              style={styles.planBtn}
              onPress={() => navigation.navigate('Tabs', { screen: 'Plan' })}
              accessibilityRole="button"
              accessibilityLabel={`Plan the day with your ${selectedIds.length} places`}
            >
              <MaterialCommunityIcons name="map-outline" size={15} color="#FFFFFF" />
              <Text style={styles.planBtnText}>Plan {selectedIds.length}</Text>
            </Pressable>
          )}
        </View>
        <BottomSheetFlatList
          ref={listRef as never}
          data={listData}
          keyExtractor={(p: CuratedPlace) => p.id}
          getItemLayout={(_: unknown, index: number) => ({
            length: CARD_HEIGHT + CARD_GAP,
            offset: (CARD_HEIGHT + CARD_GAP) * index,
            index,
          })}
          renderItem={({ item }: { item: CuratedPlace }) => (
            <PlaceCard
              place={item}
              selected={selectedSet.has(item.id)}
              highlighted={highlightedId === item.id}
              distanceKm={
                startPlace ? haversineKm(startPlace.location, item.location) : null
              }
              onPress={() => focusPlace(item)}
              onToggle={() => togglePlace(item.id)}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <MaterialCommunityIcons
                name="map-search-outline"
                size={22}
                color={colors.textMuted}
              />
              <Text style={styles.emptyText}>No places match</Text>
              {/*
                The best moment to offer this is the one where the app has
                just admitted it does not know somewhere. Searching for your
                own café and being told "no places match" used to be the end
                of the road.
              */}
              <Pressable
                style={styles.addBtn}
                onPress={() => navigation.navigate('AddPlace')}
                accessibilityRole="button"
              >
                <MaterialCommunityIcons
                  name="plus"
                  size={15}
                  color={colors.textPrimary}
                />
                <Text style={styles.addBtnText}>Add it yourself</Text>
              </Pressable>
            </View>
          }
          ListFooterComponent={
            listData.length > 0 ? (
              <Pressable
                style={styles.addRow}
                onPress={() => navigation.navigate('AddPlace')}
                accessibilityRole="button"
                accessibilityLabel="Add a place of your own"
              >
                <MaterialCommunityIcons
                  name="map-marker-plus-outline"
                  size={16}
                  color={colors.textSecondary}
                />
                <Text style={styles.addRowText}>
                  Somewhere missing? Add it yourself
                </Text>
              </Pressable>
            ) : null
          }
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: insets.bottom + 24,
          }}
        />
      </BottomSheet>
    </View>
  );
}

function FilterChip({
  label,
  color,
  showDot = false,
  active,
  onPress,
}: {
  label: string;
  /** Category color for category chips; positive for "All". */
  color: string;
  showDot?: boolean;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.filterChip, active && { backgroundColor: color }]}
    >
      {showDot && !active && (
        <View style={[styles.filterDot, { backgroundColor: color }]} />
      )}
      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  floatTop: { position: 'absolute', left: 0, right: 0 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  startChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.surface,
    borderRadius: 24,
    paddingHorizontal: 12,
    height: 40,
    maxWidth: 170,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  startChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textPrimary,
    flexShrink: 1,
  },
  searchPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderRadius: 24,
    paddingHorizontal: 12,
    height: 40,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  searchInput: { flex: 1, fontSize: 13, color: colors.textPrimary },
  chipsRow: {
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingHorizontal: 11,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  filterDot: { width: 7, height: 7, borderRadius: 3.5 },
  filterChipText: { fontSize: 11, fontWeight: '500', color: colors.textSecondary },
  filterChipTextActive: { color: '#FFFFFF' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  handle: { backgroundColor: colors.borderStrong, width: 36, height: 4 },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  sheetHeaderText: { flex: 1 },
  sheetTitle: { fontSize: 17, fontWeight: '500', color: colors.textPrimary },
  sheetContext: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  /* Clay, because it is the one thing on this screen that finishes the job. */
  planBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: colors.accent,
  },
  planBtnText: { fontSize: 13, fontWeight: '500', color: '#FFFFFF' },
  emptyWrap: { alignItems: 'center', gap: 6, paddingTop: 32 },
  emptyText: { fontSize: 13, color: colors.textMuted },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    marginTop: 6,
  },
  addBtnText: { fontSize: 13, fontWeight: '500', color: colors.textPrimary },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    height: 48,
    marginTop: 4,
  },
  addRowText: { fontSize: 13, color: colors.textSecondary },
});
