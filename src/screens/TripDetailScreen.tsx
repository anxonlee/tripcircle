import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '../components/Avatar';
import { CoverBlock } from '../components/CoverBlock';
import { IconTile } from '../components/IconTile';
import { NavHeader } from '../components/NavHeader';
import type { CostShare, Trip } from '../domain/social';
import type { Place } from '../domain/types';
import { formatYen } from '../lib/format';
import { inviteToTrip, shareTrip } from '../lib/share';
import type { RootStackParamList } from '../navigation';
import { placesService } from '../services/places';
import { tripsService } from '../services/trips';
import { categoryLabels, colors } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'TripDetail'>;

/**
 * Trip detail (Phases 2 & 4): members, the itinerary — a single day for shared
 * trips, or per-city stays for multi-stay journeys — and the cost-split entry.
 * Pushed over tabs, so it owns one clay action (Split the cost) when relevant.
 */
export function TripDetailScreen({ route, navigation }: Props) {
  const { tripId } = route.params;
  const [trip, setTrip] = useState<Trip | null>(null);
  const [byId, setById] = useState<Map<string, Place>>(new Map());
  const [shares, setShares] = useState<CostShare[]>([]);

  useEffect(() => {
    let alive = true;
    Promise.all([
      tripsService.getTrip(tripId),
      placesService.listPlaces(),
      tripsService.getCostShares(tripId),
    ]).then(([t, places, cs]) => {
      if (!alive) return;
      if (t) setTrip(t);
      setById(new Map(places.map((p) => [p.id, p])));
      setShares(cs);
    });
    return () => {
      alive = false;
    };
  }, [tripId]);

  if (!trip) return <SafeAreaView style={styles.screen} edges={['top']} />;

  const place = (id: string) => byId.get(id);
  const canSplit = shares.length > 0;
  const allStopIds = trip.stays
    ? trip.stays.flatMap((s) => s.placeIds)
    : trip.placeIds;
  const publishCity = trip.stays?.[0]?.city ?? trip.city;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <NavHeader
        title="Trip"
        onBack={() => navigation.goBack()}
        right={
          <Pressable onPress={() => shareTrip(trip)} hitSlop={8}>
            <MaterialCommunityIcons name="share-variant-outline" size={20} color={colors.textPrimary} />
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <CoverBlock themes={trip.coverThemes} height={140} style={styles.cover}>
          <View style={styles.coverText}>
            <Text style={styles.coverTitle}>{trip.title}</Text>
            <Text style={styles.coverMeta}>
              {trip.city} · {trip.dateLabel}
            </Text>
          </View>
        </CoverBlock>

        {trip.clonedFromTitle && (
          <View style={styles.clonedRow}>
            <MaterialCommunityIcons name="source-branch" size={14} color={colors.textMuted} />
            <Text style={styles.clonedText}>Cloned from {trip.clonedFromTitle}</Text>
          </View>
        )}

        <Text style={styles.sectionLabel}>Going ({trip.members.length})</Text>
        <View style={styles.members}>
          {trip.members.map((m) => (
            <View key={m.id} style={styles.member}>
              <Avatar user={m} size={22} />
              <Text style={styles.memberName}>{m.id === 'you' ? 'You' : m.name}</Text>
            </View>
          ))}
        </View>

        <View style={styles.actionRow}>
          <Pressable
            style={({ pressed }) => [styles.actionBtn, pressed && styles.actionPressed]}
            onPress={() =>
              navigation.navigate('Publish', {
                title: trip.title,
                city: publishCity,
                themes: trip.coverThemes,
                stopIds: allStopIds,
              })
            }
          >
            <MaterialCommunityIcons name="send-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.actionText}>Share to feed</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.actionBtn, pressed && styles.actionPressed]}
            onPress={() => inviteToTrip(trip.title, trip.id)}
          >
            <MaterialCommunityIcons name="account-plus-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.actionText}>Invite</Text>
          </Pressable>
        </View>

        {trip.stays ? (
          trip.stays.map((stay) => (
            <View key={stay.id}>
              <View style={styles.stayHead}>
                <Text style={styles.stayCity}>{stay.city}</Text>
                <Text style={styles.stayDate}>{stay.dateLabel}</Text>
              </View>
              {stay.placeIds.map((id) => {
                const p = place(id);
                return p ? <StopRow key={id} place={p} /> : null;
              })}
            </View>
          ))
        ) : (
          <View style={styles.stops}>
            <Text style={styles.sectionLabel}>The day ({trip.placeIds.length} stops)</Text>
            {trip.placeIds.map((id) => {
              const p = place(id);
              return p ? <StopRow key={id} place={p} /> : null;
            })}
          </View>
        )}
      </ScrollView>

      {canSplit && (
        <View style={styles.footer}>
          <View style={styles.footerTotal}>
            <Text style={styles.footerLabel}>Total spend</Text>
            <Text style={styles.footerValue}>{formatYen(trip.costYen)}</Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.splitBtn, pressed && styles.splitPressed]}
            onPress={() => navigation.navigate('CostSplit', { tripId: trip.id })}
          >
            <MaterialCommunityIcons name="cash-multiple" size={18} color="#FFFFFF" />
            <Text style={styles.splitText}>Split the cost</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

function StopRow({ place }: { place: Place }) {
  return (
    <View style={styles.stopRow}>
      <IconTile categories={place.categories} size={38} />
      <View style={styles.stopBody}>
        <Text style={styles.stopName} numberOfLines={1}>
          {place.name}
        </Text>
        <Text style={styles.stopMeta} numberOfLines={1}>
          {place.categories.map((c) => categoryLabels[c]).join(' · ')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  body: { paddingBottom: 24 },
  cover: { marginHorizontal: 16 },
  coverText: { padding: 14 },
  coverTitle: { fontSize: 21, fontWeight: '500', color: colors.textPrimary },
  coverMeta: { fontSize: 13, color: colors.textSecondary, marginTop: 3 },
  clonedRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingTop: 12 },
  clonedText: { fontSize: 12, color: colors.textMuted },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 10,
  },
  members: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16 },
  member: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 16,
    paddingLeft: 4,
    paddingRight: 12,
    paddingVertical: 4,
  },
  memberName: { fontSize: 13, fontWeight: '500', color: colors.textPrimary },
  actionRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 16 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  actionPressed: { backgroundColor: colors.surfaceAlt },
  actionText: { fontSize: 13, fontWeight: '500', color: colors.textSecondary },
  stayHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 22,
    paddingBottom: 10,
  },
  stayCity: { fontSize: 16, fontWeight: '500', color: colors.textPrimary },
  stayDate: { fontSize: 12, color: colors.textMuted },
  stops: {},
  stopRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 16, paddingVertical: 7 },
  stopBody: { flex: 1 },
  stopName: { fontSize: 14, fontWeight: '500', color: colors.textPrimary },
  stopMeta: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    borderTopWidth: 0.5,
    borderTopColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  footerTotal: { flex: 1 },
  footerLabel: { fontSize: 11, color: colors.textMuted },
  footerValue: { fontSize: 17, fontWeight: '500', color: colors.textPrimary, marginTop: 1 },
  splitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 48,
    paddingHorizontal: 20,
    borderRadius: 14,
    backgroundColor: colors.accent,
  },
  splitPressed: { opacity: 0.9 },
  splitText: { fontSize: 15, fontWeight: '500', color: '#FFFFFF' },
});
