import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AvatarStack } from '../components/Avatar';
import { CoverBlock } from '../components/CoverBlock';
import type { Trip } from '../domain/social';
import { formatTime } from '../lib/geo';
import type { RootStackParamList, TabParamList } from '../navigation';
import { tripsService } from '../services/trips';
import { useTripStore } from '../store/useTripStore';
import { colors } from '../theme/colors';

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Trips'>,
  NativeStackScreenProps<RootStackParamList>
>;

function kindLabel(t: Trip): string {
  if (t.clonedFromTitle) return 'Cloned';
  if (t.kind === 'multi') return `${t.stays?.length ?? 0} cities`;
  return 'Shared';
}

/**
 * Trips (Phases 2 & 4): quick actions (shared wishlist, plan with AI), today's
 * local day plan, and saved trips — shared day-outs and multi-stay journeys.
 * Clay stays in the tab bar; this is a browsing hub, no extra clay.
 */
export function TripsScreen({ navigation }: Props) {
  const startPlace = useTripStore((s) => s.startPlace);
  const selectedIds = useTripStore((s) => s.selectedPlaceIds);
  const dayStartMin = useTripStore((s) => s.dayStartMin);
  const hasPlan = startPlace !== null && selectedIds.length >= 2;
  const [trips, setTrips] = useState<Trip[]>([]);

  useEffect(() => {
    tripsService.listTrips().then(setTrips);
  }, []);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Trips</Text>

        <View style={styles.actions}>
          <QuickAction
            icon="bookmark-multiple-outline"
            label="Shared wishlist"
            sub="With your group"
            onPress={() => navigation.navigate('Wishlist')}
          />
          <QuickAction
            icon="creation"
            label="Plan with AI"
            sub="Describe your day"
            onPress={() => navigation.navigate('AiPlan')}
          />
        </View>

        <Text style={styles.sectionLabel}>Today's plan</Text>
        {hasPlan ? (
          <Pressable
            style={({ pressed }) => [styles.dayCard, pressed && styles.pressed]}
            onPress={() => navigation.navigate('Plan')}
          >
            <View style={styles.dayIcon}>
              <MaterialCommunityIcons name="routes" size={20} color={colors.positive} />
            </View>
            <View style={styles.dayBody}>
              <Text style={styles.dayName}>Your day out</Text>
              <Text style={styles.dayMeta}>
                {selectedIds.length} stops · from {startPlace.name} · leave {formatTime(dayStartMin)}
              </Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textMuted} />
          </Pressable>
        ) : (
          <View style={styles.dayEmpty}>
            <Text style={styles.dayEmptyText}>
              Save a few places in Explore and tap the map button to plan a day.
            </Text>
          </View>
        )}

        <Text style={styles.sectionLabel}>Your trips</Text>
        {trips.map((t) => (
          <Pressable
            key={t.id}
            style={({ pressed }) => [styles.tripCard, pressed && styles.pressed]}
            onPress={() => navigation.navigate('TripDetail', { tripId: t.id })}
          >
            <CoverBlock themes={t.coverThemes} height={62} radius={12} style={styles.thumb} />
            <View style={styles.tripBody}>
              <Text style={styles.tripName} numberOfLines={1}>
                {t.title}
              </Text>
              <Text style={styles.tripMeta} numberOfLines={1}>
                {t.city} · {t.dateLabel}
              </Text>
              <View style={styles.tripFooter}>
                <AvatarStack users={t.members} size={22} max={4} />
                <View style={styles.kindChip}>
                  <Text style={styles.kindText}>{kindLabel(t)}</Text>
                </View>
              </View>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function QuickAction({
  icon,
  label,
  sub,
  onPress,
}: {
  icon: any;
  label: string;
  sub: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={({ pressed }) => [styles.action, pressed && styles.pressed]} onPress={onPress}>
      <MaterialCommunityIcons name={icon} size={20} color={colors.textSecondary} />
      <Text style={styles.actionLabel}>{label}</Text>
      <Text style={styles.actionSub}>{sub}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  body: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 28 },
  title: { fontSize: 22, fontWeight: '500', color: colors.textPrimary },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  action: {
    flex: 1,
    gap: 3,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  actionLabel: { fontSize: 14, fontWeight: '500', color: colors.textPrimary, marginTop: 4 },
  actionSub: { fontSize: 12, color: colors.textMuted },
  sectionLabel: { fontSize: 13, fontWeight: '500', color: colors.textSecondary, paddingTop: 22, paddingBottom: 10 },
  dayCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: { backgroundColor: colors.surfaceAlt },
  dayIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.selectedWell,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayBody: { flex: 1 },
  dayName: { fontSize: 14, fontWeight: '500', color: colors.textPrimary },
  dayMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  dayEmpty: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  dayEmptyText: { fontSize: 13, lineHeight: 19, color: colors.textMuted },
  tripCard: {
    flexDirection: 'row',
    gap: 12,
    padding: 10,
    marginBottom: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  thumb: { width: 62 },
  tripBody: { flex: 1, justifyContent: 'center' },
  tripName: { fontSize: 15, fontWeight: '500', color: colors.textPrimary },
  tripMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  tripFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  kindChip: {
    backgroundColor: colors.surfaceInput,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  kindText: { fontSize: 11, fontWeight: '500', color: colors.textSecondary },
});
