import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RootStackParamList } from '../navigation';
import { useTripsStore } from '../store/useTripsStore';
import { colors } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'Trips'>;

/**
 * The shelf of multi-day trips (PRD Phase 4).
 *
 * A list and a way to start one — nothing else. Everything a trip *is*
 * happens on the trip's own screen, and everything a day is happens in the
 * planner. Local only: trips live on this device the way the diary does,
 * and nothing here touches a network.
 */
export function TripsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const trips = useTripsStore((s) => s.trips);
  const createTrip = useTripsStore((s) => s.createTrip);
  const [name, setName] = useState('');

  const create = () => {
    const trip = createTrip(name);
    setName('');
    navigation.navigate('Trip', { id: trip.id });
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <MaterialCommunityIcons
            name="chevron-left"
            size={26}
            color={colors.textSecondary}
          />
        </Pressable>
        <Text style={styles.title}>Trips</Text>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 28 },
        ]}
      >
        {trips.length === 0 && (
          <Text style={styles.body}>
            A trip is a few days planned together — each day is its own day
            out, with its own places and its own start. Name one to begin.
          </Text>
        )}

        {trips.map((t) => {
          const placeCount = t.days.reduce(
            (sum, d) => sum + d.placeIds.length,
            0
          );
          return (
            <Pressable
              key={t.id}
              style={styles.row}
              onPress={() => navigation.navigate('Trip', { id: t.id })}
              accessibilityRole="button"
              accessibilityLabel={`Open trip ${t.name}`}
            >
              <MaterialCommunityIcons
                name="bag-suitcase-outline"
                size={20}
                color={colors.textSecondary}
              />
              <View style={styles.rowText}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {t.name}
                </Text>
                <Text style={styles.rowMeta}>
                  {t.days.length} day{t.days.length === 1 ? '' : 's'} ·{' '}
                  {placeCount} place{placeCount === 1 ? '' : 's'}
                </Text>
              </View>
              <MaterialCommunityIcons
                name="chevron-right"
                size={20}
                color={colors.textMuted}
              />
            </Pressable>
          );
        })}

        <Text style={styles.sectionTitle}>Start a trip</Text>
        <View style={styles.addRow}>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Where to?"
            placeholderTextColor={colors.textMuted}
            returnKeyType="done"
            onSubmitEditing={() => name.trim() && create()}
          />
          <Pressable
            style={[styles.addBtn, !name.trim() && styles.addBtnOff]}
            disabled={!name.trim()}
            onPress={create}
            accessibilityRole="button"
            accessibilityLabel="Start this trip"
          >
            <Text style={styles.addBtnText}>Start</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 6,
  },
  title: { fontSize: 17, fontWeight: '500', color: colors.textPrimary },
  content: { padding: 16, gap: 12 },
  body: { fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: colors.surfaceAlt,
  },
  rowText: { flex: 1 },
  rowName: { fontSize: 15, fontWeight: '500', color: colors.textPrimary },
  rowMeta: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
    marginTop: 8,
  },
  addRow: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: colors.surfaceInput,
    fontSize: 14,
    color: colors.textPrimary,
  },
  addBtn: {
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  addBtnOff: { opacity: 0.4 },
  addBtnText: { fontSize: 14, fontWeight: '500', color: '#FFFFFF' },
});
