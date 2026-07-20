import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PlaceCard } from '../components/PlaceCard';
import type { Place } from '../domain/types';
import { haversineKm } from '../lib/geo';
import type { RootStackParamList, TabParamList } from '../navigation';
import { placesService } from '../services/places';
import { useTripStore } from '../store/useTripStore';
import { colors } from '../theme/colors';

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Saved'>,
  NativeStackScreenProps<RootStackParamList>
>;

/** The places picked for the day, as a plain list. Untick to remove. */
export function SavedScreen(_props: Props) {
  const startPlace = useTripStore((s) => s.startPlace);
  const selectedIds = useTripStore((s) => s.selectedPlaceIds);
  const togglePlace = useTripStore((s) => s.togglePlace);
  const [places, setPlaces] = useState<Place[]>([]);

  useEffect(() => {
    placesService.listPlaces().then(setPlaces);
  }, []);

  const saved = selectedIds
    .map((id) => places.find((p) => p.id === id))
    .filter((p): p is Place => !!p);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.title}>Saved</Text>
        <Text style={styles.context}>
          {saved.length > 0
            ? `${saved.length} place${saved.length === 1 ? '' : 's'} for your day`
            : 'Nothing saved yet'}
        </Text>
      </View>
      <FlatList
        data={saved}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => (
          <PlaceCard
            place={item}
            selected
            distanceKm={startPlace ? haversineKm(startPlace.location, item.location) : null}
            onPress={() => {}}
            onToggle={() => togglePlace(item.id)}
          />
        )}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <MaterialCommunityIcons
              name="bookmark-outline"
              size={22}
              color={colors.textMuted}
            />
            <Text style={styles.emptyText}>Places you add in Explore show up here</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 },
  title: { fontSize: 20, fontWeight: '500', color: colors.textPrimary },
  context: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  empty: { alignItems: 'center', gap: 6, paddingTop: 48 },
  emptyText: { fontSize: 13, color: colors.textMuted },
});
