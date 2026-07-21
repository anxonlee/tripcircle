import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar, AvatarStack } from '../components/Avatar';
import { CoverBlock } from '../components/CoverBlock';
import { IconTile } from '../components/IconTile';
import { StampCard } from '../components/StampCard';
import type { FeedPost, Trip, User } from '../domain/social';
import type { Place } from '../domain/types';
import { formatCount } from '../lib/format';
import type { RootStackParamList, TabParamList } from '../navigation';
import { passportStamps, sharedWishlistAdds } from '../services/mock/trips';
import { currentUser, users } from '../services/mock/users';
import { placesService } from '../services/places';
import { socialService } from '../services/social';
import { tripsService } from '../services/trips';
import { useSocialStore } from '../store/useSocialStore';
import { useTripStore } from '../store/useTripStore';
import { colors } from '../theme/colors';

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Profile'>,
  NativeStackScreenProps<RootStackParamList>
>;

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;
type Tab = 'plans' | 'trips' | 'passport' | 'wishlist';

const TABS: { key: Tab; icon: IconName }[] = [
  { key: 'plans', icon: 'view-grid-outline' },
  { key: 'trips', icon: 'routes' },
  { key: 'passport', icon: 'passport' },
  { key: 'wishlist', icon: 'bookmark-outline' },
];

/**
 * Your profile, IG-style (Phase 3): identity + stats + bio up top, then four
 * content tabs — Plans (your published day plans), Trips, Passport, Wishlist.
 * Settings moved to the gear top-left. No clay: the tab bar's center button is
 * the screen's single clay action, so profile controls stay neutral.
 */
