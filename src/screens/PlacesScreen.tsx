import BottomSheet, { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
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
import type { Category, Place } from '../domain/types';
import { haversineKm } from '../lib/geo';
import type { RootStackParamList, TabParamList } from '../navigation';
import { placesService } from '../services/places';
import { useTripStore, useUiStore } from '../store/useTripStore';
import { categoryColors, categoryLabels, colors } from '../theme/colors';

/** Centered on SF proper, wide enough to show the bridge and the Mission. */
const BAY_AREA_REGION = {
  latitude: 37.772,
  longitude: -122.437,
  latitudeDelta: 0.1,
  longitudeDelta: 0.13,
};

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

  const [places, setPlaces] = useState<Place[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Category | null>(null);
  const mapRef = useRef<MapView>(null);
  const listRef = useRef<FlatList<Place>>(null);
  const sheetRef = useRef<BottomSheet>(null);

  useEffect(() => {
    placesService.listPlaces().then(setPlaces);
  }, []);

  const visiblePlaces = useMemo(() => {
    const q = query.trim().toLowerCase();
    return places.filter(
      (p) =>
        (!filter || p.categories.includes(filter)) &&
        (!q || p.name.toLowerCase().includes(q))
    );
  }, [places, query, filter]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const snapPoints = useMemo(() => ['30%', '55%', '88%'], []);

  const focusPlace = (p: Place) => {
    setHighlighted(p.id);
    mapRef.current?.animateToRegion(
      { ...p.location, latitudeDelta: 0.03, longitudeDelta: 0.03 },
      200
    );
  };

  const onMarkerPress = (p: Place) => {
    focusPlace(p);
    const index = visiblePlaces.findIndex((x) => x.id === p.id);
    if (index >= 0) {
      sheetRef.current?.snapToIndex(1);
      listRef.current?.scrollToIndex({ index, viewPosition: 0.15, animated: true });
    }
  };

  return (
    <View style={styles.screen}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={BAY_AREA_REGION}
        mapPadding={{ top: insets.top + 90, left: 0, right: 0, bottom: 240 }}
        onPress={() => setHighlighted(null)}
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
        {visiblePlaces.map((p) => {
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
                <CategoryPin categories={p.categories} size={size} />
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
            <MaterialCommunityIcons name="magnify" size={16} color={colors.textMuted} />
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
          <Text style={styles.sheetTitle}>Your day out</Text>
          <Text style={styles.sheetContext}>
            {selectedIds.length > 0
              ? `${selectedIds.length} of ${places.length} places selected`
              : 'Pick a few places, then tap the map button below to plan'}
          </Text>
        </View>
        <BottomSheetFlatList
          ref={listRef as never}
          data={visiblePlaces}
          keyExtractor={(p: Place) => p.id}
          getItemLayout={(_: unknown, index: number) => ({
            length: CARD_HEIGHT + CARD_GAP,
            offset: (CARD_HEIGHT + CARD_GAP) * index,
            index,
          })}
          renderItem={({ item }: { item: Place }) => (
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
            </View>
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
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  sheetTitle: { fontSize: 17, fontWeight: '500', color: colors.textPrimary },
  sheetContext: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  emptyWrap: { alignItems: 'center', gap: 6, paddingTop: 32 },
  emptyText: { fontSize: 13, color: colors.textMuted },
});
