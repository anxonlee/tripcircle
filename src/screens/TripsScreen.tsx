import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatTime } from '../lib/geo';
import type { RootStackParamList, TabParamList } from '../navigation';
import { useTripStore } from '../store/useTripStore';
import { colors } from '../theme/colors';

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Trips'>,
  NativeStackScreenProps<RootStackParamList>
>;

/** Entry point to the current day plan. Multi-day trips arrive post-MVP. */
export function TripsScreen({ navigation }: Props) {
  const startPlace = useTripStore((s) => s.startPlace);
  const selectedIds = useTripStore((s) => s.selectedPlaceIds);
  const dayStartMin = useTripStore((s) => s.dayStartMin);
  const hasPlan = startPlace !== null && selectedIds.length >= 2;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.title}>Trips</Text>
        <Text style={styles.context}>
          {hasPlan ? 'One day planned' : 'No plans yet'}
        </Text>
      </View>
      {hasPlan ? (
        <Pressable
          style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
          onPress={() => navigation.navigate('Plan')}
        >
          <View style={styles.cardIcon}>
            <MaterialCommunityIcons name="routes" size={20} color={colors.textSecondary} />
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.cardName}>Your day out</Text>
            <Text style={styles.cardMeta}>
              {selectedIds.length} stops · from {startPlace.name} · leave{' '}
              {formatTime(dayStartMin)}
            </Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textMuted} />
        </Pressable>
      ) : (
        <View style={styles.empty}>
          <MaterialCommunityIcons name="routes" size={22} color={colors.textMuted} />
          <Text style={styles.emptyText}>Save a few places and plan a day to see it here</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 },
  title: { fontSize: 20, fontWeight: '500', color: colors.textPrimary },
  context: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  card: {
    marginHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardPressed: { backgroundColor: colors.surfaceAlt },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { flex: 1 },
  cardName: { fontSize: 14, fontWeight: '500', color: colors.textPrimary },
  cardMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  empty: { alignItems: 'center', gap: 6, paddingTop: 48 },
  emptyText: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
});