export function ProfileScreen({ navigation }: Props) {
  const selectedIds = useTripStore((s) => s.selectedPlaceIds);
  const myPosts = useSocialStore((s) => s.myPosts);
  const [tab, setTab] = useState<Tab>('plans');
  const [seedPlans, setSeedPlans] = useState<FeedPost[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);

  useEffect(() => {
    socialService.listMyPlans().then(setSeedPlans);
    tripsService.listTrips().then(setTrips);
    placesService.listPlaces().then(setPlaces);
  }, []);

  const plans = useMemo(() => [...myPosts, ...seedPlans], [myPosts, seedPlans]);

  const wishlist = useMemo(() => {
    if (places.length === 0) return [];
    const byId = new Map(places.map((p) => [p.id, p]));
    const seen = new Set<string>();
    const out: { place: Place; by: User }[] = [];
    for (const id of selectedIds) {
      const place = byId.get(id);
      if (place && !seen.has(id)) {
        seen.add(id);
        out.push({ place, by: users.you });
      }
    }
    for (const a of sharedWishlistAdds) {
      const place = byId.get(a.placeId);
      if (place && !seen.has(a.placeId)) {
        seen.add(a.placeId);
        out.push({ place, by: users[a.addedById] });
      }
    }
    return out;
  }, [places, selectedIds]);

  const shareProfile = () => {
    Share.share({
      message: `Follow ${currentUser.name} (@${currentUser.handle}) on TripCircle`,
      url: `https://tripcircle.app/u/${currentUser.handle}`,
    }).catch(() => {});
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.navigate('Settings')} hitSlop={8} style={styles.topIcon}>
          <MaterialCommunityIcons name="cog-outline" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.topHandle}>@{currentUser.handle}</Text>
        <Pressable onPress={shareProfile} hitSlop={8} style={styles.topIcon}>
          <MaterialCommunityIcons name="share-variant-outline" size={20} color={colors.textPrimary} />
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
        <View style={styles.hero}>
          <Avatar user={currentUser} size={78} />
          <View style={styles.stats}>
            <Stat value={String(plans.length)} label="Plans" />
            <Stat value={formatCount(currentUser.followers ?? 0)} label="Followers" />
            <Stat value={formatCount(currentUser.following ?? 0)} label="Following" />
          </View>
        </View>
        <Text style={styles.name}>{currentUser.name}</Text>
        {currentUser.bio && <Text style={styles.bio}>{currentUser.bio}</Text>}

        <View style={styles.actionRow}>
          <View style={styles.actionBtn}>
            <MaterialCommunityIcons name="pencil-outline" size={15} color={colors.textSecondary} />
            <Text style={styles.actionText}>Edit profile</Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.actionBtn, pressed && styles.actionPressed]}
            onPress={shareProfile}
          >
            <MaterialCommunityIcons name="share-variant-outline" size={15} color={colors.textSecondary} />
            <Text style={styles.actionText}>Share profile</Text>
          </Pressable>
        </View>

        <View style={styles.tabStrip}>
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <Pressable key={t.key} style={styles.tabBtn} onPress={() => setTab(t.key)}>
                <MaterialCommunityIcons
                  name={t.icon}
                  size={22}
                  color={active ? colors.textPrimary : colors.textMuted}
                />
                <View style={[styles.tabUnderline, active && styles.tabUnderlineActive]} />
              </Pressable>
            );
          })}
        </View>

        {tab === 'plans' && (
          <PlansGrid plans={plans} onOpen={(id) => navigation.navigate('PostDetail', { postId: id })} />
        )}
        {tab === 'trips' && (
          <TripList trips={trips} onOpen={(id) => navigation.navigate('TripDetail', { tripId: id })} />
        )}
        {tab === 'passport' && <PassportTab />}
        {tab === 'wishlist' && (
          <WishlistTab items={wishlist} onOpenFull={() => navigation.navigate('Wishlist')} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function PlansGrid({ plans, onOpen }: { plans: FeedPost[]; onOpen: (id: string) => void }) {
  if (plans.length === 0) {
    return (
      <EmptyTab icon="view-grid-outline" text="Plans you publish show up here" />
    );
  }
  return (
    <View style={styles.grid}>
      {plans.map((p) => (
        <Pressable key={p.id} style={styles.tile} onPress={() => onOpen(p.id)}>
          <CoverBlock themes={p.themes} height={116} radius={12}>
            <View style={styles.tileScrim} />
            <View style={styles.tileText}>
              <Text style={styles.tileTitle} numberOfLines={2}>
                {p.title}
              </Text>
              <View style={styles.tileStat}>
                <MaterialCommunityIcons name="bookmark-outline" size={11} color={colors.textSecondary} />
                <Text style={styles.tileStatText}>{formatCount(p.saves)}</Text>
              </View>
            </View>
          </CoverBlock>
        </Pressable>
      ))}
    </View>
  );
}

function TripList({ trips, onOpen }: { trips: Trip[]; onOpen: (id: string) => void }) {
  if (trips.length === 0) return <EmptyTab icon="routes" text="Your trips show up here" />;
  return (
    <View style={styles.list}>
      {trips.map((t) => (
        <Pressable
          key={t.id}
          style={({ pressed }) => [styles.tripRow, pressed && styles.rowPressed]}
          onPress={() => onOpen(t.id)}
        >
          <CoverBlock themes={t.coverThemes} height={52} radius={12} style={styles.tripThumb} />
          <View style={styles.tripBody}>
            <Text style={styles.tripName} numberOfLines={1}>
              {t.title}
            </Text>
            <Text style={styles.tripMeta} numberOfLines={1}>
              {t.city} · {t.dateLabel}
            </Text>
            <View style={styles.tripFooter}>
              <AvatarStack users={t.members} size={20} max={4} />
            </View>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textMuted} />
        </Pressable>
      ))}
    </View>
  );
}

function PassportTab() {
  const cities = passportStamps.length;
  const days = passportStamps.reduce((s, x) => s + x.visits, 0);
  return (
    <View style={styles.tabContent}>
      <View style={styles.passportStats}>
        <Stat value={String(cities)} label="Cities" />
        <View style={styles.vline} />
        <Stat value={String(days)} label="Days out" />
        <View style={styles.vline} />
        <Stat value="47" label="Places saved" />
      </View>
      <View style={styles.stampGrid}>
        {passportStamps.map((s) => (
          <StampCard key={s.city} stamp={s} />
        ))}
      </View>
    </View>
  );
}

function WishlistTab({
  items,
  onOpenFull,
}: {
  items: { place: Place; by: User }[];
  onOpenFull: () => void;
}) {
  if (items.length === 0) return <EmptyTab icon="bookmark-outline" text="Saved places show up here" />;
  return (
    <View style={styles.tabContent}>
      {items.map(({ place, by }) => (
        <View key={place.id} style={styles.wishRow}>
          <IconTile categories={place.categories} size={38} />
          <View style={styles.wishBody}>
            <Text style={styles.wishName} numberOfLines={1}>
              {place.name}
            </Text>
            <Text style={styles.wishBy} numberOfLines={1}>
              Added by {by.id === 'you' ? 'you' : by.name}
            </Text>
          </View>
          <Avatar user={by} size={20} />
        </View>
      ))}
      <Pressable
        style={({ pressed }) => [styles.openFull, pressed && styles.rowPressed]}
        onPress={onOpenFull}
      >
        <Text style={styles.openFullText}>Open shared wishlist</Text>
        <MaterialCommunityIcons name="chevron-right" size={18} color={colors.textSecondary} />
      </Pressable>
    </View>
  );
}

function EmptyTab({ icon, text }: { icon: IconName; text: string }) {
  return (
    <View style={styles.empty}>
      <MaterialCommunityIcons name={icon} size={22} color={colors.textMuted} />
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    height: 44,
  },
  topIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  topHandle: { fontSize: 16, fontWeight: '500', color: colors.textPrimary },
  body: { paddingBottom: 28 },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 20,
  },
  stats: { flex: 1, flexDirection: 'row', justifyContent: 'space-around' },
  stat: { alignItems: 'center' },
  statValue: { fontSize: 18, fontWeight: '500', color: colors.textPrimary },
  statLabel: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  name: { fontSize: 15, fontWeight: '500', color: colors.textPrimary, paddingHorizontal: 16, paddingTop: 12 },
  bio: { fontSize: 13, lineHeight: 19, color: colors.textSecondary, paddingHorizontal: 16, paddingTop: 3 },
  actionRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 14 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  actionPressed: { backgroundColor: colors.surfaceAlt },
  actionText: { fontSize: 13, fontWeight: '500', color: colors.textSecondary },
  tabStrip: {
    flexDirection: 'row',
    marginTop: 18,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  tabBtn: { flex: 1, alignItems: 'center' },
  tabUnderline: { height: 2, alignSelf: 'stretch', marginTop: 10, backgroundColor: 'transparent' },
  tabUnderlineActive: { backgroundColor: colors.textPrimary },
  tabContent: { paddingHorizontal: 16, paddingTop: 16 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  tile: { width: '48%', marginBottom: 12 },
  tileScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 54,
    backgroundColor: 'rgba(0,0,0,0.03)',
  },
  tileText: { padding: 10 },
  tileTitle: { fontSize: 14, fontWeight: '500', color: colors.textPrimary },
  tileStat: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  tileStatText: { fontSize: 11, color: colors.textSecondary },
  list: { paddingHorizontal: 16, paddingTop: 14 },
  tripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    marginBottom: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowPressed: { backgroundColor: colors.surfaceAlt },
  tripThumb: { width: 52 },
  tripBody: { flex: 1 },
  tripName: { fontSize: 15, fontWeight: '500', color: colors.textPrimary },
  tripMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  tripFooter: { marginTop: 8 },
  passportStats: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: colors.surfaceAlt,
    marginBottom: 16,
  },
  vline: { width: 1, height: 30, backgroundColor: colors.borderStrong },
  stampGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  wishRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 9 },
  wishBody: { flex: 1 },
  wishName: { fontSize: 14, fontWeight: '500', color: colors.textPrimary },
  wishBy: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  openFull: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    marginTop: 12,
  },
  openFullText: { fontSize: 14, fontWeight: '500', color: colors.textSecondary },
  empty: { alignItems: 'center', gap: 8, paddingTop: 48, paddingHorizontal: 30 },
  emptyText: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },
});
