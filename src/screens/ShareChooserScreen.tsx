import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AvatarStack } from '../components/Avatar';
import { CoverBlock } from '../components/CoverBlock';
import { NavHeader } from '../components/NavHeader';
import type { Trip } from '../domain/social';
import type { Category, Place } from '../domain/types';
import type { RootStackParamList } from '../navigation';
import { placesService } from '../services/places';
import { tripsService } from '../services/trips';
import { useTripStore } from '../store/useTripStore';
import { colors } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'ShareChooser'>;

/**
 * Pick what to post to the feed (Phase 3 authoring entry). Lists the current
 * day plan and saved trips; each routes into Publish pre-filled. This is the
 * discoverable "post a plan" step off the Discover feed's compose button.
 */
export function ShareChooserScreen({ navigation }: Props) {
  const selectedIds = useTripStore((s) => s.selectedPlaceIds);
  const startPlace = useTripStore((s) => s.startPlace);
  const [places, setPlaces] = useState<Place[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);

  useEffect(() => {
    placesService.listPlaces().then(setPlaces);
    tripsService.listTrips().then(setTrips);
  }, []);

  const dayThemes = useMemo<Category[]>(() => {
    const byId = new Map(places.map((p) => [p.id, p]));
    const cats = selectedIds.flatMap((id) => byId.get(id)?.categories ?? []);
    return Array.from(new Set(cats)).slice(0, 2) as Category[];
  }, [places, selectedIds]);

  const hasDayPlan = startPlace !== null && selectedIds.length >= 2 && dayThemes.length > 0;

  const shareDay = () =>
    navigation.replace('Publish', {
      title: 'My day out',
      city: 'Tokyo',
      themes: dayThemes,
      stopIds: selectedIds,
    });

  const shareTrip = (t: Trip) =>
    navigation.replace('Publish', {
      title: t.title,
      city: t.stays?.[0]?.city ?? t.city,
      themes: t.coverThemes,
      stopIds: t.stays ? t.stays.flatMap((s) => s.placeIds) : t.placeIds,
    });

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <NavHeader title="Post a plan" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>Pick a plan to share to the feed.</Text>

        {hasDayPlan && (
          <>
            <Text style={styles.sectionLabel}>Your day plan</Text>
            <Pressable
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              onPress={shareDay}
            >
              <CoverBlock themes={dayThemes} height={54} radius={12} style={styles.thumb} />
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle}>Your day out</Text>
                <Text style={styles.rowMeta}>
                  {selectedIds.length} stops · from {startPlace.name}
                </Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textMuted} />
            </Pressable>
          </>
        )}

        <Text style={styles.sectionLabel}>Your trips</Text>
        {trips.map((t) => (
          <Pressable
            key={t.id}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            onPress={() => shareTrip(t)}
          >
            <CoverBlock themes={t.coverThemes} height={54} radius={12} style={styles.thumb} />
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {t.title}
              </Text>
              <Text style={styles.rowMeta} numberOfLines={1}>
                {t.city} · {t.dateLabel}
              </Text>
              <View style={styles.rowFooter}>
                <AvatarStack users={t.members} size={20} max={4} />
              </View>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textMuted} />
          </Pressable>
        ))}

        {!hasDayPlan && trips.length === 0 && (
          <View style={styles.empty}>
            <MaterialCommunityIcons name="map-outline" size={22} color={colors.textMuted} />
            <Text style={styles.emptyText}>
              Plan a day or save a trip first, then post it here.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  body: { paddingHorizontal: 16, paddingBottom: 28 },
  intro: { fontSize: 14, color: colors.textSecondary, paddingTop: 6 },
  sectionLabel: { fontSize: 13, fontWeight: '500', color: colors.textSecondary, paddingTop: 22, paddingBottom: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    marginBottom: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: { backgroundColor: colors.surfaceAlt },
  thumb: { width: 54 },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '500', color: colors.textPrimary },
  rowMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  rowFooter: { marginTop: 8 },
  empty: { alignItems: 'center', gap: 8, paddingTop: 40, paddingHorizontal: 30 },
  emptyText: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },
});
