import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar, AvatarStack } from '../components/Avatar';
import { NavHeader } from '../components/NavHeader';
import { PlaceCard } from '../components/PlaceCard';
import type { User } from '../domain/social';
import type { Place } from '../domain/types';
import { haversineKm } from '../lib/geo';
import { inviteToTrip } from '../lib/share';
import type { RootStackParamList } from '../navigation';
import { sharedWishlistAdds, wishlistMembers } from '../services/mock/trips';
import { users } from '../services/mock/users';
import { placesService } from '../services/places';
import { useTripStore } from '../store/useTripStore';
import { colors } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'Wishlist'>;

interface WishItem {
  place: Place;
  addedBy: User;
}

/**
 * Shared wishlist (Phase 2): a collaborative list the group fills over time.
 * Each place shows who added it; the current user's own day picks are merged
 * in as "You". Ticking a place adds it to the day plan (the same day store).
 */
export function WishlistScreen({ navigation }: Props) {
  const startPlace = useTripStore((s) => s.startPlace);
  const selectedIds = useTripStore((s) => s.selectedPlaceIds);
  const togglePlace = useTripStore((s) => s.togglePlace);
  const [places, setPlaces] = useState<Place[]>([]);

  useEffect(() => {
    placesService.listPlaces().then(setPlaces);
  }, []);

  const items: WishItem[] = useMemo(() => {
    if (places.length === 0) return [];
    const byId = new Map(places.map((p) => [p.id, p]));
    const seen = new Set<string>();
    const out: WishItem[] = [];
    // Your own picks first, attributed to You.
    for (const id of selectedIds) {
      const place = byId.get(id);
      if (place && !seen.has(id)) {
        seen.add(id);
        out.push({ place, addedBy: users.you });
      }
    }
    // Then friends' adds.
    for (const add of sharedWishlistAdds) {
      const place = byId.get(add.placeId);
      if (place && !seen.has(add.placeId)) {
        seen.add(add.placeId);
        out.push({ place, addedBy: users[add.addedById] });
      }
    }
    return out;
  }, [places, selectedIds]);

  const members = wishlistMembers.map((id) => users[id]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <NavHeader title="Shared wishlist" onBack={() => navigation.goBack()} />

      <View style={styles.membersRow}>
        <AvatarStack users={members} size={28} max={5} />
        <Text style={styles.membersText}>
          {members.length} people · {items.length} places
        </Text>
        <Pressable
          style={styles.inviteBtn}
          hitSlop={6}
          onPress={() => inviteToTrip('Shared wishlist', 'wishlist')}
        >
          <MaterialCommunityIcons name="account-plus-outline" size={15} color={colors.textSecondary} />
          <Text style={styles.inviteText}>Invite</Text>
        </Pressable>
      </View>

      <FlatList
        data={items}
        keyExtractor={(it) => it.place.id}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <View style={styles.addedBy}>
              <Avatar user={item.addedBy} size={16} />
              <Text style={styles.addedByText}>
                Added by {item.addedBy.id === 'you' ? 'you' : item.addedBy.name}
              </Text>
            </View>
            <PlaceCard
              place={item.place}
              selected={selectedSet.has(item.place.id)}
              distanceKm={startPlace ? haversineKm(startPlace.location, item.place.location) : null}
              onPress={() => {}}
              onToggle={() => togglePlace(item.place.id)}
            />
          </View>
        )}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <MaterialCommunityIcons name="bookmark-multiple-outline" size={22} color={colors.textMuted} />
            <Text style={styles.emptyText}>Places the group saves land here</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  membersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 12,
  },
  membersText: { flex: 1, fontSize: 12, color: colors.textMuted },
  inviteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 14,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  inviteText: { fontSize: 12, fontWeight: '500', color: colors.textSecondary },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  item: { marginBottom: 2 },
  addedBy: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5 },
  addedByText: { fontSize: 11, color: colors.textMuted },
  empty: { alignItems: 'center', gap: 6, paddingTop: 60 },
  emptyText: { fontSize: 13, color: colors.textMuted },
});
